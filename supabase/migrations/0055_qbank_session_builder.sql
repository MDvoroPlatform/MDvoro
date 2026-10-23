-- Additive, repeatable QBank catalog and topic seed for the collapsed session builder.
-- Existing question content, answer keys, attempts, sessions, and taxonomy links are kept.

alter table public.taxonomy_nodes
  add column if not exists aliases text[] not null default '{}',
  add column if not exists qbank_seeded boolean not null default false;

create unique index if not exists taxonomy_root_subject_slug_uidx
  on public.taxonomy_nodes(slug) where parent_id is null and node_type='subject';

create table if not exists public.qbank_sources (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  parent_id uuid references public.qbank_sources(id) on delete cascade,
  source_key text not null check (char_length(source_key) between 1 and 80),
  name text not null check (char_length(name) between 1 and 120),
  source_kind text not null check (source_kind in ('practice','reconstruction','simulation','custom')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(exam_id,source_key)
);
create index if not exists qbank_sources_exam_parent_order_idx
  on public.qbank_sources(exam_id,parent_id,sort_order,name);

create or replace function public.ensure_qbank_default_sources()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.qbank_sources(exam_id,source_key,name,source_kind,sort_order)
  values(new.id,'practice','Practice','practice',10),
        (new.id,'reconstructions','Reconstructions','reconstruction',20)
  on conflict(exam_id,source_key) do nothing;
  return new;
end $$;
drop trigger if exists exams_qbank_default_sources on public.exams;
create trigger exams_qbank_default_sources after insert on public.exams
for each row execute function public.ensure_qbank_default_sources();
alter table public.qbank_sources enable row level security;
revoke all on public.qbank_sources from anon,authenticated;

alter table public.questions
  add column if not exists qbank_source_id uuid references public.qbank_sources(id) on delete set null;
create index if not exists questions_qbank_source_exam_idx
  on public.questions(exam_id,qbank_source_id) where is_published and workflow_status='published';

-- The legacy flags are the only source metadata present today. Backfill that metadata
-- without changing any question text, answers, history, or sessions.
insert into public.qbank_sources(exam_id,parent_id,source_key,name,source_kind,sort_order)
select e.id,null,'practice','Practice','practice',10 from public.exams e
on conflict(exam_id,source_key) do update set name=excluded.name,source_kind=excluded.source_kind,sort_order=excluded.sort_order;
insert into public.qbank_sources(exam_id,parent_id,source_key,name,source_kind,sort_order)
select e.id,null,'reconstructions','Reconstructions','reconstruction',20 from public.exams e
on conflict(exam_id,source_key) do update set name=excluded.name,source_kind=excluded.source_kind,sort_order=excluded.sort_order;
insert into public.qbank_sources(exam_id,parent_id,source_key,name,source_kind,sort_order)
select q.exam_id,p.id,'reconstruction-'||q.reconstruction_year::text,q.reconstruction_year::text,'reconstruction',q.reconstruction_year::integer
from (select distinct exam_id,reconstruction_year from public.questions where is_reconstruction and reconstruction_year is not null) q
join public.qbank_sources p on p.exam_id=q.exam_id and p.source_key='reconstructions'
on conflict(exam_id,source_key) do update set parent_id=excluded.parent_id,name=excluded.name,source_kind=excluded.source_kind,sort_order=excluded.sort_order;
update public.questions q set qbank_source_id=s.id
from public.qbank_sources s
where s.exam_id=q.exam_id and s.source_key=case when q.is_reconstruction and q.reconstruction_year is not null
  then 'reconstruction-'||q.reconstruction_year::text else 'practice' end
  and q.qbank_source_id is distinct from s.id;

create or replace function public.assign_qbank_question_source()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_parent uuid;
  v_source uuid;
  v_key text;
  v_name text;
  v_kind text;
begin
  if new.qbank_source_id is not null and (tg_op='INSERT' or new.qbank_source_id is distinct from old.qbank_source_id) then
    return new;
  end if;
  if new.is_reconstruction then
    v_key:='reconstructions'; v_name:='Reconstructions'; v_kind:='reconstruction';
  else
    v_key:='practice'; v_name:='Practice'; v_kind:='practice';
  end if;
  insert into public.qbank_sources(exam_id,source_key,name,source_kind,sort_order)
    values(new.exam_id,v_key,v_name,v_kind,case when v_key='practice' then 10 else 20 end)
    on conflict(exam_id,source_key) do nothing;
  select id into v_parent from public.qbank_sources where exam_id=new.exam_id and source_key=v_key;
  v_source:=v_parent;
  if new.is_reconstruction and new.reconstruction_year is not null then
    v_key:='reconstruction-'||new.reconstruction_year::text;
    v_name:=new.reconstruction_year::text;
    insert into public.qbank_sources(exam_id,parent_id,source_key,name,source_kind,sort_order)
      values(new.exam_id,v_parent,v_key,v_name,'reconstruction',new.reconstruction_year::integer)
      on conflict(exam_id,source_key) do update set parent_id=excluded.parent_id,name=excluded.name;
    select id into v_source from public.qbank_sources where exam_id=new.exam_id and source_key=v_key;
  end if;
  new.qbank_source_id:=v_source;
  return new;
end $$;
drop trigger if exists questions_assign_qbank_source on public.questions;
create trigger questions_assign_qbank_source
before insert or update of exam_id,is_reconstruction,reconstruction_year on public.questions
for each row execute function public.assign_qbank_question_source();

create or replace function public.qbank_question_matches_taxonomy(
  p_question_id uuid, p_topic_ids uuid[], p_other_subjects text[]
)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.questions q
    where q.id=p_question_id and (
      exists (
        select 1 from public.taxonomy_nodes t
        join public.taxonomy_nodes d on d.id=t.parent_id
        where t.node_type='topic' and t.id=any(coalesce(p_topic_ids,'{}'::uuid[]))
          and lower(q.subject)=any(array(select lower(x) from unnest(array_append(d.aliases,d.name)) x))
          and lower(trim(q.topic))=any(array(select lower(trim(x)) from unnest(array_append(t.aliases,t.name)) x))
      )
      or (q.subject=any(coalesce(p_other_subjects,'{}'::text[])) and not exists (
        select 1 from public.taxonomy_nodes t
        join public.taxonomy_nodes d on d.id=t.parent_id
        where t.node_type='topic' and t.name<>'Others'
          and lower(q.subject)=any(array(select lower(x) from unnest(array_append(d.aliases,d.name)) x))
          and lower(trim(q.topic))=any(array(select lower(trim(x)) from unnest(array_append(t.aliases,t.name)) x))
      ))
    )
  );
$$;
revoke all on function public.qbank_question_matches_taxonomy(uuid,uuid[],text[]) from public,anon,authenticated;

-- Record legacy topic nodes that do not match a seeded topic; keep them intact.
create table if not exists public.qbank_taxonomy_seed_unmatched (
  taxonomy_id uuid primary key references public.taxonomy_nodes(id) on delete cascade,
  discipline text not null,
  topic_name text not null,
  recorded_at timestamptz not null default now()
);
alter table public.qbank_taxonomy_seed_unmatched enable row level security;
revoke all on public.qbank_taxonomy_seed_unmatched from anon,authenticated;

do $$
declare
  d record;
  t record;
  v_parent uuid;
  v_topic uuid;
  v_seed_names text[];
begin
  for d in select * from (values
    ('Internal Medicine','internal-medicine',array['internal medicine']::text[],10),
    ('Pediatrics','pediatrics',array['pediatrics']::text[],20),
    ('Surgery','surgery',array['surgery']::text[],30),
    ('Psychiatry','psychiatry',array['psychiatry']::text[],40),
    ('Obstetrics & Gynecology','obstetrics-gynecology',array['obstetrics & gynecology','gynecology & obstetrics']::text[],50)
  ) as x(name,slug,aliases,sort_order)
  loop
    select id into v_parent from public.taxonomy_nodes
      where node_type='subject' and parent_id is null
        and lower(trim(name))=any(d.aliases)
      order by id limit 1;
    if v_parent is null then
      insert into public.taxonomy_nodes(parent_id,node_type,slug,name,aliases,sort_order,status)
      values(null,'subject',d.slug,d.name,d.aliases,d.sort_order,'active')
      on conflict (slug) where parent_id is null and node_type='subject'
      do update set name=excluded.name,aliases=excluded.aliases,sort_order=excluded.sort_order,status='active'
      returning id into v_parent;
    else
      update public.taxonomy_nodes set slug=d.slug,name=d.name,aliases=d.aliases,sort_order=d.sort_order,status='active'
      where id=v_parent;
    end if;
  end loop;

  -- Seed each discipline's ordered topics. Existing matching nodes keep their IDs.
  for t in select * from (values
    ('Internal Medicine','Cardiovascular',array['Cardiovascular (CV)','CV']::text[],10),('Internal Medicine','Nephrology',array[]::text[],20),('Internal Medicine','Rheumatology',array[]::text[],30),('Internal Medicine','Gastroenterology',array[]::text[],40),('Internal Medicine','Hepatology',array[]::text[],50),('Internal Medicine','Neurology',array[]::text[],60),('Internal Medicine','Pulmonology',array[]::text[],70),('Internal Medicine','Endocrinology',array[]::text[],80),('Internal Medicine','Hematology',array[]::text[],90),('Internal Medicine','Oncology',array[]::text[],100),('Internal Medicine','Infectious Diseases',array['Infectious diseases']::text[],110),('Internal Medicine','Acid-Base & Electrolytes',array['Acid/Base & Electrolytes']::text[],120),('Internal Medicine','Critical Care',array[]::text[],130),('Internal Medicine','Others',array[]::text[],140),
    ('Pediatrics','Growth & Development',array[]::text[],10),('Pediatrics','Immunology',array[]::text[],20),('Pediatrics','Genetics',array[]::text[],30),('Pediatrics','Cardiology (Pediatric)',array['Cardiology - Ped']::text[],40),('Pediatrics','Metabolic Disorders',array['Metabolic disorders']::text[],50),('Pediatrics','Otorhinolaryngology (ENT)',array['Otorhinolaryngology']::text[],60),('Pediatrics','Allergology',array[]::text[],70),('Pediatrics','Neonatology',array[]::text[],80),('Pediatrics','Adolescent Medicine',array['Adolescence']::text[],90),('Pediatrics','Nutrition',array[]::text[],100),('Pediatrics','Nephrology (Pediatric)',array['Nephrology - Ped']::text[],110),('Pediatrics','Rheumatology (Pediatric)',array['Rheumatology-Ped','Rheumatology - Ped']::text[],120),('Pediatrics','Gastroenterology (Pediatric)',array['Gastroenterology-Ped','Gastroenterology - Ped']::text[],130),('Pediatrics','Neurology (Pediatric)',array['Neurology-Ped','Neurology - Ped']::text[],140),('Pediatrics','Pulmonology (Pediatric)',array['Pulmonology-Ped','Pulmonology - Ped']::text[],150),('Pediatrics','Endocrinology (Pediatric)',array['Endocrinology-Ped','Endocrinology - Ped']::text[],160),('Pediatrics','Hematology (Pediatric)',array['Hematology-Ped','Hematology - Ped']::text[],170),('Pediatrics','Oncology (Pediatric)',array['Oncology-Ped','Oncology - Ped']::text[],180),('Pediatrics','Infectious Diseases (Pediatric)',array['Infectious-Ped','Infectious - Ped']::text[],190),('Pediatrics','Acid-Base & Electrolytes (Pediatric)',array['Acid/Base & Electrolytes-Ped']::text[],200),('Pediatrics','Critical Care (Pediatric)',array['Critical Care-Ped']::text[],210),('Pediatrics','Poisoning & Substance Use (Pediatric)',array['Poisoning & Substance use-Ped']::text[],220),('Pediatrics','Dermatology (Pediatric)',array['Dermatology-Ped']::text[],230),('Pediatrics','Ophthalmology (Pediatric)',array['Ophthalmology-Ped']::text[],240),('Pediatrics','Urology (Pediatric)',array['Urology-Ped']::text[],250),('Pediatrics','Orthopedics (Pediatric)',array['Orthopedics-Ped']::text[],260),('Pediatrics','Trauma & Emergency (Pediatric)',array['Trauma & Emergency-Ped']::text[],270),('Pediatrics','Others',array[]::text[],280),
    ('Surgery','Trauma & Emergency Medicine',array[]::text[],10),('Surgery','Colon & Rectum',array['Rectum & Colon']::text[],20),('Surgery','Small Intestine',array['Small intestine']::text[],30),('Surgery','Spleen',array[]::text[],40),('Surgery','Adrenal Gland',array[]::text[],50),('Surgery','Esophagus',array[]::text[],60),('Surgery','Liver',array[]::text[],70),('Surgery','Breast Surgery',array['Breast surgery']::text[],80),('Surgery','Plastic Surgery',array['Plastic surgery']::text[],90),('Surgery','Cardiothoracic Surgery',array['Cardiothoracic surgery']::text[],100),('Surgery','Vascular Surgery',array['Vascular surgery']::text[],110),('Surgery','Pediatric Surgery',array['Pediatric surgery']::text[],120),('Surgery','Postoperative Complications',array['Postoperative complications']::text[],130),('Surgery','Proctology',array[]::text[],140),('Surgery','Sarcoma & Abdominal Wall',array['Sarcoma and abdominal wall']::text[],150),('Surgery','Inflammatory Bowel Disease (IBD)',array['IBD']::text[],160),('Surgery','Thyroid & Parathyroid',array['Thyroid and Parathyroid']::text[],170),('Surgery','Anesthesiology',array[]::text[],180),('Surgery','GI Bleeding',array['GI bleeding']::text[],190),('Surgery','Principles of Surgery',array[]::text[],200),('Surgery','Hernia',array[]::text[],210),('Surgery','Intensive Care (ICU)',array['ICU']::text[],220),('Surgery','Obesity',array[]::text[],230),('Surgery','Stomach',array[]::text[],240),('Surgery','Gallbladder & Biliary Tract',array['Gallbladder and biliary tract']::text[],250),('Surgery','Pancreas',array[]::text[],260),('Surgery','Appendix',array['Vermiform Appendix','Vermiform Appendi']::text[],270),('Surgery','Urology',array[]::text[],280),('Surgery','Orthopedics',array[]::text[],290),('Surgery','Others',array[]::text[],300),
    ('Psychiatry','Psychiatric Diagnosis',array['Psychiatric diagnosis']::text[],10),('Psychiatry','Personality Disorders',array['Personality disorders']::text[],20),('Psychiatry','Psychosis & Schizophrenia',array['Psychosis & schizophrenia']::text[],30),('Psychiatry','Obsessive-Compulsive Disorders',array['Obsession & Compulsion']::text[],40),('Psychiatry','Anxiety Disorders',array['Anxiety disorders']::text[],50),('Psychiatry','Eating Disorders',array['Eating disorders']::text[],60),('Psychiatry','Sleep Disorders',array['Sleep disorders']::text[],70),('Psychiatry','Pharmacological Therapies',array[]::text[],80),('Psychiatry','Trauma-Related Disorders',array['Traumatic disorders']::text[],90),('Psychiatry','Forensic Psychiatry',array[]::text[],100),('Psychiatry','Gender & Sexuality',array[]::text[],110),('Psychiatry','Mood Disorders',array['Mood disorders']::text[],120),('Psychiatry','Neurocognitive Disorders',array['Neurocognitive disorder']::text[],130),('Psychiatry','Theories',array[]::text[],140),('Psychiatry','Psychological Treatments',array[]::text[],150),('Psychiatry','Dissociative Disorders',array['Dissociative disorders']::text[],160),('Psychiatry','Somatoform Disorders',array['Somatoform disorders']::text[],170),('Psychiatry','Impulse Control Disorders',array[]::text[],180),('Psychiatry','Psychiatric Emergencies',array['Psychiatric emergencies']::text[],190),('Psychiatry','Child Psychiatry',array[]::text[],200),('Psychiatry','Geriatric Psychiatry',array[]::text[],210),('Psychiatry','Substance Abuse',array['Substance abuse']::text[],220),('Psychiatry','Others',array[]::text[],230),
    ('Obstetrics & Gynecology','Contraception',array['Birth control']::text[],10),('Obstetrics & Gynecology','Delivery & Postpartum',array['Delivery and Postpartum period']::text[],20),('Obstetrics & Gynecology','Menopause',array[]::text[],30),('Obstetrics & Gynecology','Amenorrhea',array[]::text[],40),('Obstetrics & Gynecology','Infertility, IVF & ART',array[]::text[],50),('Obstetrics & Gynecology','STIs & PID',array['STD and PID']::text[],60),('Obstetrics & Gynecology','Gynecologic Endocrinology',array['Gynecological endocrinology']::text[],70),('Obstetrics & Gynecology','Cervical Pathology',array['Pathologies of cervix']::text[],80),('Obstetrics & Gynecology','Ovarian Masses',array['Ovarian mass']::text[],90),('Obstetrics & Gynecology','Uterine Pathology',array['Pathologies of uterus']::text[],100),('Obstetrics & Gynecology','Pelvic Anatomy',array['Pelvic anatomy']::text[],110),('Obstetrics & Gynecology','Pregnancy Screening',array['Pregnancy screening']::text[],120),('Obstetrics & Gynecology','Miscarriage & Abortion',array['Miscarriage and abortion']::text[],130),('Obstetrics & Gynecology','Ectopic Pregnancy',array['Ectopic pregnancy']::text[],140),('Obstetrics & Gynecology','Physiological Changes in Pregnancy',array[]::text[],150),('Obstetrics & Gynecology','Vulvar & Vaginal Pathology',array['Pathologies of vulva and vagina','Pathologies of vulva an vagina']::text[],160),('Obstetrics & Gynecology','Labor Complications',array[]::text[],170),('Obstetrics & Gynecology','Maternal Disease & High-Risk Pregnancy',array['Maternal disease and high-risk pregnancy']::text[],180),('Obstetrics & Gynecology','Gynecological Pathologies',array[]::text[],190),('Obstetrics & Gynecology','Others',array[]::text[],200)
  ) as x(discipline,name,aliases,sort_order)
  loop
    select id into v_parent from public.taxonomy_nodes where node_type='subject' and lower(name)=lower(t.discipline) order by id limit 1;
    v_seed_names:=array(select lower(trim(x)) from unnest(array_append(t.aliases,t.name)) x);
    select id into v_topic from public.taxonomy_nodes where node_type='topic' and parent_id=v_parent and lower(trim(name))=any(v_seed_names) order by id limit 1;
    if v_topic is null then
      insert into public.taxonomy_nodes(parent_id,node_type,slug,name,aliases,sort_order,status,qbank_seeded)
      values(v_parent,'topic',trim(both '-' from lower(regexp_replace(regexp_replace(t.name,'&','and','g'),'[^a-zA-Z0-9]+','-','g'))),t.name,t.aliases,t.sort_order,'active',true)
      on conflict(parent_id,slug) do update set name=excluded.name,aliases=excluded.aliases,sort_order=excluded.sort_order,status='active',qbank_seeded=true
      returning id into v_topic;
    else
      update public.taxonomy_nodes set slug=trim(both '-' from lower(regexp_replace(regexp_replace(t.name,'&','and','g'),'[^a-zA-Z0-9]+','-','g'))),name=t.name,aliases=t.aliases,sort_order=t.sort_order,status='active',qbank_seeded=true
      where id=v_topic;
    end if;
  end loop;
  insert into public.qbank_taxonomy_seed_unmatched(taxonomy_id,discipline,topic_name)
  select n.id,parent_node.name,n.name from public.taxonomy_nodes n
  join public.taxonomy_nodes parent_node on parent_node.id=n.parent_id and parent_node.node_type='subject'
  where n.node_type='topic' and not n.qbank_seeded
    and parent_node.slug=any(array['internal-medicine','pediatrics','surgery','psychiatry','obstetrics-gynecology'])
  on conflict(taxonomy_id) do update set discipline=excluded.discipline,topic_name=excluded.topic_name;
end $$;

create or replace function public.qbank_builder_filter_tree(
  p_exam_id uuid,
  p_all_sources boolean default true,
  p_source_ids uuid[] default '{}',
  p_all_disciplines boolean default true,
  p_full_subjects text[] default '{}',
  p_topic_ids uuid[] default '{}',
  p_other_subjects text[] default '{}',
  p_status text default 'all',
  p_difficulties smallint[] default '{}'
)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_sources jsonb;
  v_disciplines jsonb;
  v_available bigint;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not public.is_account_active() then raise exception 'account_inactive'; end if;
  if p_status not in ('all','unanswered','incorrect','saved','notes') then raise exception 'invalid_question_status'; end if;

  with base as (
    select q.* from public.questions q
    left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
    where q.exam_id=p_exam_id and q.is_published and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (coalesce(cardinality(p_difficulties),0)=0 or q.difficulty=any(p_difficulties))
      and (p_status='all'
        or (p_status='unanswered' and exists(select 1 from public.study_session_items i where i.session_id=(select ss.id from public.study_sessions ss where ss.user_id=auth.uid() and ss.status in ('completed','expired') order by coalesce(ss.finished_at,ss.created_at) desc limit 1) and i.question_id=q.id and i.is_correct is null))
        or (p_status='incorrect' and coalesce(qs.attempts,0)>coalesce(qs.correct,0))
        or (p_status='saved' and exists(select 1 from public.question_bookmarks b where b.user_id=auth.uid() and b.question_id=q.id))
        or (p_status='notes' and exists(select 1 from public.question_notes n where n.user_id=auth.uid() and n.question_id=q.id)))
    )
  select count(*) into v_available from base q
  where (p_all_sources or q.qbank_source_id=any(p_source_ids)
    or exists(select 1 from public.qbank_sources c where c.id=q.qbank_source_id and c.parent_id=any(p_source_ids)))
    and (p_all_disciplines or q.subject=any(coalesce(p_full_subjects,'{}'::text[]))
      or public.qbank_question_matches_taxonomy(q.id,p_topic_ids,p_other_subjects));

  with base as (
    select q.* from public.questions q
    left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
    where q.exam_id=p_exam_id and q.is_published and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (coalesce(cardinality(p_difficulties),0)=0 or q.difficulty=any(p_difficulties))
      and (p_status='all'
        or (p_status='unanswered' and exists(select 1 from public.study_session_items i where i.session_id=(select ss.id from public.study_sessions ss where ss.user_id=auth.uid() and ss.status in ('completed','expired') order by coalesce(ss.finished_at,ss.created_at) desc limit 1) and i.question_id=q.id and i.is_correct is null))
        or (p_status='incorrect' and coalesce(qs.attempts,0)>coalesce(qs.correct,0))
        or (p_status='saved' and exists(select 1 from public.question_bookmarks b where b.user_id=auth.uid() and b.question_id=q.id))
        or (p_status='notes' and exists(select 1 from public.question_notes n where n.user_id=auth.uid() and n.question_id=q.id)))
  ), source_counts as (
    select s.id,count(q.id)::bigint n from public.qbank_sources s
    left join base q on (q.qbank_source_id=s.id or exists(select 1 from public.qbank_sources c where c.id=q.qbank_source_id and c.parent_id=s.id))
      and (p_all_disciplines or q.subject=any(coalesce(p_full_subjects,'{}'::text[])) or public.qbank_question_matches_taxonomy(q.id,p_topic_ids,p_other_subjects))
    where s.exam_id=p_exam_id group by s.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'key',p.source_key,'name',p.name,'kind',p.source_kind,'count',coalesce(pc.n,0),
    'children',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'key',c.source_key,'name',c.name,'kind',c.source_kind,'count',coalesce(cc.n,0)) order by c.sort_order,c.name)
      from public.qbank_sources c left join source_counts cc on cc.id=c.id where c.parent_id=p.id),'[]'::jsonb)
  ) order by p.sort_order,p.name),'[]'::jsonb)
  into v_sources from public.qbank_sources p left join source_counts pc on pc.id=p.id
  where p.exam_id=p_exam_id and p.parent_id is null;

  with base as (
    select q.* from public.questions q
    left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
    where q.exam_id=p_exam_id and q.is_published and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (coalesce(cardinality(p_difficulties),0)=0 or q.difficulty=any(p_difficulties))
      and (p_status='all'
        or (p_status='unanswered' and exists(select 1 from public.study_session_items i where i.session_id=(select ss.id from public.study_sessions ss where ss.user_id=auth.uid() and ss.status in ('completed','expired') order by coalesce(ss.finished_at,ss.created_at) desc limit 1) and i.question_id=q.id and i.is_correct is null))
        or (p_status='incorrect' and coalesce(qs.attempts,0)>coalesce(qs.correct,0))
        or (p_status='saved' and exists(select 1 from public.question_bookmarks b where b.user_id=auth.uid() and b.question_id=q.id))
        or (p_status='notes' and exists(select 1 from public.question_notes n where n.user_id=auth.uid() and n.question_id=q.id)))
      and (p_all_sources or q.qbank_source_id=any(p_source_ids)
        or exists(select 1 from public.qbank_sources c where c.id=q.qbank_source_id and c.parent_id=any(p_source_ids)))
  ), discipline_counts as (
    select es.subject_key,count(distinct q.id)::bigint n from public.exam_subjects es
    left join base q on q.subject=es.subject_key or exists(
      select 1 from public.taxonomy_nodes d where d.node_type='subject'
        and lower(es.subject_key)=any(array(select lower(x) from unnest(array_append(d.aliases,d.name)) x))
        and lower(q.subject)=any(array(select lower(x) from unnest(array_append(d.aliases,d.name)) x))
    )
    where es.exam_id=p_exam_id and es.enabled group by es.subject_key
  ), topic_counts as (
    select t.id,
      case when t.name='Others' then count(q.id) filter(where not exists(
        select 1 from public.taxonomy_nodes listed
        where listed.parent_id=d.id and listed.node_type='topic' and listed.status='active' and listed.name<>'Others'
          and lower(trim(q.topic))=any(array(select lower(trim(x)) from unnest(array_append(listed.aliases,listed.name)) x))
      )) else count(q.id) filter(where lower(trim(q.topic))=any(array(select lower(trim(x)) from unnest(array_append(t.aliases,t.name)) x))) end::bigint n
    from public.taxonomy_nodes t
    join public.taxonomy_nodes d on d.id=t.parent_id and d.node_type='subject'
    left join base q on lower(q.subject)=any(array(select lower(x) from unnest(array_append(d.aliases,d.name)) x))
    where t.node_type='topic' and t.status='active' group by t.id,d.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'value',es.subject_key,'label',es.subject_key,'count',coalesce(dc.n,0),
    'topics',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'count',coalesce(tc.n,0),'isOthers',t.name='Others') order by t.sort_order,t.name)
      from public.taxonomy_nodes t join public.taxonomy_nodes d on d.id=t.parent_id
      where t.node_type='topic' and t.status='active' and lower(es.subject_key)=any(array(select lower(x) from unnest(array_append(d.aliases,d.name)) x))
      and (t.name<>'Others' or coalesce((select n from topic_counts where id=t.id),0)>0)),'[]'::jsonb)
  ) order by es.sort_order,es.subject_key),'[]'::jsonb)
  into v_disciplines from public.exam_subjects es left join discipline_counts dc on dc.subject_key=es.subject_key
  where es.exam_id=p_exam_id and es.enabled;

  return jsonb_build_object('sources',v_sources,'disciplines',v_disciplines,'available',v_available);
end $$;
revoke all on function public.qbank_builder_filter_tree(uuid,boolean,uuid[],boolean,text[],uuid[],text[],text,smallint[]) from public,anon;
grant execute on function public.qbank_builder_filter_tree(uuid,boolean,uuid[],boolean,text[],uuid[],text[],text,smallint[]) to authenticated;

create or replace function public.start_qbank_builder_session(
  p_exam_id uuid,
  p_all_sources boolean default true,
  p_source_ids uuid[] default '{}',
  p_all_disciplines boolean default true,
  p_full_subjects text[] default '{}',
  p_topic_ids uuid[] default '{}',
  p_other_subjects text[] default '{}',
  p_status text default 'all',
  p_difficulties smallint[] default '{}',
  p_question_count integer default 20,
  p_mode public.study_session_mode default 'practice'
)
returns table(session_id uuid,time_limit_seconds integer,block_count integer,block_duration_minutes integer,block_max_items integer)
language plpgsql volatile security definer set search_path=''
as $$
declare
  v_exam record;
  v_session uuid;
  v_total bigint;
  v_time integer;
  v_blocks integer;
  v_anchor uuid:=gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not public.is_account_active() then raise exception 'account_inactive'; end if;
  if p_question_count is null or p_question_count<1 or p_question_count>300 then raise exception 'invalid_question_count'; end if;
  if p_status not in ('all','unanswered','incorrect','saved','notes') then raise exception 'invalid_question_status'; end if;
  select e.id,e.code,ep.*,least(ep.product_max_items,300) product_cap into v_exam from public.exams e join public.exam_profiles ep on ep.exam_id=e.id
    where e.id=p_exam_id and ep.enabled;
  if not found then raise exception 'exam_not_found'; end if;
  if p_question_count>v_exam.product_cap then raise exception 'product_question_limit'; end if;
  if p_mode='exam' and p_question_count>least(v_exam.max_items,300) then raise exception 'exam_question_limit'; end if;
  if exists(select 1 from unnest(coalesce(p_full_subjects,'{}'::text[])) s where not exists(
    select 1 from public.exam_subjects es where es.exam_id=p_exam_id and es.subject_key=s and es.enabled)) then raise exception 'invalid_subject'; end if;
  if exists(select 1 from unnest(coalesce(p_source_ids,'{}'::uuid[])) s where not exists(
    select 1 from public.qbank_sources qs where qs.id=s and qs.exam_id=p_exam_id)) then raise exception 'invalid_source'; end if;
  v_blocks:=greatest(1,least(v_exam.block_count,ceil(p_question_count::numeric/v_exam.block_max_items)::integer));
  v_time:=case when p_mode='practice' then null when p_question_count>=least(v_exam.max_items,300) and v_exam.timing_verified then v_exam.total_duration_minutes*60 else v_blocks*v_exam.block_duration_minutes*60 end;

  with eligible as (
    select q.id from public.questions q
    left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
    where q.exam_id=p_exam_id and q.is_published and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (p_all_sources or q.qbank_source_id=any(p_source_ids)
        or exists(select 1 from public.qbank_sources c where c.id=q.qbank_source_id and c.parent_id=any(p_source_ids)))
      and (coalesce(cardinality(p_difficulties),0)=0 or q.difficulty=any(p_difficulties))
      and (p_status='all'
        or (p_status='unanswered' and exists(select 1 from public.study_session_items i where i.session_id=(select ss.id from public.study_sessions ss where ss.user_id=auth.uid() and ss.status in ('completed','expired') order by coalesce(ss.finished_at,ss.created_at) desc limit 1) and i.question_id=q.id and i.is_correct is null))
        or (p_status='incorrect' and coalesce(qs.attempts,0)>coalesce(qs.correct,0))
        or (p_status='saved' and exists(select 1 from public.question_bookmarks b where b.user_id=auth.uid() and b.question_id=q.id))
        or (p_status='notes' and exists(select 1 from public.question_notes n where n.user_id=auth.uid() and n.question_id=q.id)))
      and (p_all_disciplines or q.subject=any(coalesce(p_full_subjects,'{}'::text[])) or public.qbank_question_matches_taxonomy(q.id,p_topic_ids,p_other_subjects))
  ) select count(*) into v_total from eligible;
  if v_total<p_question_count then raise exception 'insufficient_questions'; end if;

  insert into public.study_sessions(user_id,exam_id,mode,requested_count,time_limit_seconds,break_seconds_allowed,configuration,current_block,current_position)
  values(auth.uid(),p_exam_id,p_mode,p_question_count,v_time,
    case when p_mode='exam' and p_question_count>=least(v_exam.max_items,300) and v_blocks>1 then v_exam.break_minutes*60 else 0 end,jsonb_build_object(
    'builder_version',1,'source_ids',to_jsonb(coalesce(p_source_ids,'{}'::uuid[])),
    'subjects',to_jsonb(coalesce(p_full_subjects,'{}'::text[])),
    'topic_ids',to_jsonb(coalesce(p_topic_ids,'{}'::uuid[])),
    'other_subjects',to_jsonb(coalesce(p_other_subjects,'{}'::text[])),
    'status',p_status,'difficulties',to_jsonb(coalesce(p_difficulties,'{}'::smallint[])),
    'exam_code',v_exam.code,'timing_policy',case when p_mode='exam' then 'scaled_block_pacing' else 'untimed_practice' end
  ),1,1) returning id into v_session;

  insert into public.study_session_items(session_id,position,block_number,question_id)
  with eligible as (
    select q.id,case when qs.attempts is null or qs.attempts=0 then 5000
      when qs.attempts>qs.correct then 4000
      else (100-round((qs.correct::numeric/nullif(qs.attempts,0))*100,2))*4 end
      + case when qs.last_attempt_at is null then 50 else greatest(0,extract(epoch from now()-qs.last_attempt_at)/86400)::numeric end as score
    from public.questions q left join public.learner_question_stats qs on qs.user_id=auth.uid() and qs.question_id=q.id
    where q.exam_id=p_exam_id and q.is_published and q.workflow_status='published'
      and (q.access_tier='free' or public.has_active_subscription())
      and (p_all_sources or q.qbank_source_id=any(p_source_ids)
        or exists(select 1 from public.qbank_sources c where c.id=q.qbank_source_id and c.parent_id=any(p_source_ids)))
      and (coalesce(cardinality(p_difficulties),0)=0 or q.difficulty=any(p_difficulties))
      and (p_status='all'
        or (p_status='unanswered' and exists(select 1 from public.study_session_items i where i.session_id=(select ss.id from public.study_sessions ss where ss.user_id=auth.uid() and ss.status in ('completed','expired') order by coalesce(ss.finished_at,ss.created_at) desc limit 1) and i.question_id=q.id and i.is_correct is null))
        or (p_status='incorrect' and coalesce(qs.attempts,0)>coalesce(qs.correct,0))
        or (p_status='saved' and exists(select 1 from public.question_bookmarks b where b.user_id=auth.uid() and b.question_id=q.id))
        or (p_status='notes' and exists(select 1 from public.question_notes n where n.user_id=auth.uid() and n.question_id=q.id)))
      and (p_all_disciplines or q.subject=any(coalesce(p_full_subjects,'{}'::text[])) or public.qbank_question_matches_taxonomy(q.id,p_topic_ids,p_other_subjects))
  ), ranked as (
    select id,row_number() over(order by case when p_mode='exam' then 0 else 1 end,
      case when p_mode='practice' then score end desc,md5(id::text||v_anchor::text))::integer pos from eligible
  ) select v_session,pos,ceil(pos::numeric/v_exam.block_max_items)::integer,id from ranked where pos<=p_question_count;

  perform public.record_learning_event(auth.uid(),'study_session_started','study_session',v_session,v_session,
    jsonb_build_object('exam_id',p_exam_id,'mode',p_mode,'question_count',p_question_count,'builder_version',1));
  return query select v_session,v_time,v_blocks,v_exam.block_duration_minutes,v_exam.block_max_items;
end $$;
revoke all on function public.start_qbank_builder_session(uuid,boolean,uuid[],boolean,text[],uuid[],text[],text,smallint[],integer,public.study_session_mode) from public,anon;
grant execute on function public.start_qbank_builder_session(uuid,boolean,uuid[],boolean,text[],uuid[],text[],text,smallint[],integer,public.study_session_mode) to authenticated;
