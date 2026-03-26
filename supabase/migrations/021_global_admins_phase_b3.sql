-- Phase B3: separate platform-wide system admin scope from church membership roles

create table if not exists public.global_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.global_admins is 'Platform-wide system administrators. Separate from church membership roles.';

alter table public.global_admins enable row level security;

create policy "global_admins_select_self" on public.global_admins
for select using (auth.uid() = user_id);

create policy "global_admins_service_role_only" on public.global_admins
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
