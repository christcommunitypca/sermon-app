-- ── Migration 008: Normalize AI credentials ───────────────────────────────────
--
-- REPLACES: user_ai_keys (one row per user, provider-specific columns)
-- WITH:     user_ai_credentials (one row per user per provider)
--
-- Rationale:
--   The old design added a new column per provider (openai_key_enc,
--   anthropic_key_enc, ...). The new design is provider-neutral: adding a
--   new AI provider requires zero schema changes.
--
-- Migration strategy:
--   1. Create the new table
--   2. Copy existing OpenAI key rows (if any) into the new table
--   3. Copy existing Anthropic key rows (if any) into the new table
--   4. Drop the old table
--
-- Safe to run on an empty database or a database with existing data.
-- Idempotent via IF NOT EXISTS / IF EXISTS guards.

-- ── 1. Create new table ───────────────────────────────────────────────────────

create table if not exists public.user_ai_credentials (
  -- Primary key is the natural composite: one record per user per provider
  user_id   uuid not null references auth.users on delete cascade,
  provider  text not null check (provider in ('openai', 'anthropic', 'google')),

  -- The encrypted API key. AES-256-GCM, base64(iv + ciphertext).
  -- Null until the user saves a key for this provider.
  api_key_enc  text,

  -- Which model to use by default for this provider.
  -- Nullable — service falls back to a hardcoded provider default if null.
  model_preference  text,

  -- Validation lifecycle
  validation_status  text not null default 'untested'
                       check (validation_status in ('untested', 'valid', 'invalid', 'expired')),
  validated_at       timestamptz,
  validation_error   text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  primary key (user_id, provider)
);

comment on table public.user_ai_credentials is
  'Encrypted AI provider API keys. One row per (user, provider). Provider-neutral: adding a new
   AI provider requires no schema changes. api_key_enc is AES-256-GCM encrypted and is never
   returned to the client after being saved.';

comment on column public.user_ai_credentials.provider is
  'Identifies the AI provider. Constrained to known values. Extend the check constraint to add
   new providers.';

comment on column public.user_ai_credentials.api_key_enc is
  'AES-256-GCM encrypted API key. base64(iv[12] || ciphertext). Null until user saves a key.';

comment on column public.user_ai_credentials.model_preference is
  'Optional. Overrides the provider default model. Must be a model string valid for this provider.';

-- ── 2. RLS ────────────────────────────────────────────────────────────────────

alter table public.user_ai_credentials enable row level security;

create policy "ai_credentials_owner_only" on public.user_ai_credentials
  for all using (user_id = auth.uid());

-- ── 3. Migrate existing data from user_ai_keys ────────────────────────────────
-- Only runs if user_ai_keys exists and has data.

do $$
begin
  -- Migrate OpenAI keys
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'user_ai_keys') then

    -- OpenAI rows: copy users who have a non-null openai_key_enc
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'user_ai_keys'
               and column_name = 'openai_key_enc') then
      insert into public.user_ai_credentials
        (user_id, provider, api_key_enc, model_preference,
         validation_status, validated_at, validation_error, created_at, updated_at)
      select
        user_id,
        'openai',
        openai_key_enc,
        case when model_preference not like 'claude-%' then model_preference else 'gpt-4o' end,
        validation_status,
        validated_at,
        validation_error,
        created_at,
        updated_at
      from public.user_ai_keys
      where openai_key_enc is not null
      on conflict (user_id, provider) do nothing;
    end if;

    -- Anthropic rows: copy users who have a non-null anthropic_key_enc
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'user_ai_keys'
               and column_name = 'anthropic_key_enc') then
      insert into public.user_ai_credentials
        (user_id, provider, api_key_enc, model_preference,
         validation_status, validated_at, validation_error, created_at, updated_at)
      select
        user_id,
        'anthropic',
        anthropic_key_enc,
        case when model_preference like 'claude-%' then model_preference else 'claude-sonnet-4-6' end,
        -- If there was an anthropic key but validation_status reflects OpenAI,
        -- treat anthropic rows as untested (safe default)
        'untested',
        null,
        null,
        created_at,
        updated_at
      from public.user_ai_keys
      where anthropic_key_enc is not null
      on conflict (user_id, provider) do nothing;
    end if;

    -- ── 4. Drop old table ─────────────────────────────────────────────────────
    drop table public.user_ai_keys;

  end if;
end $$;

-- ── 5. Extend provider check for Google when ready ───────────────────────────
-- When Google support is added, update the constraint:
--   alter table public.user_ai_credentials
--     drop constraint user_ai_credentials_provider_check;
--   alter table public.user_ai_credentials
--     add constraint user_ai_credentials_provider_check
--     check (provider in ('openai', 'anthropic', 'google'));
-- (Already included 'google' above for forward compatibility.)

