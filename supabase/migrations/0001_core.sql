create extension if not exists pgcrypto;

create type public.user_role as enum ('student','admin');
create type public.subscription_status as enum ('trialing','active','past_due','canceled','expired');

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) between 2 and 32),
  name text not null check (char_length(name) between 2 and 120),
  description text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) between 2 and 80),
  avatar_url text,
  role public.user_role not null default 'student',
  active_exam_id uuid references public.exams(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.subscription_status not null,
  provider text not null,
  provider_customer_id text,
  provider_subscription_id text unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete restrict,
  stem text not null check (char_length(stem) between 10 and 20000),
  explanation text,
  subject text not null check (char_length(subject) between 1 and 120),
  topic text,
  options jsonb not null default '[]'::jsonb,
  answer_key text,
  difficulty smallint check (difficulty between 1 and 5),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  selected_answer text,
  is_correct boolean,
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 3600000),
  confidence smallint check (confidence is null or confidence between 1 and 5),
  created_at timestamptz not null default now()
);

create table public.flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now()
);

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid references public.flashcard_decks(id) on delete cascade,
  front text not null check (char_length(front) between 1 and 10000),
  back text not null check (char_length(back) between 1 and 20000),
  due_at timestamptz not null default now(),
  interval_days numeric(10,2) not null default 0,
  ease_factor numeric(5,2) not null default 2.5 check (ease_factor between 1.3 and 4.0),
  repetitions integer not null default 0 check (repetitions >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  flashcard_id uuid not null references public.flashcards(id) on delete cascade,
  rating smallint not null check (rating between 0 and 5),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 3600000),
  reviewed_at timestamptz not null default now()
);

create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete restrict,
  target_date date,
  daily_minutes smallint check (daily_minutes is null or daily_minutes between 5 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index questions_exam_published_idx on public.questions(exam_id, is_published);
create index question_attempts_user_created_idx on public.question_attempts(user_id, created_at desc);
create index question_attempts_user_question_idx on public.question_attempts(user_id, question_id);
create index flashcards_owner_due_idx on public.flashcards(owner_id, due_at);
create index flashcard_reviews_user_reviewed_idx on public.flashcard_reviews(user_id, reviewed_at desc);
create index subscriptions_user_status_idx on public.subscriptions(user_id, status);

create or replace function public.set_updated_at() returns trigger language plpgsql security invoker as $$
begin new.updated_at = now(); return new; end; $$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger questions_updated_at before update on public.questions for each row execute function public.set_updated_at();
create trigger flashcards_updated_at before update on public.flashcards for each row execute function public.set_updated_at();
create trigger study_plans_updated_at before update on public.study_plans for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name) values (new.id, nullif(left(coalesce(new.raw_user_meta_data->>'full_name',''),80), '')) on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.has_active_subscription() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.subscriptions s where s.user_id = auth.uid() and s.status in ('trialing','active') and (s.current_period_end is null or s.current_period_end > now()));
$$;
revoke all on function public.has_active_subscription() from public;
grant execute on function public.has_active_subscription() to authenticated;

create or replace function public.set_active_exam(target_exam uuid) returns void
language plpgsql security invoker as $$
begin
  if not exists(select 1 from public.exams where id = target_exam) then raise exception 'exam_not_found'; end if;
  update public.profiles set active_exam_id = target_exam where id = auth.uid();
  if not found then raise exception 'profile_not_found'; end if;
end; $$;

alter table public.exams enable row level security;
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.questions enable row level security;
alter table public.question_attempts enable row level security;
alter table public.flashcard_decks enable row level security;
alter table public.flashcards enable row level security;
alter table public.flashcard_reviews enable row level security;
alter table public.study_plans enable row level security;

create policy "authenticated users can read exams" on public.exams for select to authenticated using (true);
create policy "users read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "users update own safe profile fields" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = 'student');

create policy "subscribed users read published questions" on public.questions for select to authenticated using (is_published = true and public.has_active_subscription());

create policy "users read own attempts" on public.question_attempts for select to authenticated using (user_id = auth.uid());
create policy "users create own attempts" on public.question_attempts for insert to authenticated with check (user_id = auth.uid());

create policy "owners read decks" on public.flashcard_decks for select to authenticated using (owner_id = auth.uid());
create policy "owners create decks" on public.flashcard_decks for insert to authenticated with check (owner_id = auth.uid());
create policy "owners update decks" on public.flashcard_decks for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners delete decks" on public.flashcard_decks for delete to authenticated using (owner_id = auth.uid());

create policy "owners read cards" on public.flashcards for select to authenticated using (owner_id = auth.uid());
create policy "owners create cards" on public.flashcards for insert to authenticated with check (owner_id = auth.uid());
create policy "owners update cards" on public.flashcards for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners delete cards" on public.flashcards for delete to authenticated using (owner_id = auth.uid());

create policy "users read own reviews" on public.flashcard_reviews for select to authenticated using (user_id = auth.uid());
create policy "users create own reviews" on public.flashcard_reviews for insert to authenticated with check (user_id = auth.uid() and exists(select 1 from public.flashcards f where f.id = flashcard_id and f.owner_id = auth.uid()));

create policy "users read own study plans" on public.study_plans for select to authenticated using (user_id = auth.uid());
create policy "users create own study plans" on public.study_plans for insert to authenticated with check (user_id = auth.uid());
create policy "users update own study plans" on public.study_plans for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users delete own study plans" on public.study_plans for delete to authenticated using (user_id = auth.uid());

revoke all on public.subscriptions from anon, authenticated;
revoke all on public.questions from anon, authenticated;
grant select on public.questions to authenticated;

insert into public.exams(code,name,description) values ('IMLE','Israeli Medical Licensing Examination','Medical licensing exam workspace') on conflict(code) do nothing;
