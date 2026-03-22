create extension if not exists pgcrypto;

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  site_url text not null,
  channels text[] not null default '{}',
  notes text,
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_runs_created_at_idx
  on public.agent_runs (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists agent_runs_set_updated_at on public.agent_runs;

create trigger agent_runs_set_updated_at
before update on public.agent_runs
for each row
execute procedure public.set_updated_at();
