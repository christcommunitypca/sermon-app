begin;

create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.teaching_sessions(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  task text not null check (task in ('outline')),
  status text not null check (status in ('started','responded','parse_failed','parsed','failed','saved')),
  provider text,
  model text,
  prompt_version text,
  prompt_system text,
  prompt_user text,
  raw_response text,
  parsed_response jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_generations_session_created_idx
  on public.ai_generations(session_id, created_at desc);

create index if not exists ai_generations_status_idx
  on public.ai_generations(status, created_at desc);

alter table public.ai_generations enable row level security;
revoke all on table public.ai_generations from anon, authenticated;

commit;
