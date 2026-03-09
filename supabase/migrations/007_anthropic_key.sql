-- ── Migration 007: Add Anthropic API key support ──────────────────────────────
-- Adds anthropic_key_enc column to user_ai_keys.
-- The existing openai_key_enc column is unchanged.
-- Both columns are nullable — only the active provider's column needs to be set.
-- The table comment is updated to reflect multi-provider support.

alter table public.user_ai_keys
  add column if not exists anthropic_key_enc text;

comment on table public.user_ai_keys is
  'Encrypted AI provider API keys. One row per user. Keys are never returned to the client after save.
   openai_key_enc: AES-256-GCM encrypted OpenAI key (sk-...).
   anthropic_key_enc: AES-256-GCM encrypted Anthropic key (sk-ant-...).
   validation_status and model_preference apply to whichever provider is currently active (AI_PROVIDER env var).';

comment on column public.user_ai_keys.openai_key_enc is
  'AES-256-GCM encrypted OpenAI API key. Null if not set.';

comment on column public.user_ai_keys.anthropic_key_enc is
  'AES-256-GCM encrypted Anthropic API key. Null if not set.';
