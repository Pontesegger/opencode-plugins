# Plugin look and feel

These conventions apply to all six independently loadable plugins. Preserve
informative colors rather than making unrelated status indicators identical.

## Neutral controls

- Favorites rows, sidebar `[-]` / `[+]` controls, and the Context toggle use the
  theme's muted gray normally and bright text color on hover.
- All sidebar section headers retain their bright, bold titles. Toggle controls
  occupy three columns, with one blank column at the right edge. The whole header
  row (title, empty space, control, and right padding) toggles the section on
  left-click and highlights the toggle control on hover.
- Keep the original two empty rows between sidebar sections. Do not add divider
  glyphs, borders, or change the host's sidebar title.

## Status and semantic colors

- Skills usage and Activity indicators share normal green `#228B22` and hover
  green `#86EFAC`; Skills additionally retains its middle usage shade `#4CAF50`.
- Paused goals remain yellow `#EAB308`, with hover yellow `#FDE047`.
- Inactive Activity slots use ghost gray `#333333`. Empty subagent/shell counters
  remain noninteractive. An empty goal highlights bright white on hover and
  prepares `/goal ` through native command completion on left-click.
- Links retain muted-gray labels, blue `#7dd3fc` underlined hover feedback, and
  native hyperlinks. Blue also identifies the context row's recorded USD cost.
- Context categories retain their attribution colors and use bright-white hover
  feedback. Context usage keeps its green/yellow/red threshold meanings.
- Busy Status remains a noninteractive red scanner, visible only while running.
  Dark-red square brackets fence its twelve-cell track; including the original
  outer padding, the widget occupies sixteen columns. The saturated-red head has
  four progressively darker fading trail cells, all drawn as centered `▬` rectangles.

## Placement and interaction

- Busy Status stays left; Activity stays immediately left of Context; Context
  stays rightmost. Activity reserves fourteen columns even when inactive.
- A click requires a left-button press and release on the same control without
  dragging. Right-clicks and dragging onto or away from a control do not activate
  it. Mouse exit clears the pressed state.
- Hover cards float without shifting the transcript or status row. Activity help
  and entries are separated by one blank row. Resize, blur, session changes, and
  inactive transitions dismiss stale cards.
- Viewing information never submits a prompt or runs a goal action. Creating a
  goal uses native command completion, not paste or immediate server execution;
  the trailing space and focused cursor let the user supply the objective.
- Keep keyboard access, read-only detail views, and independent plugin loading.

## Verification

`npm run check` runs helper regressions and tests the packaged runtime files.
With Bun available, run all rendered UI tests:

```sh
npm run test:hover
npm run test:favorites
npm run test:links
npm run test:context
npm run test:busy-status
npm run test:activity-status
```

The fixtures verify actual rendered colors, layout, mouse interactions, native
command preparation, and cleanup with mocked OpenCode context/client data. They
do not replace a manual smoke test against a real OpenCode session.
