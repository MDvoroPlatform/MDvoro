-- Make unmatched legacy topics selectable through each discipline's "Others" option.
-- Also recognize the common spelling used by existing OB/GYN questions.
update public.taxonomy_nodes
set aliases = array(
  select distinct alias
  from unnest(coalesce(aliases, '{}'::text[]) || array['obstetrics and gynecology']::text[]) as alias
)
where node_type='subject' and parent_id is null and slug='obstetrics-gynecology';

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
          and (
            (t.name<>'Others' and lower(trim(q.topic))=any(array(select lower(trim(x)) from unnest(array_append(t.aliases,t.name)) x)))
            or (t.name='Others' and not exists (
              select 1 from public.taxonomy_nodes known
              where known.node_type='topic' and known.parent_id=d.id and known.name<>'Others'
                and lower(trim(q.topic))=any(array(select lower(trim(x)) from unnest(array_append(known.aliases,known.name)) x))
            ))
          )
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
