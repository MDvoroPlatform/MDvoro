-- Match the existing free-text topic spelling to the seeded Endocrinology topic.
update public.taxonomy_nodes t
set aliases = array(
  select distinct alias
  from unnest(coalesce(t.aliases, '{}'::text[]) || array['endocrine']::text[]) as alias
)
where t.node_type='topic' and t.slug='endocrinology'
  and exists (
    select 1 from public.taxonomy_nodes d
    where d.id=t.parent_id and d.node_type='subject' and d.slug='internal-medicine'
  );
