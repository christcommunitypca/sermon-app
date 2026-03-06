# Outline Editor Prototype

Church teaching platform — outline editor prototype for evaluating reorder interaction models.

## Quick Start

```bash
npm install
npm run dev
```

Then open `http://localhost:3000` — it redirects to `/prototype/outline`.

## What This Is

A local-state-only prototype (no Supabase, no API calls, no auth) that implements four reorder interaction models for the outline editor. The goal is to evaluate which model should ship for mobile (touch) vs desktop (pointer) before building the real editor.

## Four Reorder Models

Toggle between them at the top of the page:

- **A — Drag and Drop** (`@dnd-kit/sortable`): drag handles, within-level only, long-press on touch
- **B — Move Up/Down** (default): ↑↓ buttons to reorder, ←→ to promote/demote. Always visible. Mobile-first.
- **C — Explicit Reorder Mode**: toggle between Edit/Reorder modes. In Reorder Mode: large handles, scroll disabled, cross-level drag enabled.
- **D — Tap to Select, Tap to Place**: tap a block to pick it up, tap a destination to drop it. No drag.

## Testing Checklist (iPhone Safari)

After running on a real iPhone, fill in the Evaluation section at the bottom of the prototype page:

1. **Model A** — rate drag: Fluid / Acceptable / Frustrating
2. **Model B** — one-handed comfort: Yes / Mostly / No
3. **Model C** — mode-switch friction: acceptable or annoying?
4. **Model D** — mental model: natural or awkward?
5. **Delivery Mode** — layout usable at a pulpit? Any clipping?
6. **Recommendation** — which ships for mobile? which for desktop?

## Components

These component names carry into production:

- `OutlineEditor` — top-level, owns all state
- `OutlineBlock` (see `BlockRow` in `OutlineEditor.tsx`) — single block row
- `DeliveryView` — full-screen delivery mode
- `AISourceBadge` — model/confidence badge on AI-generated blocks
- `BlockTypeSelector` — type change dropdown

## Architecture Note

All state lives in `OutlineEditor` as a flat `Block[]` array with `parent_id` references. The tree is reconstructed via `getSortedChildren()` at render time. This is the data model that will carry into the real implementation with Supabase.

The pointer detection for touch vs mouse: `window.matchMedia('(pointer: coarse)')` — not screen width.

## Locked Decision (from architecture spec)

- **Mobile (pointer: coarse)** → Model B ships. Move Up/Down.
- **Desktop (pointer: fine)** → Model A ships. Drag and drop.
- The prototype should confirm this or surface a reason to reconsider.
