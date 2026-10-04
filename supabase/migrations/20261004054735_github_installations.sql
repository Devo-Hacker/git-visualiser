-- Which user owns which GitHub App installation (proven during the install callback)
create table public.github_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  installation_id bigint not null,
  account_login text not null,
  account_type text not null check (account_type in ('User', 'Organization')),
  created_at timestamptz not null default now(),
  unique (user_id, installation_id)
);
create index github_installations_user_id_idx
  on public.github_installations (user_id);

alter table public.github_installations enable row level security;

-- Users can read their own links. Only the backend writes them.
create policy "users read own installations"
  on public.github_installations for select
  using ((select auth.uid()) = user_id);