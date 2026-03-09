# Iteration 2d — Hardening Pass MANIFEST

## Changed files (9 files)

### components/research/ResearchItem.tsx
- `getPushContent`: word_study pushes English word title; theological pushes tradition label title — not paragraphs
- `isLong` derived as constant (was checked twice in JSX)
- `metaConnectionType` extracted and rendered as connection type chip on cross-ref cards
- Practical subcategory badge (Application / Analogy / Insight) shown above title
- Word study semantic range chips stack on new lines (flex-wrap, no overflow)
- All `meta.x` accesses use pre-typed variables — no `unknown` in JSX

### components/research/ResearchWorkspace.tsx
- Removed `useCallback` import (unused after simplification)
- `countByCategory` replaced with `categoryCounts` derived object (one pass, not per-tab call)
- Tab bar uses `scrollbar-none` CSS class instead of `style={{ scrollbarWidth: 'none' }}` — Safari compatible

### components/series/SeriesPlanner.tsx
- Duplicate bottom "Save series" button removed
- Error moved out of header into proper error banner below header
- Inline edit now has separate ✓ Done and ✗ Cancel buttons — no accidental edit loss

### components/series/NewSeriesForm.tsx
- Non-AI users no longer blocked: "Plan manually" button creates blank week stubs and opens SeriesPlanner directly
- AI key prompt changed from blocking notice to inline hint alongside the manual button

### components/series/SeriesWeekExpander.tsx
- `statusStyles` prop removed — defined as static constant inside component
- `Props` interface simplified

### app/(app)/[churchSlug]/series/[seriesId]/page.tsx
- `STATUS_STYLES` constant removed (moved into SeriesWeekExpander)
- `SeriesSessionStatus` and `Flame` imports removed (no longer used here)
- `statusStyles` prop removed from all SeriesWeekExpander usages

### components/ui/ArchiveDeleteMenu.tsx
- Trigger button: `min-h-[44px] min-w-[44px]` with flex centering — meets iOS 44px touch target
- `iconSize` variable removed, icon size inlined directly

### lib/ai/service.ts
- `buildSourceLabel` parameter type changed from anonymous `{ subcategory?: string; metadata?: Record<string, unknown> }` to explicit nullable fields — cleaner, matches actual RawItem shape

### app/globals.css
- `scrollbar-none` utility already added in previous pass — confirmed present

## New files
None.

## Deleted files
None.

## Database / migrations
None. No schema changes.

## TypeScript errors fixed
None introduced. Pre-existing "Cannot find module 'next'" errors are a node_modules environment issue, present on all files before this pass.
