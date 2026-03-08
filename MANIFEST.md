# Iteration 2 — MANIFEST

## Added files

### Database
- `supabase/migrations/005_series_research.sql`

### Types
- `types/database.ts` — **modified** (added TheologicalTradition, Series, SeriesSession, ResearchItem, ProposedWeek, and related types)

### Lib
- `lib/liturgical.ts` — pure liturgical calendar computations (client-safe)
- `lib/research.ts` — server-side research data helpers
- `lib/series.ts` — server-side series data helpers
- `lib/ai/research.ts` — AI research generation (word studies, cross-refs, theological, practical, historical)
- `lib/ai/series.ts` — AI series plan generation

### API routes
- `app/api/ai/research/route.ts`
- `app/api/ai/series/route.ts`

### Server actions
- `app/(app)/[churchSlug]/teaching/[sessionId]/research-actions.ts`
- `app/(app)/[churchSlug]/series/actions.ts`

### Pages (new)
- `app/(app)/[churchSlug]/teaching/[sessionId]/research/page.tsx`
- `app/(app)/[churchSlug]/series/page.tsx`
- `app/(app)/[churchSlug]/series/new/page.tsx`
- `app/(app)/[churchSlug]/series/[seriesId]/page.tsx`
- `app/(app)/[churchSlug]/settings/tradition/page.tsx`

### Components (new)
- `components/research/SourceBadge.tsx`
- `components/research/ResearchItem.tsx`
- `components/research/ResearchWorkspace.tsx`
- `components/series/NewSeriesForm.tsx`
- `components/series/SeriesPlanner.tsx`
- `components/settings/TraditionForm.tsx`

---

## Modified files

- `types/database.ts` — new types appended at end
- `app/(app)/[churchSlug]/teaching/[sessionId]/page.tsx` — Research added to session sub-nav
- `app/(app)/[churchSlug]/settings/profile/page.tsx` — settings nav + tradition link added
- `components/layout/AppNav.tsx` — Series added to nav
- `lib/ai/series.ts` — ProposedWeek moved to types/database; re-exported here

---

## Deleted files

None.
