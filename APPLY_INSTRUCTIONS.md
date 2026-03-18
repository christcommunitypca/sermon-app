# Normalized AI Credentials — Apply Instructions

## Overview

This refactor replaces `user_ai_keys` (one row per user, provider-specific columns)
with `user_ai_credentials` (one row per user per provider). It is a breaking schema
change. Follow these steps in order.

---

## Step 1 — Apply the migration

### If migration 007 was NOT yet applied to your database

Skip 007 entirely. Apply 008 directly:

```sql
-- Run supabase/migrations/008_normalize_ai_credentials.sql in Supabase SQL Editor
-- or via CLI: supabase db push
```

### If migration 007 WAS already applied (user_ai_keys has anthropic_key_enc column)

008 handles this. The DO block checks for the existence of `user_ai_keys` and both
columns before migrating. Run 008 and it will migrate + drop the old table safely.

### Verify

After migration, run this in SQL Editor to confirm:

```sql
-- Should exist
select * from public.user_ai_credentials limit 5;

-- Should NOT exist (dropped by migration)
select * from public.user_ai_keys limit 1;
```

---

## Step 2 — Update .env.local

Replace your current AI-related env vars with:

```
# Active provider
AI_PROVIDER=anthropic

# Skip real API validation calls (set to true only for local dev without a real key)
AI_MOCK_VALIDATION=false

# Remove these if present — they are no longer used:
# OPENAI_MOCK_VALIDATION=...
# ANTHROPIC_MOCK_VALIDATION=...
```

**If you don't have a real Anthropic key yet** and want to test the app without real AI calls:

```
AI_PROVIDER=anthropic
AI_MOCK_VALIDATION=true
```

With `AI_MOCK_VALIDATION=true`, you can save any string as your API key in Settings → AI
and it will always validate as "valid". AI generation calls still hit the real API.

---

## Step 3 — Install files

Unzip into the project root (parent of `church-platform/`):

```bash
unzip -o path/to/iteration-normalize-credentials.zip
```

---

## Step 4 — Re-save your API key

Because the table changed, previously stored keys are migrated automatically by
migration 008 for OpenAI rows. For Anthropic keys that were stored in the previous
`anthropic_key_enc` column, they are migrated but reset to `validation_status = 'untested'`
(safe default — the old status applied to OpenAI, not Anthropic).

After applying the migration:

1. Start dev server: `npm run dev`
2. Go to Settings → AI
3. Re-enter your Anthropic key (starts with `sk-ant-`)
4. Click "Save key"
5. Status should show "Valid"

---

## Step 5 — Test

```bash
npm run dev
```

- Dashboard: AI nudge banner should show/hide based on valid key status
- Teaching → session: "Generate outline" button enabled/disabled correctly
- Research workspace: generate buttons enabled
- Series → New: AI plan option enabled
- Settings → AI: shows Anthropic label, correct placeholder, correct model options

---

## Adding a new provider in the future

1. Implement `lib/ai/providers/newprovider.ts`
2. Add to `resolver.ts` switch statement
3. Add to `PROVIDER_CONFIG` in `AIKeySettings.tsx`
4. Add to `formatErrors` in `app/api/settings/ai-key/route.ts`
5. Add validator in `key.ts` `validatePlainKey` switch
6. **No schema change needed** — `user_ai_credentials` already supports any provider string

If you want to add a provider check constraint:

```sql
alter table public.user_ai_credentials
  drop constraint user_ai_credentials_provider_check;
alter table public.user_ai_credentials
  add constraint user_ai_credentials_provider_check
  check (provider in ('openai', 'anthropic', 'google', 'newprovider'));
```
