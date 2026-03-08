# Church Teaching Platform — Foundation

Next.js 14 App Router · TypeScript · Supabase · Tailwind

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Go to supabase.com and create a new project
2. Note your Project URL and anon/service role keys from Settings → API

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_CHURCH_SLUG` — must match your church slug in the seed
- `ENCRYPTION_SECRET` — generate with `openssl rand -base64 32`

### 4. Run migrations

```bash
# Via Supabase CLI (recommended for local dev):
supabase db push

# Or paste each file in Supabase Studio SQL editor in order:
# 001_tenancy_identity.sql
# 002_teaching.sql
# 003_thoughts_snapshots_tags_search_notifications_imports.sql
```

### 5. Create the owner auth account

Create the owner's account in the Supabase Auth dashboard:
- Authentication → Users → Add user
- Email + password of your choice
- Note the generated UUID

Or via Supabase CLI:
```bash
supabase auth admin create-user --email owner@church.com --password <password>
```

### 6. Seed the church

Edit `supabase/seeds/church.sql`:
- Set `v_owner_user_id` to the UUID from step 5
- Set `v_church_name` and `v_church_slug`
- Make sure `v_church_slug` matches `NEXT_PUBLIC_CHURCH_SLUG`

Run it:
```bash
psql <your-connection-string> -f supabase/seeds/church.sql
# Or paste it in Supabase Studio SQL editor
```

### 7. Configure Google OAuth (optional)

1. Supabase Dashboard → Authentication → Providers → Google
2. Add your Google OAuth Client ID and Secret
3. Add `https://your-project.supabase.co/auth/v1/callback` to Google's authorized redirect URIs

### 8. Run the app

```bash
npm run dev
```

Open http://localhost:3000 — it will redirect to `/[church-slug]/dashboard`

---

## Architecture notes

### Church context
Every authenticated page resolves church context in `(app)/[churchSlug]/layout.tsx` — no global singleton, no env-var inference beyond the root redirect. All data functions take `churchId` explicitly.

### Permissions
`lib/permissions.ts` exports `can(role, action)`. Use it server-side before any gated operation. The three roles are `owner`, `admin`, `teacher`.

### AI key flow
`lib/ai/key.ts` handles the full encrypt → store → validate lifecycle. Set `OPENAI_MOCK_VALIDATION=true` in dev to skip real API calls. The encrypted key is never returned to the client.

### Snapshot pair rule
Never insert `session_snapshots` or `outline_snapshots` individually. Always call `createSnapshotPair()` from `lib/snapshots.ts`. Both snapshots must be created or neither.

### supabaseAdmin
`lib/supabase/admin.ts` has `import 'server-only'` at the top. It will cause a build error if accidentally imported in a client component. Never remove that import.

### NEXT_PUBLIC_CHURCH_SLUG
Read in exactly two places:
1. `middleware.ts` — root redirect only
2. `app/api/auth/callback/route.ts` — post-OAuth fallback destination

Nowhere else.

---

## What's built

- ✅ Database schema (3 migrations)
- ✅ Church seed + owner membership
- ✅ Supabase Auth (email + Google OAuth)
- ✅ Middleware (slug resolution, membership check)
- ✅ App layout with ChurchProvider
- ✅ Responsive nav (desktop sidebar, mobile menu)
- ✅ Profile settings page
- ✅ AI key settings (save, validate on save, validate on demand, remove)
- ✅ Notification center (list, mark read, email toggle)
- ✅ Permission helper (`can`, `canAll`, `canAny`)
- ✅ Audit log helper
- ✅ Snapshot pair helper (session + outline, atomic)
- ✅ Search foundation (stub)
- ✅ All route stubs for remaining features

## What's next (Phase 1b)

Start with the teaching session CRUD and outline editor. The outline editor should use the `OutlineEditor` component from the prototype, adapted to this project's data model. Model B (↑↓ + ←→) is the only reorder interaction — no drag-and-drop.

---

## Guardrail checklist

Before merging any PR, verify:
- [ ] No query without explicit `church_id` filter
- [ ] `NEXT_PUBLIC_CHURCH_SLUG` read only in middleware and auth callback
- [ ] `supabaseAdmin` not imported in any client component
- [ ] No church-creation UI, route, or link exists
- [ ] Snapshot inserts go through `createSnapshotPair()` only
- [ ] AI feature routes check `validation_status = 'valid'` before OpenAI calls
- [ ] Delivery mode makes no network requests after page load
