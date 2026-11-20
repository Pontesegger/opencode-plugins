# OpenCode plugins

Six independently loadable plugins for **OpenCode V2** in one npm-workspaces
repository:

| Package | Features | Configuration |
| --- | --- | --- |
| [Context Inspector](packages/context-inspector/README.md) | Context-usage row, component estimates, and read-only captured-context inspection | `opencode.json(c)` |
| [Sidebar Info](packages/sidebar-info/README.md) | Alphabetical skill list with weekly usage colors, origin dots, hover descriptions, and click-to-insert skill commands | Global `cli.json` |
| [Favorites](packages/favorites/README.md) | One-click `/clear` and `/compact` commands under a Favorites sidebar heading | Global `cli.json` |
| [Busy Status](packages/busy-status/README.md) | Knight Rider-style red scanner while the current session is working; hidden when idle | Global `cli.json` |
| [Activity Status](packages/activity-status/README.md) | Matching subagent/shell counters and goal flag, goal hover controls, native subagent navigation, and live details | Global `cli.json` |
| [Links](packages/links/README.md) | Muted-gray, persistent per-session links with short labels and detailed hover cards | `opencode.json(c)` |

## Status and compatibility

- Prepared from local plugins used with OpenCode **2.2.7**; the SDK dependency is
  pinned to that release. Other releases require validation, especially the
  experimental context-attribution metadata and renderer integrations.
- Source TypeScript/TSX entrypoints are intentional: OpenCode loads them directly.
  No JavaScript build or combined bundle is required for these plugins.
- Package names are provisional and **not published or checked for availability**.
- Licensed under the [MIT License](LICENSE), with a copy included in each package.
  All packages remain `private: true` to prevent accidental npm publication;
  the source repository is public on GitHub.
- Existing plugin/RPC IDs retain their `local.*` names for compatibility. Do not
  load these copies alongside the original local plugins: that duplicates IDs,
  hooks, commands, and UI contributions.

## Install from a GitHub checkout

Clone this repository to a stable location, then install dependencies:

```sh
git clone https://github.com/Pontesegger/opencode-plugins.git
cd opencode-plugins
npm ci --ignore-scripts
```

Requires Node.js 26.4+ and npm for dependency installation (the pinned OpenTUI
renderer declares this engine requirement). OpenCode supplies its own runtime.
The pure helper tests also pass on Node 22, but a full dependency install on Node
22 emits an engine warning. Merge the plugin entries from
[`examples/opencode.jsonc`](examples/opencode.jsonc) and
[`examples/cli.json`](examples/cli.json) into your existing configuration; replace
`/path/to/opencode-plugins` with your checkout's absolute path. **Do not overwrite
the rest of your configuration.** Global config normally lives in
`~/.config/opencode/`, or `$XDG_CONFIG_HOME/opencode/` when set.

Context Inspector's and Links' server and TUI parts load together from
`opencode.json(c)`. Do not also add them to `cli.json`. Sidebar Info, Favorites,
Busy Status, and Activity Status are TUI-only and belong in `cli.json`.
If replacing the original local plugins, replace their existing entries rather
than appending more; originals in plugin discovery directories must also be
moved outside discovery before using the copies.

Config changes reload automatically; `/reload` forces a refresh. Context
inspection becomes available after the next model request; older requests are
not reconstructed. Sidebar Info, Favorites, and Links need a visible session sidebar.
Favorites replaces any unfinished prompt and attachments before submitting the selected command.

## Development and verification

See [Plugin look and feel](docs/ui-conventions.md) for the shared visual and
interaction conventions, including intentional status-color differences.

Screenshots and the animated scanner preview live in each plugin's README.
To regenerate them, install Bun, Python with Pillow, and a monospace font, then
run `npm run preview:plugins` and `npm run preview:busy`. Set `PYTHON` to use a virtual
environment's interpreter, or `PREVIEW_FONT` to select a specific font file.
`PREVIEW_SYMBOL_FONT` selects a fallback font for symbols such as the subagent
icon (for example, Noto Sans Math).

```sh
npm ci --ignore-scripts
npm run check
```

`check` runs all packages' Node regression tests, then creates real npm
tarballs in a temporary directory. It verifies package exports and relative
imports, rejects unexpected shipped files and machine-specific paths, and reruns
the helper tests against extracted package contents. Tests and hover fixtures are
not shipped. It does not claim to validate the full OpenCode runtime or typecheck
the SDK integration.

With [Bun](https://bun.sh/) 1.3.14+ installed, also run the rendered Sidebar Info
test (verified with Bun 1.4.4):

```sh
npm run test:hover
npm run test:context
npm run test:favorites
npm run test:busy-status
npm run test:links
npm run test:activity-status
```

This simulates mouse movement and clicks, checks hover-card visibility and
dismissal, and verifies that clicking inserts a skill without submitting a prompt.
The Favorites renderer test verifies one-click submission, draft replacement,
and ignored right-clicks/drags with mocked host dispatch. Favorites, Skills, and
Links renderer tests also verify gray ASCII header controls with bright-white hover,
one-column right padding, header-only collapse, expansion, resize, and hover cleanup where applicable.
GitHub Actions runs
the Node/package checks and all six Bun renderer tests. The Context test checks
rightmost alignment while idle/busy, with activity and standard-footer toggles,
resizing, neutral/category hover feedback, and ignored right-clicks/drags. The Busy Status test
checks animation, idle/running transitions, session switching, and timer cleanup.
The Links test checks gray styling, hover cards, native hyperlinks, live updates, session isolation, stale
requests, reconnect, and listener cleanup.
The Activity Status test checks right-aligned fixed-width placement, blank slots,
middle-dot separators, X counts above nine, matching Skills colors,
menu spacing, clickable hover lists, subagent/Esc navigation, live shell output
through exit, live goal updates, Pause/Resume/Clear hover controls, paused-yellow
and resumed-green colors, goal-only visibility, reconnect, and cleanup.

Manually smoke-test all plugins in OpenCode 2.2.7 before a release: inspect a
fresh context capture, change categories, scroll/jump headings, resize, close the
inspector, hover/click a skill, click each favorite in a disposable session,
and reload without duplicate UI or listeners.

## Privacy

Context Inspector retains captured instructions, tool schemas, and skill text in
server memory, not in this repository. Do not commit captures, terminal logs,
personal configuration, or screenshots containing private context. Context
Inspector's component counts are estimates, not the exact provider request or
tokenizer counts. Links stores posted URLs, labels, and descriptions in durable server-side
plugin storage; never post secrets or signed access URLs.

## Publishing

See [PUBLISHING.md](PUBLISHING.md) for GitHub preparation, metadata and naming
decisions, package checks, and optional npm publication. Nothing is published
automatically by this repository. See [SECURITY.md](SECURITY.md) for known
dependency-audit findings that need review before public distribution.

OpenCode documentation: [plugins](https://opencode.ai/docs/build/plugins),
[TUI plugins](https://opencode.ai/docs/build/plugins/cli), and
[CLI plugin configuration](https://opencode.ai/docs/cli/plugins).
