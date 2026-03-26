-- 022_invitations_and_system_templates.sql

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  church_id uuid references public.churches(id) on delete cascade,
  target_role text,
  assign_system_admin boolean not null default false,
  status text not null default 'pending',
  token uuid not null default gen_random_uuid() unique,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_invitations_status_check check (status in ('pending','accepted','revoked','expired'))
);

create table if not exists public.invitation_church_assignments (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.user_invitations(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  constraint invitation_church_assignments_role_check check (role in ('owner','admin','teacher'))
);

create unique index if not exists invitation_church_assignments_unique_idx
  on public.invitation_church_assignments(invitation_id, church_id);

create index if not exists user_invitations_email_idx on public.user_invitations(email);
create index if not exists user_invitations_status_idx on public.user_invitations(status);
create index if not exists invitation_church_assignments_church_idx on public.invitation_church_assignments(church_id);

create table if not exists public.system_flow_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  explanation text,
  steps jsonb not null default '[]'::jsonb,
  recommended_for text[] not null default '{}',
  is_default_for text,
  tradition_tags text[] not null default '{}',
  style_tags text[] not null default '{}',
  influenced_by text[] not null default '{}',
  is_archived boolean not null default false,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_invitations enable row level security;
alter table public.invitation_church_assignments enable row level security;
alter table public.system_flow_templates enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_invitations' and policyname = 'user_invitations_none') then
    create policy "user_invitations_none" on public.user_invitations for all using (false) with check (false);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invitation_church_assignments' and policyname = 'invitation_assignments_none') then
    create policy "invitation_assignments_none" on public.invitation_church_assignments for all using (false) with check (false);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'system_flow_templates' and policyname = 'system_flow_templates_read_for_members') then
    create policy "system_flow_templates_read_for_members" on public.system_flow_templates
      for select using (
        exists (
          select 1 from public.church_members cm
          where cm.user_id = auth.uid() and cm.is_active = true
        )
      );
  end if;
end $$;
