-- MDvoro Phase 4: governed medical taxonomy + knowledge graph foundation.
-- No destructive changes. Taxonomy is reusable across questions, media and future learning features.

create table if not exists public.taxonomy_nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.taxonomy_nodes(id) on delete restrict,
  node_type text not null check (node_type in ('subject','topic','subtopic','concept','disease','drug','procedure')),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 160),
  description text,
  status text not null default 'active' check (status in ('active','archived')),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(parent_id, slug)
);

create index if not exists taxonomy_nodes_parent_idx on public.taxonomy_nodes(parent_id, sort_order, name);
create index if not exists taxonomy_nodes_type_idx on public.taxonomy_nodes(node_type, status, name);
create trigger taxonomy_nodes_updated_at before update on public.taxonomy_nodes for each row execute function public.set_updated_at();

create table if not exists public.question_taxonomy (
  question_id uuid not null references public.questions(id) on delete cascade,
  taxonomy_id uuid not null references public.taxonomy_nodes(id) on delete restrict,
  is_primary boolean not null default false,
  primary key(question_id, taxonomy_id)
);
create index if not exists question_taxonomy_taxonomy_idx on public.question_taxonomy(taxonomy_id, question_id);

create table if not exists public.knowledge_cards (
  id uuid primary key default gen_random_uuid(),
  stable_code text not null unique,
  title text not null check (char_length(title) between 2 and 180),
  summary text,
  body_md text not null,
  status text not null default 'draft' check (status in ('draft','in_review','published','archived')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger knowledge_cards_updated_at before update on public.knowledge_cards for each row execute function public.set_updated_at();

create table if not exists public.question_knowledge (
  question_id uuid not null references public.questions(id) on delete cascade,
  knowledge_id uuid not null references public.knowledge_cards(id) on delete restrict,
  relation text not null default 'explains' check (relation in ('explains','prerequisite','related')),
  primary key(question_id, knowledge_id)
);

alter table public.taxonomy_nodes enable row level security;
alter table public.question_taxonomy enable row level security;
alter table public.knowledge_cards enable row level security;
alter table public.question_knowledge enable row level security;

create policy "staff read taxonomy" on public.taxonomy_nodes for select to authenticated using (public.has_permission('content.read'));
create policy "editors write taxonomy" on public.taxonomy_nodes for insert to authenticated with check (public.has_permission('content.write') and created_by = auth.uid());
create policy "editors update taxonomy" on public.taxonomy_nodes for update to authenticated using (public.has_permission('content.write')) with check (public.has_permission('content.write'));
create policy "admins archive taxonomy" on public.taxonomy_nodes for delete to authenticated using (public.has_permission('content.archive'));

create policy "staff read question taxonomy" on public.question_taxonomy for select to authenticated using (public.has_permission('content.read'));
create policy "editors manage question taxonomy" on public.question_taxonomy for insert to authenticated with check (public.has_permission('content.write'));
create policy "editors delete question taxonomy" on public.question_taxonomy for delete to authenticated using (public.has_permission('content.write'));

create policy "staff read knowledge cards" on public.knowledge_cards for select to authenticated using (public.has_permission('content.read'));
create policy "editors create knowledge cards" on public.knowledge_cards for insert to authenticated with check (public.has_permission('content.write') and created_by = auth.uid());
create policy "editors update knowledge cards" on public.knowledge_cards for update to authenticated using (public.has_permission('content.write')) with check (public.has_permission('content.write'));
create policy "admins delete knowledge cards" on public.knowledge_cards for delete to authenticated using (public.has_permission('content.archive'));

create policy "staff read question knowledge" on public.question_knowledge for select to authenticated using (public.has_permission('content.read'));
create policy "editors manage question knowledge" on public.question_knowledge for insert to authenticated with check (public.has_permission('content.write'));
create policy "editors delete question knowledge" on public.question_knowledge for delete to authenticated using (public.has_permission('content.write'));

create or replace function public.admin_taxonomy_tree(p_parent_id uuid default null)
returns table(id uuid,parent_id uuid,node_type text,slug text,name text,description text,status text,sort_order integer,child_count bigint)
language sql stable security definer set search_path=public as $$
  select n.id,n.parent_id,n.node_type,n.slug,n.name,n.description,n.status,n.sort_order,
    (select count(*) from public.taxonomy_nodes c where c.parent_id=n.id) as child_count
  from public.taxonomy_nodes n
  where public.has_permission('content.read') and n.parent_id is not distinct from p_parent_id
  order by n.sort_order,n.name;
$$;
revoke all on function public.admin_taxonomy_tree(uuid) from public;
grant execute on function public.admin_taxonomy_tree(uuid) to authenticated;

create or replace function public.upsert_taxonomy_node(
  p_id uuid default null,
  p_parent_id uuid default null,
  p_node_type text default 'topic',
  p_slug text default '',
  p_name text default '',
  p_description text default null,
  p_sort_order integer default 0
)
returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.has_permission('content.write') then raise exception 'forbidden'; end if;
  if p_node_type not in ('subject','topic','subtopic','concept','disease','drug','procedure') then raise exception 'invalid_node_type'; end if;
  if p_id is null then
    insert into public.taxonomy_nodes(parent_id,node_type,slug,name,description,sort_order,created_by)
    values(p_parent_id,p_node_type,p_slug,p_name,p_description,coalesce(p_sort_order,0),auth.uid()) returning id into v_id;
  else
    update public.taxonomy_nodes set parent_id=p_parent_id,node_type=p_node_type,slug=p_slug,name=p_name,description=p_description,sort_order=coalesce(p_sort_order,0)
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'taxonomy_not_found'; end if;
  end if;
  insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),'taxonomy',v_id,case when p_id is null then 'created' else 'updated' end,jsonb_build_object('node_type',p_node_type));
  return v_id;
end;
$$;
revoke all on function public.upsert_taxonomy_node(uuid,uuid,text,text,text,text,integer) from public;
grant execute on function public.upsert_taxonomy_node(uuid,uuid,text,text,text,text,integer) to authenticated;
