# Iteration 2d — Apply Instructions

## Apply

Unzip from the parent directory of `church-platform/`:

```bash
cd ~/
unzip -o path/to/iteration2d-hardening.zip
```

No migration. No new env vars. No package changes.

## Build check

```bash
cd church-platform
npm run build
```

## Verify these specific behaviours

1. **Research → Words**: clicking "Add to outline" adds the English word (e.g. "grace"), not a paragraph
2. **Research → Cross-refs**: connection type chip ("parallel", "fulfillment", etc.) appears below content
3. **Research → Practical**: blue "Application" / violet "Analogy" / grey "Insight" badge appears above title
4. **Research tab bar**: no scrollbar visible on iPhone Safari
5. **Series → New series (no AI key)**: "Plan manually" button appears and opens blank planner
6. **Series planner inline edit**: Edit shows ✓ and ✗ buttons; ✗ closes without saving
7. **Series planner**: "Save series" appears only once (in header)
8. **Archive menu trigger**: tap area is comfortably 44px on iPhone
