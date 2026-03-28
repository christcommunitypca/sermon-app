# AI contract fix report

## Current architecture traced from the uploaded code

### Outline generation path
- `components/teaching/OutlinePanel.tsx` and `components/teaching/TeachingWorkspace.tsx` gather selected insights, scoped verse notes, and selected flow.
- `app/actions/ai.ts -> generateOutlineAction()` is the server entry point.
- `lib/ai/service.ts -> generateOutline()` is the service boundary.
- `lib/ai/prompts/outline.ts -> buildPrompt()` builds the provider payload.
- `lib/outlinePrompt.ts` is the actual prompt composition layer for human preview + LLM prompt text.

### Verse insight generation path
- `components/teaching/VerseByVersePanel.tsx` builds `VerseInsightPromptConfig` with scope/depth/custom numeric settings.
- `app/actions/verse-study.ts -> generateVerseInsightsAction()` and `getVerseInsightsPromptAction()` are the server entry points.
- `lib/ai/service.ts -> generateVerseInsights()` and `generatePericopeInsights()` run the provider calls.
- `lib/ai/prompts/verse-insights.ts` is the numeric source of truth for verse-insight depth behavior.

### Pericope path
- `components/teaching/PericopePanel.tsx` orchestrates section-vs-whole-passage behavior client-side.
- `app/actions/verse-study.ts -> generatePericopeInsightsAction()` currently sends only depth to the service.
- `lib/ai/service.ts -> generatePericopeInsights()` reuses the same verse-insight prompt path with a synthetic `pericope:*` verse key.

## Where the contracts drifted
1. `OutlineInput` in `lib/ai/types.ts` did **not** include the top-level outline config being passed from `app/actions/ai.ts` and read by `lib/ai/prompts/outline.ts`.
2. Outline depth existed in multiple shapes:
   - raw union literals in `app/actions/ai.ts`
   - raw union literals in `lib/outlinePrompt.ts`
   - missing `OutlineResearchDepth` export expected by `OutlinePanel.tsx`
   - stale import location in `TeachingWorkspace.tsx`
3. Scope was being applied client-side for outline generation, but not represented in the shared outline prompt contract, so prompt preview and direct AI generation were not driven by the same normalized config object.
4. `lib/ai/service.ts` referenced `VerseInsightPromptConfig` without importing it.
5. Provider implementations returned `raw_text` / `parse_error`, but `ProviderCompletion` did not declare them.

## Clean long-term fix applied here
- Added a real shared outline config contract in `lib/ai/types.ts`:
  - `OutlineResearchScope`
  - `OutlineResearchDepth`
  - `OutlineCustomSettings`
  - `OutlinePromptConfig`
- Updated the outline action/service/prompt chain to pass one normalized outline config object.
- Updated `lib/outlinePrompt.ts` so outline prompts now understand both:
  - scope (`all_verses` vs `selected_verses`)
  - depth with explicit numeric instructions
- Kept backward compatibility in `generateOutlineAction()` by still accepting `researchDepth` and normalizing it into `config`.
- Left verse-insight numeric depth handling in `lib/ai/prompts/verse-insights.ts` as the source of truth, because that part was already coherent.

## Files included
- `app/actions/ai.ts`
- `app/actions/verse-study.ts`
- `components/teaching/OutlinePanel.tsx`
- `components/teaching/TeachingWorkspace.tsx`
- `lib/ai/prompts/outline.ts`
- `lib/ai/service.ts`
- `lib/ai/types.ts`
- `lib/outlinePrompt.ts`

## Notes
- This pass fixes the shared contract drift and the compile-time AI contract errors.
- It does **not** force a new outline custom-settings UI yet; the type layer now supports it cleanly without regressing the current quick/deep outline flow.
