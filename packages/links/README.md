# Links

Session-specific, agent-posted links in the right-hand sidebar for **OpenCode V2**.

## Install

From a checkout of this repository, run `npm ci --ignore-scripts` at the root.
Add the package to `plugins` in `opencode.json(c)`, preserving other entries:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/path/to/opencode-plugins/packages/links"]
}
```

This loads both the server tool and the TUI section. **Do not also add it to
`cli.json`.** Config reloads automatically; use `/reload` to force a refresh.
The session sidebar must be visible to see the section.

## Behavior

- The agent receives a `links_post` tool with `url`, `label`, and optional
  `description` arguments and a
  short instruction to proactively save particularly useful links. For example:
  `{"url":"https://opencode.ai/docs/build/plugins","label":"Plugin docs","description":"OpenCode plugin APIs, entrypoints, and loading instructions."}`.
- Labels contain 1–30 Unicode code points of plain text. Surrounding whitespace
  is trimmed and repeated whitespace is collapsed. Overlong labels are rejected,
  not silently truncated; the agent can retry with a shorter description.
- Only absolute HTTP(S) URLs without embedded username/password are accepted.
  Local HTTP previews are supported. The plugin never fetches a posted URL.
- Each post targets the **calling session**, not its parent, children, or whatever
  session happens to be visible. Switching sessions displays that session's links.
- Links persist in OpenCode's plugin storage across reloads and restarts. Reposting
  the same normalized URL updates its label and any supplied description in place;
  omitting the description preserves the previous one. New URLs append in order.
- Labels use the theme's muted gray color. Hovering briefly opens a scrollable
  card with the label, optional longer description (up to 1000 characters), and
  full URL. Existing links without a description still show their full URL.
  The card stays open while the pointer is over it and dismisses on mouse leave,
  session switching, terminal resize, or focus loss.
- Entries use native terminal hyperlinks. Open them with your terminal's link
  gesture (often Ctrl+click or Cmd+click); terminal hyperlink support is required.
- Updates appear live; reconnecting or revisiting a session reloads durable state.
  Links appears below the sidebar content (including Skills), independent of
  plugin loading order. The entire section, heading and spacing included, stays
  hidden until the current session contains at least one link. There are no empty,
  loading, or error placeholders; the first post makes the section appear live.

Posting is selective and model-driven, not automatic extraction of every URL in
the conversation. You can also ask: “Post the PR link to the sidebar.”

## Privacy and limitations

URLs, labels, and descriptions are stored locally by the OpenCode server, not in this GitHub
repository. Do not post passwords, access tokens, signed URLs, or other secrets.
The tool and instructions warn the agent, but cannot detect every sensitive URL.
Entries remain in plugin storage until that storage is cleared; automatic deletion
with sessions, manual removal, and inheritance when forking are not implemented.

Uses the repository's pinned `@opencode/plugin` 2.2.7 API and OpenTUI peers. The
server plugin, tool posting, and durable RPC readback were smoke-tested on
OpenCode 2.3.2. Runtime entrypoints are TypeScript/TSX, loaded directly by OpenCode
without a build.

## Verification

```sh
npm test --workspace=opencode-links
npm run test:links
npm run check
```

Helper/server tests cover validation, hover-card placement, session isolation, persistence, duplicate
updates, parallel writes, tool registration, proactive instructions, and cleanup.
The Bun renderer test covers placement below Skills, empty-session invisibility,
first-post visibility, gray styling, detailed hover cards and dismissal,
legacy links without descriptions, sidebar updates, hyperlinks, session switching,
stale requests, reconnection, and subscription cleanup.
