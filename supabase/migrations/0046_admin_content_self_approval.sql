-- Admins with the required MFA assurance may approve their own content.
-- Keep reviewer permissions, account status, MFA, and immutable audit records enforced.

create or replace function public.review_question(
  p_question_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_id uuid;
  v_creator uuid;
  v_admin_self_review boolean;
begin
  if not public.can_review_content() then raise exception 'forbidden'; end if;
  if p_decision is null or p_decision not in ('approved','changes_requested','rejected') then raise exception 'invalid_decision'; end if;

  select qv.id,qv.created_by
    into v_version_id,v_creator
    from public.question_versions qv
    where qv.question_id=p_question_id
    order by qv.version_no desc
    limit 1;
  if v_version_id is null then raise exception 'version_not_found'; end if;

  select exists (
    select 1 from public.profiles p
    where p.id=auth.uid()
      and p.account_status='active'
      and p.role in ('admin'::public.user_role,'super_admin'::public.user_role)
  ) into v_admin_self_review;
  if v_creator=auth.uid() and not v_admin_self_review then
    raise exception 'self_review_forbidden';
  end if;
  if not exists (
    select 1 from public.questions q
    where q.id=p_question_id and q.workflow_status='in_review'
  ) then raise exception 'question_not_in_review'; end if;

  insert into public.content_reviews(question_id,version_id,reviewer_id,decision,note)
    values(p_question_id,v_version_id,auth.uid(),p_decision,p_note);

  if p_decision='approved' then
    update public.questions q
      set stem=v.stem,subject=v.subject,topic=v.topic,options=v.options,
          answer_key=v.answer_key,explanation=v.explanation,difficulty=v.difficulty,
          is_published=true,workflow_status='published'
      from public.question_versions v
      where q.id=p_question_id and v.id=v_version_id;
  elsif p_decision='changes_requested' then
    update public.questions set is_published=false,workflow_status='draft'
      where id=p_question_id;
  else
    update public.questions set is_published=false,workflow_status='archived'
      where id=p_question_id;
  end if;

  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
    values(auth.uid(),'question',p_question_id,'reviewed',jsonb_build_object(
      'decision',p_decision,
      'version_id',v_version_id,
      'admin_self_review',v_creator=auth.uid() and v_admin_self_review
    ));
end;
$$;
revoke all on function public.review_question(uuid,text,text) from public;
grant execute on function public.review_question(uuid,text,text) to authenticated;

create or replace function public.review_ai_suggestion(
  p_suggestion_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester uuid;
  v_admin_self_review boolean;
begin
  if not public.has_permission('content.review') then raise exception 'forbidden'; end if;
  if p_status is null or p_status not in ('accepted','edited','rejected') then raise exception 'invalid_status'; end if;

  select j.requested_by
    into v_requester
    from public.ai_content_suggestions s
    join public.content_generation_jobs j on j.id=s.job_id
    where s.id=p_suggestion_id;
  if v_requester is null then raise exception 'suggestion_not_found'; end if;

  select exists (
    select 1 from public.profiles p
    where p.id=auth.uid()
      and p.account_status='active'
      and p.role in ('admin'::public.user_role,'super_admin'::public.user_role)
  ) into v_admin_self_review;
  if v_requester=auth.uid() and not v_admin_self_review then
    raise exception 'self_review_forbidden';
  end if;

  update public.ai_content_suggestions
    set reviewer_status=p_status,reviewer_id=auth.uid(),
        reviewer_note=p_note,reviewed_at=now()
    where id=p_suggestion_id;

  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
    values(auth.uid(),'ai_suggestion',p_suggestion_id,p_status,jsonb_build_object(
      'note',p_note,
      'admin_self_review',v_requester=auth.uid() and v_admin_self_review
    ));
end;
$$;
revoke all on function public.review_ai_suggestion(uuid,text,text) from public;
grant execute on function public.review_ai_suggestion(uuid,text,text) to authenticated;
