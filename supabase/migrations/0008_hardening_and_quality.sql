-- MDvoro Phase 6.1: production hardening, authoritative flashcards, atomic taxonomy and safer delivery.
-- This migration is intentionally additive and can be applied after 0007.

-- Prevent anonymous access to application RPCs and internal content projections.
revoke execute on all functions in schema public from anon;
revoke all on public.question_public from anon;

-- Fix trigger-created profiles for direct auth metadata with short names.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(left(coalesce(new.raw_user_meta_data->>'full_name',''),80), '');
begin
  if v_name is not null and char_length(v_name) < 2 then v_name := null; end if;
  insert into public.profiles(id, full_name) values (new.id, v_name)
  on conflict (id) do nothing;
  return new;
end; $$;

-- Taxonomy integrity: unique slugs at each level, including top-level nodes.
create unique index if not exists taxonomy_nodes_root_slug_uidx
  on public.taxonomy_nodes(slug) where parent_id is null;

-- One atomic RPC replaces delete+insert client writes.
create or replace function public.set_question_taxonomy(p_question_id uuid, p_taxonomy_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_content() then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.questions where id = p_question_id) then raise exception 'question_not_found'; end if;
  if coalesce(array_length(p_taxonomy_ids,1),0) > 30 then raise exception 'too_many_taxonomy_nodes'; end if;
  if exists(select 1 from unnest(coalesce(p_taxonomy_ids,'{}')) x where not exists(select 1 from public.taxonomy_nodes t where t.id=x)) then
    raise exception 'taxonomy_not_found';
  end if;
  delete from public.question_taxonomy where question_id = p_question_id;
  insert into public.question_taxonomy(question_id,taxonomy_id,is_primary)
  select p_question_id, x, row_number() over () = 1
  from unnest(coalesce(p_taxonomy_ids,'{}')) x;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'question',p_question_id,'taxonomy_updated',jsonb_build_object('taxonomy_ids',p_taxonomy_ids));
end; $$;
revoke all on function public.set_question_taxonomy(uuid,uuid[]) from public;
grant execute on function public.set_question_taxonomy(uuid,uuid[]) to authenticated;

-- Atomic, server-authoritative flashcard creation. Direct table writes are revoked below.
create or replace function public.create_flashcard(
  p_deck_id uuid,
  p_front text,
  p_back text,
  p_card_type text default 'basic',
  p_tags text[] default '{}',
  p_source_question_id uuid default null,
  p_knowledge_id uuid default null
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if p_deck_id is not null and not exists(select 1 from public.flashcard_decks where id=p_deck_id and owner_id=auth.uid()) then raise exception 'deck_not_found'; end if;
  if char_length(trim(p_front)) < 1 or char_length(p_front) > 10000 then raise exception 'invalid_front'; end if;
  if char_length(trim(p_back)) < 1 or char_length(p_back) > 20000 then raise exception 'invalid_back'; end if;
  if p_card_type not in ('basic','cloze','image_occlusion','clinical','rapid_recall') then raise exception 'invalid_card_type'; end if;
  insert into public.flashcards(owner_id,deck_id,front,back,card_type,tags,source_question_id,knowledge_id)
  values(auth.uid(),p_deck_id,trim(p_front),trim(p_back),p_card_type,coalesce(p_tags,'{}'),p_source_question_id,p_knowledge_id)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.create_flashcard(uuid,text,text,text,text[],uuid,uuid) from public;
grant execute on function public.create_flashcard(uuid,text,text,text,text[],uuid,uuid) to authenticated;

create or replace function public.create_flashcard_deck(p_name text, p_exam_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if char_length(trim(p_name)) < 1 or char_length(trim(p_name)) > 160 then raise exception 'invalid_deck_name'; end if;
  if p_exam_id is not null and not exists(select 1 from public.exams where id=p_exam_id) then raise exception 'exam_not_found'; end if;
  insert into public.flashcard_decks(owner_id,exam_id,name) values(auth.uid(),p_exam_id,trim(p_name)) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.create_flashcard_deck(text,uuid) from public;
grant execute on function public.create_flashcard_deck(text,uuid) to authenticated;

-- Only the review RPC may mutate scheduling state or create review events.
revoke insert, update, delete on public.flashcards from authenticated;
revoke insert, update, delete on public.flashcard_decks from authenticated;
revoke insert on public.flashcard_reviews from authenticated;

-- Direct RPC callers receive the same server-side rate limit as the HTTP route.
create or replace function public.review_flashcard(
  p_flashcard_id uuid, p_rating smallint, p_duration_ms integer default null
)
returns table(card_id uuid,due_at timestamptz,interval_days numeric,ease_factor numeric,repetitions integer,lapse_count integer,stability_days numeric,difficulty numeric,next_bucket text)
language plpgsql security definer set search_path=public as $$
declare
  v_card public.flashcards%rowtype;
  v_interval numeric(10,2); v_ease numeric(5,2); v_reps integer; v_lapses integer;
  v_stability numeric(10,2); v_difficulty numeric(5,2); v_due timestamptz; v_bucket text;
  v_user uuid := auth.uid(); v_allowed boolean;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  select public.consume_rate_limit('flashcard_review',180,60) into v_allowed;
  if not v_allowed then raise exception 'rate_limited'; end if;
  if p_rating < 0 or p_rating > 4 then raise exception 'invalid_rating'; end if;
  if p_duration_ms is not null and (p_duration_ms < 0 or p_duration_ms > 3600000) then raise exception 'invalid_duration'; end if;
  select * into v_card from public.flashcards where id=p_flashcard_id and owner_id=v_user for update;
  if not found then raise exception 'card_not_found'; end if;
  if v_card.suspended then raise exception 'card_suspended'; end if;

  v_interval := greatest(v_card.interval_days,0); v_ease := v_card.ease_factor; v_reps := v_card.repetitions;
  v_lapses := v_card.lapse_count; v_stability := v_card.stability_days; v_difficulty := v_card.difficulty;

  if p_rating=0 then
    v_lapses:=v_lapses+1; v_reps:=0;
    v_stability:=greatest(0.5,v_stability*0.55); v_difficulty:=least(10,v_difficulty+0.8); v_ease:=greatest(1.3,v_ease-0.2);
    v_interval:=case when v_card.learning_step=0 then 0.007 else 0.04 end;
    v_due:=now()+case when v_card.learning_step=0 then interval '10 minutes' else interval '1 hour' end; v_bucket:='again';
  elsif p_rating=1 then
    v_reps:=v_reps+1; v_difficulty:=least(10,v_difficulty+0.25); v_ease:=greatest(1.3,v_ease-0.1);
    v_stability:=greatest(1,v_stability*1.35+0.5); v_interval:=greatest(0.08,v_stability*0.55);
    v_due:=now()+make_interval(secs=>greatest(3600,round(v_interval*86400)::integer)); v_bucket:='hard';
  elsif p_rating=2 then
    v_reps:=v_reps+1; v_stability:=greatest(1,v_stability*(1.85+(10-v_difficulty)*0.035)+0.75);
    v_interval:=least(3650,greatest(0.17,v_stability)); v_due:=now()+make_interval(secs=>greatest(3600,round(v_interval*86400)::integer)); v_bucket:='good';
  elsif p_rating=3 then
    v_reps:=v_reps+1; v_difficulty:=greatest(1,v_difficulty-0.35); v_ease:=least(4,v_ease+0.1);
    v_stability:=greatest(1,v_stability*2.65+1.25); v_interval:=least(3650,greatest(0.5,v_stability*1.15));
    v_due:=now()+make_interval(secs=>greatest(3600,round(v_interval*86400)::integer)); v_bucket:='easy';
  else
    v_reps:=v_reps+1; v_difficulty:=greatest(1,v_difficulty-0.55); v_ease:=least(4,v_ease+0.18);
    v_stability:=greatest(1,v_stability*3.2+2); v_interval:=least(3650,greatest(0.75,v_stability*1.25));
    v_due:=now()+make_interval(secs=>greatest(3600,round(v_interval*86400)::integer)); v_bucket:='perfect';
  end if;

  update public.flashcards set due_at=v_due,interval_days=round(v_interval,2),ease_factor=round(v_ease,2),repetitions=v_reps,
    lapse_count=v_lapses,stability_days=round(v_stability,2),difficulty=round(v_difficulty,2),learning_step=case when p_rating=0 then v_card.learning_step+1 else 0 end,last_reviewed_at=now(),updated_at=now()
  where id=v_card.id;
  insert into public.flashcard_reviews(user_id,flashcard_id,rating,duration_ms) values(v_user,v_card.id,p_rating,p_duration_ms);
  return query select v_card.id,v_due,round(v_interval,2),round(v_ease,2),v_reps,v_lapses,round(v_stability,2),round(v_difficulty,2),v_bucket;
end; $$;
revoke all on function public.review_flashcard(uuid,smallint,integer) from public;
grant execute on function public.review_flashcard(uuid,smallint,integer) to authenticated;

-- Student-safe media text: internal titles must never be sent as answer-revealing labels.
alter table public.media_assets add column if not exists student_alt_text text;
update public.media_assets set student_alt_text=coalesce(nullif(student_alt_text,''), 'Medical image') where student_alt_text is null or student_alt_text='';

-- Adaptive question delivery: prefer unseen questions, then weak/old questions, avoiding random full-table scans.
create or replace function public.get_next_question(p_exam_id uuid default null,p_subject text default null,p_topic text default null)
returns table(id uuid,content_code text,exam_id uuid,stem text,subject text,topic text,options jsonb,difficulty smallint,media jsonb)
language plpgsql volatile security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  return query
  with candidates as (
    select q.*,
      exists(select 1 from public.question_attempts a where a.user_id=auth.uid() and a.question_id=q.id) as seen,
      coalesce((select avg(case when a.is_correct then 1 else 0 end) from public.question_attempts a where a.user_id=auth.uid() and a.question_id=q.id),0.5) as accuracy,
      coalesce((select max(a.created_at) from public.question_attempts a where a.user_id=auth.uid() and a.question_id=q.id),timestamp 'epoch') as last_seen
    from public.questions q
    where q.is_published=true and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (p_exam_id is null or q.exam_id=p_exam_id)
      and (p_subject is null or p_subject='' or q.subject=p_subject)
      and (p_topic is null or p_topic='' or q.topic=p_topic)
  ), picked as (
    select * from candidates order by seen asc, accuracy asc, last_seen asc, difficulty desc, updated_at desc limit 1
  )
  select p.id,p.content_code,p.exam_id,p.stem,p.subject,p.topic,p.options,p.difficulty,
    coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'student_alt_text',coalesce(m.student_alt_text,'Medical image'),'external_url',m.external_url,'storage_path',m.storage_path,'caption',qm.caption,'position',qm.position) order by qm.position)
      from public.question_media qm join public.media_assets m on m.id=qm.media_id where qm.question_id=p.id),'[]'::jsonb)
  from picked p;
end; $$;
revoke all on function public.get_next_question(uuid,text,text) from public;
grant execute on function public.get_next_question(uuid,text,text) to authenticated;

create index if not exists question_attempts_user_question_created_idx on public.question_attempts(user_id,question_id,created_at desc);
create index if not exists questions_delivery_idx on public.questions(exam_id,subject,topic,workflow_status,is_published,access_tier);

-- Make the unused SECURITY DEFINER public view inaccessible. Application delivery uses get_next_question.
revoke all on public.question_public from anon;
revoke select on public.question_public from authenticated;


-- Separation of duties: a content creator cannot approve their own latest version.
create or replace function public.review_question(p_question_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_version_id uuid; v_creator uuid;
begin
  if not public.can_review_content() then raise exception 'forbidden'; end if;
  if p_decision not in ('approved','changes_requested','rejected') then raise exception 'invalid_decision'; end if;
  select id,created_by into v_version_id,v_creator from public.question_versions where question_id=p_question_id order by version_no desc limit 1;
  if v_version_id is null then raise exception 'version_not_found'; end if;
  if v_creator=auth.uid() then raise exception 'self_review_forbidden'; end if;
  if not exists(select 1 from public.questions where id=p_question_id and workflow_status='in_review') then raise exception 'question_not_in_review'; end if;
  insert into public.content_reviews(question_id,version_id,reviewer_id,decision,note) values(p_question_id,v_version_id,auth.uid(),p_decision,p_note);
  if p_decision='approved' then
    update public.questions q set stem=v.stem,subject=v.subject,topic=v.topic,options=v.options,answer_key=v.answer_key,explanation=v.explanation,difficulty=v.difficulty,is_published=true,workflow_status='published'
    from public.question_versions v where q.id=p_question_id and v.id=v_version_id;
  elsif p_decision='changes_requested' then update public.questions set is_published=false,workflow_status='draft' where id=p_question_id;
  else update public.questions set is_published=false,workflow_status='archived' where id=p_question_id;
  end if;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'question',p_question_id,'reviewed',jsonb_build_object('decision',p_decision,'version_id',v_version_id));
end; $$;
revoke all on function public.review_question(uuid,text,text) from public;
grant execute on function public.review_question(uuid,text,text) to authenticated;

-- AI job state and reviewer decisions are server-controlled; clients cannot forge lifecycle fields or payloads.
revoke insert, update, delete on public.content_generation_jobs from authenticated;
revoke insert, update, delete on public.ai_content_suggestions from authenticated;
revoke all on function public.review_ai_suggestion(uuid,text,text) from public;
grant execute on function public.review_ai_suggestion(uuid,text,text) to authenticated;

create or replace function public.complete_ai_generation_job(p_job_id uuid,p_suggestion_type text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_suggestion uuid; v_question uuid;
begin
  if not public.has_permission('content.write') then raise exception 'forbidden'; end if;
  if p_suggestion_type not in ('question','explanation','taxonomy','knowledge') then raise exception 'invalid_suggestion_type'; end if;
  select question_id into v_question from public.content_generation_jobs where id=p_job_id and requested_by=auth.uid() for update;
  if not found then raise exception 'job_not_found'; end if;
  update public.content_generation_jobs set status='completed',output_json=p_payload,completed_at=now(),error_code=null where id=p_job_id;
  insert into public.ai_content_suggestions(job_id,question_id,suggestion_type,payload) values(p_job_id,v_question,p_suggestion_type,p_payload) returning id into v_suggestion;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'ai_generation',p_job_id,'completed',jsonb_build_object('suggestion_id',v_suggestion));
  return v_suggestion;
end; $$;
revoke all on function public.complete_ai_generation_job(uuid,text,jsonb) from public;
grant execute on function public.complete_ai_generation_job(uuid,text,jsonb) to authenticated;

create or replace function public.fail_ai_generation_job(p_job_id uuid,p_error_code text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('content.write') then raise exception 'forbidden'; end if;
  update public.content_generation_jobs set status='failed',error_code=left(coalesce(p_error_code,'generation_failed'),180),completed_at=now() where id=p_job_id and requested_by=auth.uid();
  if not found then raise exception 'job_not_found'; end if;
end; $$;
revoke all on function public.fail_ai_generation_job(uuid,text) from public;
grant execute on function public.fail_ai_generation_job(uuid,text) to authenticated;

create or replace function public.review_ai_suggestion(p_suggestion_id uuid,p_status text,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_requester uuid;
begin
  if not public.has_permission('content.review') then raise exception 'forbidden'; end if;
  if p_status not in ('accepted','edited','rejected') then raise exception 'invalid_status'; end if;
  select j.requested_by into v_requester from public.ai_content_suggestions s join public.content_generation_jobs j on j.id=s.job_id where s.id=p_suggestion_id;
  if v_requester is null then raise exception 'suggestion_not_found'; end if;
  if v_requester=auth.uid() then raise exception 'self_review_forbidden'; end if;
  update public.ai_content_suggestions set reviewer_status=p_status,reviewer_id=auth.uid(),reviewer_note=p_note,reviewed_at=now() where id=p_suggestion_id;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'ai_suggestion',p_suggestion_id,p_status,jsonb_build_object('note',p_note));
end; $$;
revoke all on function public.review_ai_suggestion(uuid,text,text) from public;
grant execute on function public.review_ai_suggestion(uuid,text,text) to authenticated;
