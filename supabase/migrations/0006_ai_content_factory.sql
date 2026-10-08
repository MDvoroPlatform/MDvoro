-- MDvoro Phase 5: governed AI content factory + knowledge card operations.
-- AI output is always a suggestion. Publishing remains a human medical-review action.

create table if not exists public.content_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id) on delete restrict,
  question_id uuid references public.questions(id) on delete set null,
  knowledge_id uuid references public.knowledge_cards(id) on delete set null,
  provider text not null check (provider in ('openai','anthropic','google','local','manual')),
  model text not null default 'configured',
  job_type text not null check (job_type in ('question_suggestion','explanation_suggestion','taxonomy_suggestion','knowledge_suggestion')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  prompt_hash text not null check (char_length(prompt_hash) between 16 and 128),
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists content_generation_jobs_requester_idx on public.content_generation_jobs(requested_by, created_at desc);
create index if not exists content_generation_jobs_question_idx on public.content_generation_jobs(question_id, created_at desc);

create table if not exists public.ai_content_suggestions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.content_generation_jobs(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  knowledge_id uuid references public.knowledge_cards(id) on delete set null,
  suggestion_type text not null check (suggestion_type in ('question','explanation','taxonomy','knowledge')),
  payload jsonb not null,
  reviewer_status text not null default 'pending' check (reviewer_status in ('pending','accepted','edited','rejected')),
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_content_suggestions_question_idx on public.ai_content_suggestions(question_id, created_at desc);
create index if not exists ai_content_suggestions_status_idx on public.ai_content_suggestions(reviewer_status, created_at desc);

alter table public.content_generation_jobs enable row level security;
alter table public.ai_content_suggestions enable row level security;

create policy "staff read generation jobs" on public.content_generation_jobs for select to authenticated
using (public.has_permission('content.read') and (requested_by = auth.uid() or public.has_permission('audit.read')));
create policy "editors create generation jobs" on public.content_generation_jobs for insert to authenticated
with check (public.has_permission('content.write') and requested_by = auth.uid());
create policy "staff read ai suggestions" on public.ai_content_suggestions for select to authenticated
using (public.has_permission('content.read'));
create policy "reviewers update ai suggestions" on public.ai_content_suggestions for update to authenticated
using (public.has_permission('content.review')) with check (public.has_permission('content.review'));

create or replace function public.create_ai_generation_job(
  p_question_id uuid,
  p_job_type text,
  p_provider text,
  p_model text,
  p_prompt_hash text,
  p_input jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.has_permission('content.write') then raise exception 'forbidden'; end if;
  if p_job_type not in ('question_suggestion','explanation_suggestion','taxonomy_suggestion','knowledge_suggestion') then raise exception 'invalid_job_type'; end if;
  if p_provider not in ('openai','anthropic','google','local','manual') then raise exception 'invalid_provider'; end if;
  insert into public.content_generation_jobs(requested_by,question_id,job_type,provider,model,prompt_hash,input_json)
  values(auth.uid(),p_question_id,p_job_type,p_provider,coalesce(nullif(p_model,''),'configured'),p_prompt_hash,p_input)
  returning id into v_id;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'ai_generation',v_id,'queued',jsonb_build_object('job_type',p_job_type,'provider',p_provider));
  return v_id;
end; $$;
revoke all on function public.create_ai_generation_job(uuid,text,text,text,text,jsonb) from public;
grant execute on function public.create_ai_generation_job(uuid,text,text,text,text,jsonb) to authenticated;

create or replace function public.review_ai_suggestion(
  p_suggestion_id uuid,
  p_status text,
  p_note text default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('content.review') then raise exception 'forbidden'; end if;
  if p_status not in ('accepted','edited','rejected') then raise exception 'invalid_status'; end if;
  update public.ai_content_suggestions
  set reviewer_status=p_status, reviewer_id=auth.uid(), reviewer_note=p_note, reviewed_at=now()
  where id=p_suggestion_id;
  if not found then raise exception 'suggestion_not_found'; end if;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'ai_suggestion',p_suggestion_id,p_status,jsonb_build_object('note',p_note));
end; $$;
revoke all on function public.review_ai_suggestion(uuid,text,text) from public;
grant execute on function public.review_ai_suggestion(uuid,text,text) to authenticated;

create or replace function public.create_knowledge_card(
  p_title text, p_summary text, p_body_md text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_code text;
begin
  if not public.has_permission('content.write') then raise exception 'forbidden'; end if;
  v_code := 'KC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.knowledge_cards(stable_code,title,summary,body_md,created_by,updated_by)
  values(v_code,p_title,p_summary,p_body_md,auth.uid(),auth.uid()) returning id into v_id;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'knowledge_card',v_id,'created',jsonb_build_object('stable_code',v_code));
  return v_id;
end; $$;
revoke all on function public.create_knowledge_card(text,text,text) from public;
grant execute on function public.create_knowledge_card(text,text,text) to authenticated;
