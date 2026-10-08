-- MDvoro Adaptive Study Engine v1.
-- Turns verified mastery + memory due dates + exam target into a transparent plan.

create or replace function public.upsert_study_plan(
  p_exam_id uuid,
  p_target_date date,
  p_daily_minutes smallint
)
returns public.study_plans
language plpgsql security definer set search_path=public
as $$
declare v_plan public.study_plans;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if p_target_date is not null and p_target_date < current_date then raise exception 'target_date_in_past'; end if;
  if p_daily_minutes < 5 or p_daily_minutes > 1440 then raise exception 'invalid_daily_minutes'; end if;
  if not exists(select 1 from public.exams where id=p_exam_id) then raise exception 'exam_not_found'; end if;
  insert into public.study_plans(user_id,exam_id,target_date,daily_minutes)
  values(auth.uid(),p_exam_id,p_target_date,p_daily_minutes)
  on conflict (user_id) do update set exam_id=excluded.exam_id,target_date=excluded.target_date,daily_minutes=excluded.daily_minutes,updated_at=now()
  returning * into v_plan;
  return v_plan;
end;
$$;
-- Existing schema has no uniqueness on user_id; add it once so the planner is deterministic.
create unique index if not exists study_plans_user_unique on public.study_plans(user_id);
revoke all on function public.upsert_study_plan(uuid,date,smallint) from public;
grant execute on function public.upsert_study_plan(uuid,date,smallint) to authenticated;

create or replace function public.adaptive_study_plan()
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare v_plan public.study_plans; v_days integer; v_due integer; v_questions integer; v_weak jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select * into v_plan from public.study_plans where user_id=auth.uid() limit 1;
  if v_plan.id is null then return jsonb_build_object('configured',false); end if;
  v_days := case when v_plan.target_date is null then null else greatest(1,(v_plan.target_date-current_date)) end;
  select count(*) into v_due from public.flashcards where owner_id=auth.uid() and suspended=false and due_at<=now();
  select count(*) into v_questions from public.questions q where q.exam_id=v_plan.exam_id and q.is_published=true and q.workflow_status='published' and (q.access_tier='free' or public.has_active_subscription());
  with weak as (
    select n.id,n.name,n.node_type,round(100.0*avg(case when a.is_correct then 1.0 else 0.0 end),1) accuracy,count(a.id) attempts
    from public.taxonomy_nodes n join public.question_taxonomy qt on qt.taxonomy_id=n.id join public.questions q on q.id=qt.question_id
    join public.question_attempts a on a.question_id=q.id and a.user_id=auth.uid()
    where n.status='active' and q.exam_id=v_plan.exam_id
    group by n.id,n.name,n.node_type having count(a.id)>=2 order by accuracy asc,count(a.id) desc limit 8
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'type',node_type,'accuracy',accuracy,'attempts',attempts)),'[]'::jsonb) into v_weak from weak;
  return jsonb_build_object(
    'configured',true,
    'plan',jsonb_build_object('id',v_plan.id,'exam_id',v_plan.exam_id,'target_date',v_plan.target_date,'daily_minutes',v_plan.daily_minutes),
    'days_remaining',v_days,
    'due_cards',v_due,
    'accessible_questions',v_questions,
    'daily_question_target',greatest(5,least(80,round(v_plan.daily_minutes/2.5))),
    'daily_flashcard_target',greatest(5,least(80,round(v_plan.daily_minutes/3.0))),
    'weak_concepts',v_weak,
    'generated_at',now()
  );
end;
$$;
revoke all on function public.adaptive_study_plan() from public;
grant execute on function public.adaptive_study_plan() to authenticated;

create or replace function public.get_question_for_learning(p_question_id uuid)
returns table(id uuid,content_code text,exam_id uuid,stem text,subject text,topic text,options jsonb,difficulty smallint,media jsonb)
language plpgsql stable security definer set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  return query
  select q.id,q.content_code,q.exam_id,q.stem,q.subject,q.topic,q.options,q.difficulty,
    coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'student_alt_text',coalesce(m.student_alt_text,'Medical image'),'external_url',m.external_url,'storage_path',m.storage_path,'caption',qm.caption,'position',qm.position) order by qm.position)
      from public.question_media qm join public.media_assets m on m.id=qm.media_id where qm.question_id=q.id),'[]'::jsonb)
  from public.questions q
  where q.id=p_question_id and q.is_published=true and q.workflow_status='published'
    and (q.access_tier='free' or public.has_active_subscription());
end;
$$;
revoke all on function public.get_question_for_learning(uuid) from public;
grant execute on function public.get_question_for_learning(uuid) to authenticated;
