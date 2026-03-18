# Normalized AI Credentials — MANIFEST

## What this refactor does

Replaces the old `user_ai_keys` table (one row per user, provider-specific columns) with
`user_ai_credentials` (one row per user per provider). Adding a new AI provider in the future
requires **zero schema changes**.

### Before
```
user_ai_keys
├── user_id (UNIQUE)           ← one row total per user
├── openai_key_enc             ← grows with every new provider
├── anthropic_key_enc          ← already messy after two providers
├── model_preference           ← ambiguous: which provider's model?
└── validation_status          ← ambiguous: which provider is validated?
```

### After
```
user_ai_credentials
├── user_id    }  PRIMARY KEY  ← one row per user per provider
├── provider   }               ← 'openai' | 'anthropic' | 'google'
├── api_key_enc                ← encrypted key, provider-neutral column name
├── model_preference           ← nullable, belongs to this (user, provider) pair
└── validation_status          ← belongs to this (user, provider) pair
```

---

## Changed files (11 files)

### supabase/migrations/007_anthropic_key.sql  ← SUPERSEDED
Replaced by 008. If 007 has not yet been applied, skip it and apply 008 directly.
If 007 was already applied, 008 handles the migration safely (drops user_ai_keys after copying data).

### supabase/migrations/008_normalize_ai_credentials.sql  ← NEW
- Creates `user_ai_credentials` with composite PK `(user_id, provider)`
- Migrates existing `openai_key_enc` rows → provider='openai' rows
- Migrates existing `anthropic_key_enc` rows → provider='anthropic' rows (marked 'untested')
- Drops `user_ai_keys`
- Idempotent: safe on empty DB or DB with existing data

### lib/ai/key.ts  ← COMPLETE REWRITE
- All queries target `user_ai_credentials` with `.eq('provider', provider)` filter
- Encryption/decryption logic unchanged
- `validatePlainKey(plainKey, provider)` dispatches to provider-specific validators
- Single `AI_MOCK_VALIDATION=true` env var replaces `OPENAI_MOCK_VALIDATION` + `ANTHROPIC_MOCK_VALIDATION`
- `saveAndValidateKey(userId, plainKey, modelPreference, provider)` — upserts on `(user_id, provider)`
- `validateExistingKey(userId, provider)` — provider required, no default
- `getKeyStatus(userId, provider)` — provider required
- `hasValidKey(userId, provider)` — provider required
- `getDecryptedKey(userId, provider)` — used only by service.ts

### lib/ai/service.ts
- `resolveCredentials()` calls `getDecryptedKey(userId, provider)` — clean, no raw SQL
- `resolveCredentials()` provides distinct "key missing" vs "key invalid" error messages
- Dynamic import of supabaseAdmin removed; uses key.ts exclusively

### lib/ai/providers/resolver.ts
- Unchanged functionally; `getActiveProviderName()` and `getProvider()` still the same

### app/api/settings/ai-key/route.ts
- Queries `user_ai_credentials`, passes provider to all key.ts functions
- DELETE removes only the active provider's row (not all credentials)

### app/api/settings/ai-key/validate/route.ts
- Passes `provider` to `validateExistingKey` and `getKeyStatus`

### app/(app)/[churchSlug]/settings/ai/page.tsx
- Fixed: `getKeyStatus(user.id, activeProvider)` — provider now correctly passed
- `activeProvider` resolved before `getKeyStatus` call

### app/(app)/[churchSlug]/teaching/[sessionId]/page.tsx
- Replaced inline `user_ai_keys` query with `hasValidKey(user.id, getActiveProviderName())`

### app/(app)/[churchSlug]/teaching/[sessionId]/research/page.tsx
- Replaced inline `user_ai_keys` query with `hasValidKey(user.id, getActiveProviderName())`

### app/(app)/[churchSlug]/series/new/page.tsx
- Replaced inline `user_ai_keys` query with `hasValidKey(user.id, getActiveProviderName())`

### app/(app)/[churchSlug]/dashboard/page.tsx
- Replaced inline `user_ai_keys` query with `hasValidKey(user.id, getActiveProviderName())`

### types/database.ts
- `UserAIKey` → `UserAICredential` (new interface, normalized shape)
- `SupportedAIProvider = 'openai' | 'anthropic' | 'google'` type added
- `UserAIKey` retained as `@deprecated` stub for reference during migration

### .env.example
- `OPENAI_MOCK_VALIDATION` + `ANTHROPIC_MOCK_VALIDATION` → single `AI_MOCK_VALIDATION`
- ENCRYPTION_SECRET comment updated (no longer says "OpenAI")
- `AI_PROVIDER=anthropic` as default for local dev

---

## Runtime credential resolution order

```
Every AI feature call:
  1. AI_PROVIDER env var → selects active provider name (default: 'openai')
  2. getActiveProviderName() → 'openai' | 'anthropic'
  3. getDecryptedKey(userId, provider)
       → SELECT api_key_enc, model_preference, validation_status
            FROM user_ai_credentials
           WHERE user_id = $userId AND provider = $provider
  4. Require validation_status = 'valid' → else throw AIError('key_invalid')
  5. decryptKey(api_key_enc) → plain API key
  6. pickModel(model_preference, provider) → model string
  7. provider.complete({ apiKey, model }, prompt)
```

**There is no env-based key fallback.** All API keys are user-stored and encrypted.
This keeps per-teacher credentials clean and auditable.

---

## Files not changed (confirmed)
- `lib/ai/providers/openai.ts` — untouched
- `lib/ai/providers/anthropic.ts` — untouched
- `lib/ai/prompts/*` — untouched
- `lib/ai/types.ts` — untouched
- `components/settings/AIKeySettings.tsx` — untouched (already provider-aware)
- All other app pages and components — untouched
