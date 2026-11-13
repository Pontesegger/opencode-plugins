# OpenCode plugins

Two independently loadable plugins for **OpenCode V2** in one npm-workspaces
repository:

| Package | Features | Configuration |
| --- | --- | --- |
| [Context Inspector](packages/context-inspector/README.md) | Context-usage row, component estimates, and read-only captured-context inspection | `opencode.json(c)` |
| [Sidebar Info](packages/sidebar-info/README.md) | Alphabetical skill list, hover descriptions, and click-to-insert skill commands | Global `cli.json` |

## Status and compatibility

- Prepared from local plugins used with OpenCode **2.2.7**; the SDK dependency is
  pinned to that release. Other releases require validation, especially the
  experimental context-attribution metadata and renderer integrations.
- Source TypeScript/TSX entrypoints are intentional: OpenCode loads them directly.
  No JavaScript build or combined bundle is required for these plugins.
- Package names are provisional and **not published or checked for availability**.
- Licensed under the [MIT License](LICENSE), with a copy included in each package.
  Both packages remain `private: true` to prevent accidental npm publication;
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

Context Inspector's server and TUI load together from `opencode.json(c)`. Do not
also add it to `cli.json`. Sidebar Info is TUI-only and belongs in `cli.json`.
If replacing the original local plugins, replace their existing entries rather
than appending more; originals in plugin discovery directories must also be
moved outside discovery before using the copies.

Config changes reload automatically; `/reload` forces a refresh. Context
inspection becomes available after the next model request; older requests are
not reconstructed. Sidebar Info needs a visible session sidebar.

## Development and verification

```sh
npm ci --ignore-scripts
npm run check
```

`check` runs both packages' Node regression tests, then creates real npm
tarballs in a temporary directory. It verifies package exports and relative
imports, rejects unexpected shipped files and machine-specific paths, and reruns
the helper tests against extracted package contents. Tests and hover fixtures are
not shipped. It does not claim to validate the full OpenCode runtime or typecheck
the SDK integration.

With [Bun](https://bun.sh/) 1.3.14+ installed, also run the rendered Sidebar Info
test (verified with Bun 1.4.4):

```sh
npm run test:hover
```

This simulates mouse movement and clicks, checks hover-card visibility and
dismissal, and verifies that clicking inserts a skill without submitting a prompt.
GitHub Actions runs both the Node/package checks and the Bun renderer test.

Manually smoke-test both plugins in OpenCode 2.2.7 before a release: inspect a
fresh context capture, change categories, scroll/jump headings, resize, close the
inspector, hover/click a skill, and reload without duplicate UI or listeners.

## Privacy

Context Inspector retains captured instructions, tool schemas, and skill text in
server memory, not in this repository. Do not commit captures, terminal logs,
personal configuration, or screenshots containing private context. Its component
counts are estimates, not the exact provider request or tokenizer counts.

## Publishing

See [PUBLISHING.md](PUBLISHING.md) for GitHub preparation, metadata and naming
decisions, package checks, and optional npm publication. Nothing is published
automatically by this repository. See [SECURITY.md](SECURITY.md) for known
dependency-audit findings that need review before public distribution.

OpenCode documentation: [plugins](https://opencode.ai/docs/build/plugins),
[TUI plugins](https://opencode.ai/docs/build/plugins/cli), and
[CLI plugin configuration](https://opencode.ai/docs/cli/plugins).
