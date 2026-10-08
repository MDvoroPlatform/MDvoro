-- MDvoro Phase 17: student Medical Library access + locale-safe content foundation.
-- Non-destructive. Published medical knowledge is visible to signed-in learners only.

drop policy if exists "students read published knowledge cards" on public.knowledge_cards;
create policy "students read published knowledge cards"
on public.knowledge_cards
for select to authenticated
using (status = 'published');

drop policy if exists "students read active taxonomy" on public.taxonomy_nodes;
create policy "students read active taxonomy"
on public.taxonomy_nodes
for select to authenticated
using (status = 'active');

create index if not exists knowledge_cards_published_updated_idx
  on public.knowledge_cards(status, updated_at desc)
  where status = 'published';
