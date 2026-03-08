-- Migration 001: Core tenancy, identity, and permissions
-- Run: supabase db push  OR  psql -f this file

-- ─────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- for full-text search
create extension if not exists "unaccent";

-- ─────────────────────────────────────────────
-- Churches
-- ─────────────────────────────────────────────
create table public.churches (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  owner_id    uuid references auth.users on delete set null,
  settings    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
comment on table public.churches is 'Root tenant entity. One row per church.';

alter table public.churches enable row level security;

-- Church is readable by any active member
create policy "church_select_members" on public.churches
  for select using (
    exists (
      select 1 from public.church_members cm
      where cm.church_id = churches.id
        and cm.user_id = auth.uid()
        and cm.is_active = true
    )
  );

-- Only service role can insert/update/delete churches
-- (no self-serve church creation in MVP)

-- ─────────────────────────────────────────────
-- Church members
-- ─────────────────────────────────────────────
create table public.church_members (
  id          uuid primary key default uuid_generate_v4(),
  church_id   uuid not null references public.churches on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  role        text not null check (role in ('owner', 'admin', 'teacher')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (church_id, user_id)
);
comment on table public.church_members is 'Links auth users to churches with a role. Multi-church support requires no schema change.';

alter table public.church_members enable row level security;

-- Members can read their own membership rows
create policy "church_members_select_self" on public.church_members
  for select using (user_id = auth.uid());

-- Admins and owners can read all members in their church
create policy "church_members_select_admins" on public.church_members
  for select using (
    exists (
      select 1 from public.church_members cm
      where cm.church_id = church_members.church_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
        and cm.is_active = true
    )
  );

-- ─────────────────────────────────────────────
-- Profiles
-- ─────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  avatar_url  text,
  bio         text,
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'Public profile data. One row per auth user, auto-created on first sign-in.';

alter table public.profiles enable row level security;

-- Profiles readable by any active church member sharing a church
create policy "profiles_select_church_members" on public.profiles
  for select using (
    exists (
      select 1 from public.church_members cm
      join public.church_members cm2 on cm2.church_id = cm.church_id
      where cm.user_id = profiles.id
        and cm2.user_id = auth.uid()
        and cm.is_active = true
        and cm2.is_active = true
    )
  );

-- Users can update their own profile
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid());

-- Users can insert their own profile
create policy "profiles_insert_self" on public.profiles
  for insert with check (id = auth.uid());

-- Trigger: auto-create profile on auth user creation
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────
-- AI Keys
-- ─────────────────────────────────────────────
create table public.user_ai_keys (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null unique references auth.users on delete cascade,
  openai_key_enc      text,                         -- AES-256-GCM encrypted, null until set
  model_preference    text not null default 'gpt-4o',
  validation_status   text not null default 'untested'
                        check (validation_status in ('untested', 'valid', 'invalid', 'expired')),
  validated_at        timestamptz,
  validation_error    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.user_ai_keys is 'Encrypted OpenAI API keys. One row per user. Key never returned to client after save.';

alter table public.user_ai_keys enable row level security;

-- Only the owner of the key can read or modify it
create policy "ai_keys_owner_only" on public.user_ai_keys
  for all using (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- Audit log
-- ─────────────────────────────────────────────
create table public.audit_log (
  id              uuid primary key default uuid_generate_v4(),
  church_id       uuid not null references public.churches on delete cascade,
  actor_user_id   uuid references auth.users on delete set null,
  action          text not null,
  entity_type     text,
  entity_id       uuid,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
comment on table public.audit_log is 'Append-only audit trail. Never update or delete rows.';

alter table public.audit_log enable row level security;

create policy "audit_log_select_admins" on public.audit_log
  for select using (
    exists (
      select 1 from public.church_members cm
      where cm.church_id = audit_log.church_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
        and cm.is_active = true
    )
  );

-- Inserts only via service role (server-side)
create index audit_log_church_created_idx on public.audit_log (church_id, created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
