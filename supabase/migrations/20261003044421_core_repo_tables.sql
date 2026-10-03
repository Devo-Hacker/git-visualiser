-- A repository a user has connected
create table public.repositories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  github_repo_id bigint not null,
  owner text not null,
  name text not null,
  default_branch text not null default 'main',
  is_private boolean not null default false,
  installation_id bigint,
  status text not null default 'pending'
    check (status in ('pending', 'importing', 'ready', 'failed')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, github_repo_id)
);
create index repositories_user_id_idx on public.repositories (user_id);

-- Commits: the nodes of the graph
create table public.commits (
  repository_id uuid not null references public.repositories (id) on delete cascade,
  sha text not null,
  message text not null,
  author_name text,
  author_login text,
  authored_at timestamptz not null,
  additions integer,
  deletions integer,
  files_changed integer,
  primary key (repository_id, sha)
);
create index commits_repo_time_idx on public.commits (repository_id, authored_at desc);
create index commits_message_trgm_idx
  on public.commits using gin (message extensions.gin_trgm_ops);

-- Parent links: the edges of the graph (a merge commit has two rows)
create table public.commit_edges (
  repository_id uuid not null,
  child_sha text not null,
  parent_sha text not null,
  parent_order smallint not null default 0,
  primary key (repository_id, child_sha, parent_sha),
  foreign key (repository_id, child_sha)
    references public.commits (repository_id, sha) on delete cascade
);
create index commit_edges_parent_idx on public.commit_edges (repository_id, parent_sha);

-- Branch pointers
create table public.branches (
  repository_id uuid not null references public.repositories (id) on delete cascade,
  name text not null,
  head_sha text not null,
  is_default boolean not null default false,
  primary key (repository_id, name)
);

-- Per-file changes for the commit inspector and file history
create table public.commit_files (
  repository_id uuid not null,
  sha text not null,
  path text not null,
  status text not null check (status in ('added', 'modified', 'removed', 'renamed')),
  additions integer not null default 0,
  deletions integer not null default 0,
  primary key (repository_id, sha, path),
  foreign key (repository_id, sha)
    references public.commits (repository_id, sha) on delete cascade
);
create index commit_files_path_idx on public.commit_files (repository_id, path);

-- Import and sync jobs, claimed by the background worker
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.repositories (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed')),
  attempts integer not null default 0,
  error_log text,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index import_jobs_pending_idx on public.import_jobs (created_at)
  where status = 'pending';

-- Row-level security
alter table public.repositories enable row level security;
alter table public.commits enable row level security;
alter table public.commit_edges enable row level security;
alter table public.branches enable row level security;
alter table public.commit_files enable row level security;
alter table public.import_jobs enable row level security;

-- Users can see and disconnect their own repositories.
-- There is no insert or update policy: only the backend creates and updates them.
create policy "users read own repositories"
  on public.repositories for select
  using ((select auth.uid()) = user_id);

create policy "users delete own repositories"
  on public.repositories for delete
  using ((select auth.uid()) = user_id);

-- Child tables are readable only through a repository the user owns
create policy "users read own commits" on public.commits for select
  using (exists (select 1 from public.repositories r
    where r.id = commits.repository_id and r.user_id = (select auth.uid())));

create policy "users read own commit edges" on public.commit_edges for select
  using (exists (select 1 from public.repositories r
    where r.id = commit_edges.repository_id and r.user_id = (select auth.uid())));

create policy "users read own branches" on public.branches for select
  using (exists (select 1 from public.repositories r
    where r.id = branches.repository_id and r.user_id = (select auth.uid())));

create policy "users read own commit files" on public.commit_files for select
  using (exists (select 1 from public.repositories r
    where r.id = commit_files.repository_id and r.user_id = (select auth.uid())));

create policy "users read own import jobs" on public.import_jobs for select
  using (exists (select 1 from public.repositories r
    where r.id = import_jobs.repository_id and r.user_id = (select auth.uid())));