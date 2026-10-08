-- MDvoro Phase 28: deterministic 2–3 word key-term hints for learner recall.

create or replace function public.student_key_terms(p_question_id uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (
      select array_agg(x.term order by x.rank)
      from (
        select trim(regexp_replace(n.name, '^(([^[:space:]]+[[:space:]]+){0,2}[^[:space:]]+).*$', '\1')) as term,
               row_number() over(order by qt.is_primary desc, n.node_type, n.sort_order, n.name) as rank
        from public.question_taxonomy qt
        join public.taxonomy_nodes n on n.id=qt.taxonomy_id
        where qt.question_id=p_question_id and n.status='active'
      ) x
      where x.rank <= 3 and nullif(x.term,'') is not null
    ),
    (
      select case
        when nullif(trim(q.topic),'') is null then array[]::text[]
        else array[trim(regexp_replace(trim(q.topic), '^(([^[:space:]]+[[:space:]]+){0,2}[^[:space:]]+).*$', '\1'))]::text[]
      end
      from public.questions q
      where q.id=p_question_id
    ),
    array[]::text[]
  );
$$;
revoke all on function public.student_key_terms(uuid) from public,anon,authenticated;
grant execute on function public.student_key_terms(uuid) to authenticated;
