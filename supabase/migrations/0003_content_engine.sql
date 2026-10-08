-- Revoke direct question reads from students. Public question data is exposed through
-- question_public and answer validation happens only through a server-side RPC.
revoke all on public.questions from anon, authenticated;

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image','ecg','xray','ct','mri','pathology','diagram','video','audio','document')),
  title text not null check (char_length(title) between 1 and 180),
  alt_text text,
  external_url text,
  storage_path text,
  mime_type text,
  source_id uuid,
  license_name text,
  license_url text,
  attribution_text text,
  copyright_status text not null default 'review_required' check (copyright_status in ('original','public_domain','licensed','review_required')),
  commercial_use_allowed boolean,
  attribution_required boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (external_url is not null or storage_path is not null)
);

create table public.media_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 180),
  source_url text,
  default_license_name text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.media_assets add constraint media_assets_source_fk
  foreign key (source_id) references public.media_sources(id) on delete set null;

create table public.question_media (
  question_id uuid not null references public.questions(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete restrict,
  position smallint not null default 0 check (position >= 0 and position <= 100),
  caption text,
  primary key (question_id, media_id)
);

create table public.question_versions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  stem text not null check (char_length(stem) between 10 and 20000),
  subject text not null check (char_length(subject) between 1 and 120),
  topic text,
  options jsonb not null default '[]'::jsonb,
  answer_key text not null,
  explanation text,
  key_learning_point text,
  difficulty smallint check (difficulty between 1 and 5),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(question_id, version_no)
);

create table public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  version_id uuid references public.question_versions(id) on delete set null,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('approved','changes_requested','rejected')),
  note text,
  created_at timestamptz not null default now()
);

create table public.content_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index media_assets_kind_created_idx on public.media_assets(kind, created_at desc);
create index media_assets_source_idx on public.media_assets(source_id);
create index question_media_media_idx on public.question_media(media_id);
create index question_versions_question_created_idx on public.question_versions(question_id, created_at desc);
create index content_reviews_question_created_idx on public.content_reviews(question_id, created_at desc);
create index content_audit_actor_created_idx on public.content_audit_logs(actor_id, created_at desc);

create trigger media_assets_updated_at before update on public.media_assets for each row execute function public.set_updated_at();

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','editor','reviewer','support')
  );
$$;

create or replace function public.can_edit_content()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','editor')
  );
$$;

create or replace function public.can_review_content()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','reviewer')
  );
$$;

revoke all on function public.is_staff() from public;
revoke all on function public.can_edit_content() from public;
revoke all on function public.can_review_content() from public;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.can_edit_content() to authenticated;
grant execute on function public.can_review_content() to authenticated;

-- Student-safe question projection. The answer key and explanation are deliberately absent.
create or replace view public.question_public
with (security_invoker = true)
as
select
  q.id,
  q.exam_id,
  q.stem,
  q.subject,
  q.topic,
  q.options,
  q.difficulty,
  q.is_published,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'kind', m.kind,
        'title', m.title,
        'alt_text', m.alt_text,
        'external_url', m.external_url,
        'caption', qm.caption,
        'position', qm.position
      ) order by qm.position
    ) filter (where m.id is not null),
    '[]'::jsonb
  ) as media
from public.questions q
left join public.question_media qm on qm.question_id = q.id
left join public.media_assets m on m.id = qm.media_id
group by q.id;

grant select on public.question_public to authenticated;

-- Student can read only published media attached to a question they are entitled to practice.
alter table public.media_assets enable row level security;
alter table public.media_sources enable row level security;
alter table public.question_media enable row level security;
alter table public.question_versions enable row level security;
alter table public.content_reviews enable row level security;
alter table public.content_audit_logs enable row level security;

create policy "staff read media assets" on public.media_assets for select to authenticated using (public.is_staff());
create policy "students read linked published media" on public.media_assets for select to authenticated using (
  exists (
    select 1 from public.question_media qm
    join public.questions q on q.id = qm.question_id
    where qm.media_id = media_assets.id
      and q.is_published = true
      and public.has_active_subscription()
  )
);
create policy "staff create media assets" on public.media_assets for insert to authenticated with check (public.can_edit_content() and created_by = auth.uid());
create policy "staff update media assets" on public.media_assets for update to authenticated using (public.can_edit_content()) with check (public.can_edit_content());
create policy "admin delete media assets" on public.media_assets for delete to authenticated using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "staff read media sources" on public.media_sources for select to authenticated using (public.is_staff());
create policy "staff create media sources" on public.media_sources for insert to authenticated with check (public.can_edit_content() and created_by = auth.uid());
create policy "staff update media sources" on public.media_sources for update to authenticated using (public.can_edit_content()) with check (public.can_edit_content());
create policy "admin delete media sources" on public.media_sources for delete to authenticated using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "staff read question media" on public.question_media for select to authenticated using (public.is_staff());
create policy "students read linked media relation" on public.question_media for select to authenticated using (
  exists(select 1 from public.questions q where q.id = question_media.question_id and q.is_published = true and public.has_active_subscription())
);
create policy "editors manage question media" on public.question_media for insert to authenticated with check (public.can_edit_content());
create policy "editors update question media" on public.question_media for update to authenticated using (public.can_edit_content()) with check (public.can_edit_content());
create policy "editors delete question media" on public.question_media for delete to authenticated using (public.can_edit_content());

create policy "staff read question versions" on public.question_versions for select to authenticated using (public.is_staff());
create policy "editors create question versions" on public.question_versions for insert to authenticated with check (public.can_edit_content() and created_by = auth.uid());

create policy "reviewers read reviews" on public.content_reviews for select to authenticated using (public.is_staff());
create policy "reviewers create reviews" on public.content_reviews for insert to authenticated with check (public.can_review_content() and reviewer_id = auth.uid());

create policy "admins read audit logs" on public.content_audit_logs for select to authenticated using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Staff can see safe question metadata. Private answer/explanation stays behind RPCs.
create policy "staff read question metadata" on public.questions for select to authenticated using (public.is_staff());
create policy "editors create questions" on public.questions for insert to authenticated with check (public.can_edit_content());
create policy "editors update questions" on public.questions for update to authenticated using (public.can_edit_content()) with check (public.can_edit_content());
create policy "admins delete questions" on public.questions for delete to authenticated using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Create a question through one transaction and snapshot the first version.
create or replace function public.create_question(
  p_exam_id uuid,
  p_stem text,
  p_subject text,
  p_topic text,
  p_options jsonb,
  p_answer_key text,
  p_explanation text,
  p_key_learning_point text,
  p_difficulty smallint,
  p_media_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question_id uuid;
  v_version_id uuid;
begin
  if not public.can_edit_content() then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.exams where id = p_exam_id) then raise exception 'exam_not_found'; end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2 then raise exception 'invalid_options'; end if;

  insert into public.questions(exam_id, stem, subject, topic, options, answer_key, explanation, difficulty, is_published)
  values (p_exam_id, p_stem, p_subject, nullif(p_topic,''), p_options, p_answer_key, p_explanation, p_difficulty, false)
  returning id into v_question_id;

  insert into public.question_versions(question_id, version_no, stem, subject, topic, options, answer_key, explanation, key_learning_point, difficulty, created_by)
  values (v_question_id, 1, p_stem, p_subject, nullif(p_topic,''), p_options, p_answer_key, p_explanation, p_key_learning_point, p_difficulty, auth.uid())
  returning id into v_version_id;

  if coalesce(array_length(p_media_ids,1),0) > 0 then
    insert into public.question_media(question_id, media_id, position)
    select v_question_id, x, row_number() over () - 1 from unnest(p_media_ids) as x;
  end if;

  insert into public.content_audit_logs(actor_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), 'question', v_question_id, 'created', jsonb_build_object('version_id', v_version_id));

  return v_question_id;
end;
$$;

revoke all on function public.create_question(uuid,text,text,text,jsonb,text,text,text,smallint,uuid[]) from public;
grant execute on function public.create_question(uuid,text,text,text,jsonb,text,text,text,smallint,uuid[]) to authenticated;

-- Secure answer submission. The client never receives the answer key before submission.
create or replace function public.submit_question_answer(
  p_question_id uuid,
  p_selected_answer text,
  p_duration_ms integer default null,
  p_confidence smallint default null
)
returns table(is_correct boolean, explanation text, key_learning_point text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correct text;
  v_explanation text;
  v_learning text;
  v_is_correct boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if not public.has_active_subscription() then raise exception 'subscription_required'; end if;
  if p_duration_ms is not null and (p_duration_ms < 0 or p_duration_ms > 3600000) then raise exception 'invalid_duration'; end if;
  if p_confidence is not null and (p_confidence < 1 or p_confidence > 5) then raise exception 'invalid_confidence'; end if;

  select q.answer_key, q.explanation, v.key_learning_point
    into v_correct, v_explanation, v_learning
  from public.questions q
  left join lateral (
    select key_learning_point from public.question_versions qv
    where qv.question_id = q.id order by qv.version_no desc limit 1
  ) v on true
  where q.id = p_question_id and q.is_published = true;

  if not found then raise exception 'question_not_available'; end if;
  v_is_correct := p_selected_answer = v_correct;

  insert into public.question_attempts(user_id, question_id, selected_answer, is_correct, duration_ms, confidence)
  values (auth.uid(), p_question_id, p_selected_answer, v_is_correct, p_duration_ms, p_confidence);

  return query select v_is_correct, v_explanation, v_learning;
end;
$$;

revoke all on function public.submit_question_answer(uuid,text,integer,smallint) from public;
grant execute on function public.submit_question_answer(uuid,text,integer,smallint) to authenticated;

-- Publishing is a reviewer/admin action and creates an audit trail.
create or replace function public.review_question(
  p_question_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version_id uuid;
begin
  if not public.can_review_content() then raise exception 'forbidden'; end if;
  if p_decision not in ('approved','changes_requested','rejected') then raise exception 'invalid_decision'; end if;
  select id into v_version_id from public.question_versions where question_id = p_question_id order by version_no desc limit 1;
  if v_version_id is null then raise exception 'version_not_found'; end if;

  insert into public.content_reviews(question_id, version_id, reviewer_id, decision, note)
  values (p_question_id, v_version_id, auth.uid(), p_decision, p_note);

  if p_decision = 'approved' then
    update public.questions q
    set stem = v.stem,
        subject = v.subject,
        topic = v.topic,
        options = v.options,
        answer_key = v.answer_key,
        explanation = v.explanation,
        difficulty = v.difficulty,
        is_published = true
    from public.question_versions v
    where q.id = p_question_id and v.id = v_version_id;
  elsif p_decision in ('changes_requested','rejected') then
    update public.questions set is_published = false where id = p_question_id;
  end if;

  insert into public.content_audit_logs(actor_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), 'question', p_question_id, 'reviewed', jsonb_build_object('decision', p_decision, 'version_id', v_version_id));
end;
$$;

revoke all on function public.review_question(uuid,text,text) from public;
grant execute on function public.review_question(uuid,text,text) to authenticated;

-- Private media bucket. Storage policies are intentionally role-gated.
insert into storage.buckets (id, name, public) values ('medical-media','medical-media',false)
on conflict (id) do nothing;

create policy "staff upload medical media" on storage.objects for insert to authenticated
with check (bucket_id = 'medical-media' and public.can_edit_content());
create policy "staff update medical media" on storage.objects for update to authenticated
using (bucket_id = 'medical-media' and public.can_edit_content())
with check (bucket_id = 'medical-media' and public.can_edit_content());
create policy "staff delete medical media" on storage.objects for delete to authenticated
using (bucket_id = 'medical-media' and exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "entitled users read linked medical media" on storage.objects for select to authenticated
using (
  bucket_id = 'medical-media'
  and exists(
    select 1 from public.media_assets m
    join public.question_media qm on qm.media_id = m.id
    join public.questions q on q.id = qm.question_id
    where m.storage_path = storage.objects.name
      and q.is_published = true
      and public.has_active_subscription()
  )
);

-- Keep direct access to the subscription table disabled.
revoke all on public.media_assets from anon;
revoke all on public.media_sources from anon;
revoke all on public.question_media from anon;
revoke all on public.question_versions from anon;
revoke all on public.content_reviews from anon;
revoke all on public.content_audit_logs from anon;

-- Admin reads/editing go through narrow RPC contracts rather than exposing the question table.
create or replace function public.admin_list_questions(p_limit integer default 50, p_offset integer default 0)
returns table(id uuid, exam_id uuid, stem text, subject text, topic text, difficulty smallint, is_published boolean, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.exam_id, q.stem, q.subject, q.topic, q.difficulty, q.is_published, q.updated_at
  from public.questions q
  where public.is_staff()
  order by q.updated_at desc
  limit least(greatest(coalesce(p_limit,50),1),100)
  offset greatest(coalesce(p_offset,0),0);
$$;

create or replace function public.admin_get_question(p_question_id uuid)
returns table(id uuid, exam_id uuid, stem text, subject text, topic text, options jsonb, answer_key text, explanation text, difficulty smallint, is_published boolean, media_ids uuid[])
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.exam_id, q.stem, q.subject, q.topic, q.options, q.answer_key, q.explanation, q.difficulty, q.is_published,
         coalesce(array_agg(qm.media_id order by qm.position) filter (where qm.media_id is not null), '{}')
  from public.questions q
  left join public.question_media qm on qm.question_id = q.id
  where public.is_staff() and q.id = p_question_id
  group by q.id;
$$;

create or replace function public.update_question_draft(
  p_question_id uuid,
  p_stem text,
  p_subject text,
  p_topic text,
  p_options jsonb,
  p_answer_key text,
  p_explanation text,
  p_key_learning_point text,
  p_difficulty smallint,
  p_media_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
  v_version_id uuid;
begin
  if not public.can_edit_content() then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.questions where id = p_question_id) then raise exception 'question_not_found'; end if;
  select coalesce(max(version_no),0) + 1 into v_next from public.question_versions where question_id = p_question_id;

  insert into public.question_versions(question_id, version_no, stem, subject, topic, options, answer_key, explanation, key_learning_point, difficulty, created_by)
  values (p_question_id, v_next, p_stem, p_subject, nullif(p_topic,''), p_options, p_answer_key, p_explanation, p_key_learning_point, p_difficulty, auth.uid())
  returning id into v_version_id;

  delete from public.question_media where question_id = p_question_id;
  if coalesce(array_length(p_media_ids,1),0) > 0 then
    insert into public.question_media(question_id, media_id, position)
    select p_question_id, x, row_number() over () - 1 from unnest(p_media_ids) as x;
  end if;

  update public.questions
  set stem = p_stem, subject = p_subject, topic = nullif(p_topic,''), options = p_options,
      answer_key = p_answer_key, explanation = p_explanation, difficulty = p_difficulty, is_published = false
  where id = p_question_id;

  insert into public.content_audit_logs(actor_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), 'question', p_question_id, 'draft_updated', jsonb_build_object('version_id', v_version_id));

  return v_version_id;
end;
$$;

create or replace function public.admin_create_media(
  p_kind text,
  p_title text,
  p_alt_text text,
  p_external_url text,
  p_storage_path text,
  p_mime_type text,
  p_source_id uuid,
  p_license_name text,
  p_license_url text,
  p_attribution_text text,
  p_copyright_status text,
  p_commercial_use_allowed boolean,
  p_attribution_required boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.can_edit_content() then raise exception 'forbidden'; end if;
  insert into public.media_assets(kind,title,alt_text,external_url,storage_path,mime_type,source_id,license_name,license_url,attribution_text,copyright_status,commercial_use_allowed,attribution_required,created_by)
  values (p_kind,p_title,p_alt_text,nullif(p_external_url,''),nullif(p_storage_path,''),p_mime_type,p_source_id,p_license_name,p_license_url,p_attribution_text,p_copyright_status,p_commercial_use_allowed,p_attribution_required,auth.uid())
  returning id into v_id;
  insert into public.content_audit_logs(actor_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), 'media', v_id, 'created', jsonb_build_object('kind',p_kind));
  return v_id;
end;
$$;

revoke all on function public.admin_list_questions(integer,integer) from public;
revoke all on function public.admin_get_question(uuid) from public;
revoke all on function public.update_question_draft(uuid,text,text,text,jsonb,text,text,text,smallint,uuid[]) from public;
revoke all on function public.admin_create_media(text,text,text,text,text,text,uuid,text,text,text,text,boolean,boolean) from public;
grant execute on function public.admin_list_questions(integer,integer) to authenticated;
grant execute on function public.admin_get_question(uuid) to authenticated;
grant execute on function public.update_question_draft(uuid,text,text,text,jsonb,text,text,text,smallint,uuid[]) to authenticated;
grant execute on function public.admin_create_media(text,text,text,text,text,text,uuid,text,text,text,text,boolean,boolean) to authenticated;

-- Explicit privileges for the content tables. RLS remains the authorization boundary.
grant select on public.media_assets to authenticated;
grant select on public.media_sources to authenticated;
grant select on public.question_media to authenticated;
grant select on public.question_versions to authenticated;
grant select on public.content_reviews to authenticated;
grant select on public.content_audit_logs to authenticated;


create or replace function public.get_next_question(
  p_exam_id uuid default null,
  p_subject text default null,
  p_topic text default null
)
returns table(id uuid, exam_id uuid, stem text, subject text, topic text, options jsonb, difficulty smallint, media jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if not public.has_active_subscription() then raise exception 'subscription_required'; end if;

  return query
  select q.id, q.exam_id, q.stem, q.subject, q.topic, q.options, q.difficulty,
         coalesce((select jsonb_agg(jsonb_build_object(
           'id', m.id, 'kind', m.kind, 'title', m.title, 'alt_text', m.alt_text,
           'external_url', m.external_url, 'storage_path', m.storage_path, 'caption', qm.caption, 'position', qm.position
         ) order by qm.position)
         from public.question_media qm
         join public.media_assets m on m.id = qm.media_id
         where qm.question_id = q.id), '[]'::jsonb) as media
  from public.questions q
  where q.is_published = true
    and (p_exam_id is null or q.exam_id = p_exam_id)
    and (p_subject is null or p_subject = '' or q.subject = p_subject)
    and (p_topic is null or p_topic = '' or q.topic = p_topic)
  order by random()
  limit 1;
end;
$$;

revoke all on function public.get_next_question(uuid,text,text) from public;
grant execute on function public.get_next_question(uuid,text,text) to authenticated;

-- Free-first content model: every question can be marked free or entitled later.
alter table public.questions add column if not exists access_tier text not null default 'free' check (access_tier in ('free','premium'));
create index if not exists questions_access_tier_idx on public.questions(access_tier, is_published);

create or replace function public.get_next_question(
  p_exam_id uuid default null,
  p_subject text default null,
  p_topic text default null
)
returns table(id uuid, exam_id uuid, stem text, subject text, topic text, options jsonb, difficulty smallint, media jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  return query
  select q.id, q.exam_id, q.stem, q.subject, q.topic, q.options, q.difficulty,
         coalesce((select jsonb_agg(jsonb_build_object(
           'id', m.id, 'kind', m.kind, 'title', m.title, 'alt_text', m.alt_text,
           'external_url', m.external_url, 'storage_path', m.storage_path, 'caption', qm.caption, 'position', qm.position
         ) order by qm.position)
         from public.question_media qm
         join public.media_assets m on m.id = qm.media_id
         where qm.question_id = q.id), '[]'::jsonb) as media
  from public.questions q
  where q.is_published = true
    and (q.access_tier = 'free' or public.has_active_subscription())
    and (p_exam_id is null or q.exam_id = p_exam_id)
    and (p_subject is null or p_subject = '' or q.subject = p_subject)
    and (p_topic is null or p_topic = '' or q.topic = p_topic)
  order by random()
  limit 1;
end;
$$;

create or replace function public.submit_question_answer(
  p_question_id uuid,
  p_selected_answer text,
  p_duration_ms integer default null,
  p_confidence smallint default null
)
returns table(is_correct boolean, explanation text, key_learning_point text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correct text;
  v_explanation text;
  v_learning text;
  v_is_correct boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select q.answer_key, q.explanation, v.key_learning_point
    into v_correct, v_explanation, v_learning
  from public.questions q
  left join lateral (select key_learning_point from public.question_versions qv where qv.question_id=q.id order by qv.version_no desc limit 1) v on true
  where q.id = p_question_id and q.is_published = true
    and (q.access_tier = 'free' or public.has_active_subscription());
  if not found then raise exception 'question_not_available'; end if;
  if p_duration_ms is not null and (p_duration_ms < 0 or p_duration_ms > 3600000) then raise exception 'invalid_duration'; end if;
  if p_confidence is not null and (p_confidence < 1 or p_confidence > 5) then raise exception 'invalid_confidence'; end if;
  v_is_correct := p_selected_answer = v_correct;
  insert into public.question_attempts(user_id, question_id, selected_answer, is_correct, duration_ms, confidence)
  values (auth.uid(), p_question_id, p_selected_answer, v_is_correct, p_duration_ms, p_confidence);
  return query select v_is_correct, v_explanation, v_learning;
end;
$$;

create or replace function public.set_active_exam(target_exam uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if not exists(select 1 from public.exams where id = target_exam) then raise exception 'exam_not_found'; end if;
  update public.profiles set active_exam_id = target_exam where id = auth.uid();
  if not found then raise exception 'profile_not_found'; end if;
end;
$$;
revoke all on function public.set_active_exam(uuid) from public;
grant execute on function public.set_active_exam(uuid) to authenticated;

create or replace function public.import_questions(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  v_count integer := 0;
  v_question_id uuid;
  v_version_id uuid;
  v_options jsonb;
  v_answer text;
  v_exam uuid;
  v_difficulty smallint;
begin
  if not public.can_edit_content() then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'payload_must_be_array'; end if;
  if jsonb_array_length(p_items) > 2000 then raise exception 'import_limit_exceeded'; end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    v_exam := (item->>'examId')::uuid;
    v_options := item->'options';
    v_answer := item->>'answerKey';
    v_difficulty := coalesce((item->>'difficulty')::smallint,3);
    if not exists(select 1 from public.exams where id=v_exam) then raise exception 'exam_not_found'; end if;
    if jsonb_typeof(v_options) <> 'array' or jsonb_array_length(v_options) < 2 then raise exception 'invalid_options'; end if;
    if not exists(select 1 from jsonb_array_elements(v_options) x where x->>'id'=v_answer) then raise exception 'answer_not_in_options'; end if;
    if v_difficulty < 1 or v_difficulty > 5 then raise exception 'invalid_difficulty'; end if;

    insert into public.questions(exam_id,stem,subject,topic,options,answer_key,explanation,difficulty,is_published)
    values(v_exam,item->>'stem',item->>'subject',nullif(item->>'topic',''),v_options,v_answer,item->>'explanation',v_difficulty,false)
    returning id into v_question_id;

    insert into public.question_versions(question_id,version_no,stem,subject,topic,options,answer_key,explanation,key_learning_point,difficulty,created_by)
    values(v_question_id,1,item->>'stem',item->>'subject',nullif(item->>'topic',''),v_options,v_answer,item->>'explanation',item->>'keyLearningPoint',v_difficulty,auth.uid())
    returning id into v_version_id;

    if jsonb_typeof(item->'mediaIds') = 'array' then
      insert into public.question_media(question_id,media_id,position)
      select v_question_id,(x::text)::uuid,row_number() over () - 1
      from jsonb_array_elements_text(item->'mediaIds') as x;
    end if;

    insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
    values(auth.uid(),'question',v_question_id,'imported',jsonb_build_object('version_id',v_version_id));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.import_questions(jsonb) from public;
grant execute on function public.import_questions(jsonb) to authenticated;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'forbidden'; end if;
  if p_role = 'admin' and p_user_id = auth.uid() then raise exception 'self_role_change_forbidden'; end if;
  update public.profiles set role=p_role where id=p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'profile',p_user_id,'role_changed',jsonb_build_object('role',p_role));
end;
$$;
revoke all on function public.admin_set_user_role(uuid,public.user_role) from public;
grant execute on function public.admin_set_user_role(uuid,public.user_role) to authenticated;

-- Replace the earlier invoker view with a deliberately narrow security-definer projection.
-- It contains no answer key/explanation and applies its own publication/entitlement filter.
drop view if exists public.question_public;
create view public.question_public as
select
  q.id, q.exam_id, q.stem, q.subject, q.topic, q.options, q.difficulty,
  coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'kind',m.kind,'title',m.title,'alt_text',m.alt_text,
    'external_url',m.external_url,'caption',qm.caption,'position',qm.position
  ) order by qm.position) filter(where m.id is not null),'[]'::jsonb) as media
from public.questions q
left join public.question_media qm on qm.question_id=q.id
left join public.media_assets m on m.id=qm.media_id
where q.is_published=true and (q.access_tier='free' or public.has_active_subscription())
group by q.id;
grant select on public.question_public to authenticated;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'forbidden'; end if;
  if p_user_id = auth.uid() then raise exception 'self_role_change_forbidden'; end if;
  update public.profiles set role=p_role where id=p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'profile',p_user_id,'role_changed',jsonb_build_object('role',p_role));
end;
$$;

create policy "admins read staff directory" on public.profiles for select to authenticated using (
  id = auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
);

drop policy if exists "students read linked published media" on public.media_assets;
create policy "students read linked published media" on public.media_assets for select to authenticated using (
  exists (
    select 1 from public.question_media qm
    join public.questions q on q.id=qm.question_id
    where qm.media_id=media_assets.id and q.is_published=true
      and (q.access_tier='free' or public.has_active_subscription())
  )
);

drop policy if exists "students read linked media relation" on public.question_media;
create policy "students read linked media relation" on public.question_media for select to authenticated using (
  exists(select 1 from public.questions q where q.id=question_media.question_id and q.is_published=true and (q.access_tier='free' or public.has_active_subscription()))
);

drop policy if exists "entitled users read linked medical media" on storage.objects;
create policy "entitled users read linked medical media" on storage.objects for select to authenticated
using (
  bucket_id='medical-media'
  and exists(
    select 1 from public.media_assets m
    join public.question_media qm on qm.media_id=m.id
    join public.questions q on q.id=qm.question_id
    where m.storage_path=storage.objects.name and q.is_published=true
      and (q.access_tier='free' or public.has_active_subscription())
  )
);
