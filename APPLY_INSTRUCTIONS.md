# Iteration 2 — Apply Instructions

These instructions assume your project is at `~/church-platform` (or whatever your project root is).
The zip was created with paths relative to the project root.

---

## Prerequisites

- Iteration 1 is deployed and working.
- You are logged into Supabase.
- Your project builds cleanly (`npm run build` passes).

---

## Step 1 — Back up the project

```bash
git add -A && git commit -m "pre-iteration-2 checkpoint"
```

---

## Step 2 — Run the migration

In **Supabase Studio → SQL Editor**, run the file:

```
supabase/migrations/005_series_research.sql
```

This creates:
- `series` table
- `series_sessions` table
- `research_items` table
- Adds `theological_tradition` column to `profiles`
- RLS policies for all three new tables

> If you're using `supabase db push`, you can also run:
> ```bash
> supabase db push
> ```

---

## Step 3 — Extract the zip

```bash
cd ~/church-platform
unzip -o path/to/iteration2-research-series.zip
```

The `-o` flag overwrites existing files. Files in the zip are prefixed with `church-platform/` so they land at the right paths.

---

## Step 4 — Verify modified files

These files were changed and will be overwritten by the zip. If you have local edits to these, merge them manually before extracting:

- `types/database.ts` — new types appended at end; safe to merge
- `app/(app)/[churchSlug]/teaching/[sessionId]/page.tsx` — Research sub-nav link added
- `app/(app)/[churchSlug]/settings/profile/page.tsx` — settings nav added
- `components/layout/AppNav.tsx` — Series link added

---

## Step 5 — Check environment variables

No new environment variables are required. The existing `ENCRYPTION_SECRET` and OpenAI key handling are reused unchanged.

---

## Step 6 — Build and verify

```bash
npm run build
```

Expected: clean build with no new errors.

Then run locally:
```bash
npm run dev
```

Visit:
- `/<your-church-slug>/series` — should show the series list
- `/<your-church-slug>/settings/tradition` — should show tradition selector
- Any teaching session → sub-nav now includes "Research"

---

## Step 7 — Test theological tradition setting

1. Go to Settings → Tradition
2. Select your tradition
3. Save

This affects:
- How AI research theological panels are framed
- Which liturgical observances are flagged when planning a series with a start date

---

## Step 8 — Test research workspace

1. Open any teaching session that has a scripture reference
2. Click **Research** in the session sub-nav
3. Select a tab (Words, Cross-refs, Theology, Practical, or Historical)
4. Click **Generate** — requires a valid OpenAI key in Settings → AI
5. Items are saved to the database; regenerate replaces them
6. Use **Add to outline** to push an item to the session outline

---

## Step 9 — Test series planning

1. Go to Series → New series
2. Enter a title, scripture section (e.g. "Romans 1-8"), number of weeks
3. Optionally set a start date to enable liturgical calendar awareness
4. Click **Generate plan**
5. Review and edit the proposed week-by-week plan
6. Click **Save series**
7. From the series detail page, click **Create** on any week to generate a real teaching session

---

## Notes

- `lib/liturgical.ts` is a pure client/server-safe module. It has no `server-only` directive and no external calls. All liturgical calculations are local.
- `denominational` and `current_topic` research categories are architecturally complete but generation is stubbed. They render a roadmap placeholder in the UI.
- Research items are per-session and per-teacher. They are not church-shared in MVP.
