# Sidebar info

OpenCode V2 TUI plugin that lists available skills in the right sidebar in one
alphabetical list (case-insensitive display names, with ID tie-breaking), without
grouping or a divider. Skill names indicate how many times they were used within
the previous seven days:

- **No uses**: the theme's existing muted gray.
- **One use**: dark green (`#228B22`).
- **Two uses**: medium green (`#4CAF50`).
- **Three uses**: light green (`#86EFAC`).

Usage is a user-level plugin setting stored with OpenCode's durable TUI storage
under `skill-usage`, as a `lastClicked` map of skill IDs to their three latest Unix
timestamps in milliseconds, newest first. A use means a successful left-click
insertion into the prompt, not submission or model execution. Each click adds a
timestamp, evicting the oldest when there are more than three. Legacy single
timestamps count as one use and become arrays on the next click. History is
shared across sessions and survives plugin reloads and OpenCode restarts;
OpenCode synchronizes it across running TUI instances. Colors update on clicks
and once per minute as uses age out of the rolling seven-day window. Timestamps
exactly seven days old or older do not count, but remain in the stored history
until displaced by newer uses. No manual configuration is required.
The heading is `@ Skills` by default. Skill names are indented two columns
and shown without a prefix, colored by weekly usage. Each row has a right-aligned
colored dot (`●`) for repo and built-in origins only; global/user and unclassified
skills have no dot. Two blank columns after the dot separate it from the
scrollbar. The indicator column stays reserved for skills without dots.
Long names wrap in the space before the dot
without pushing it off the edge. The hover card keeps full source labels.
The dot and hover card's location value use the same source colors:

- **Global**: the theme's original muted text color (gray).
- **Built-in**: the theme's accent color.
- **Repo / workspace**: the theme's info text color (typically blue).
- **Other**: muted text for unclassified sources.

Colors follow the active theme, including light/dark mode. The hover card's
`Location:` label stays muted gray.
Hovering highlights the skill name immediately in the heading's bright text
color; leaving the row restores its usage color. The dot keeps its source color.
Hover over a skill for 250 ms to show a card with its name prefixed by `@`, source scope, and
description. The card disappears shortly after the pointer leaves the skill and
card, on a skill click/scroll, terminal blur, resize, or session/location changes.
Move onto the card to scroll long descriptions. Mouse movement reporting must be
enabled in the terminal.
Left-click a skill to insert `@skill-id ` at the prompt cursor, preserving existing
input and returning focus to the prompt. The inserted text has exactly one
trailing space, no newline, and is never automatically submitted. The invocable
skill ID is used even when the display name differs. Right-click does not insert.
Sources are classified from registry paths: Global for standard home skill
directories, Repo for project-local paths (including ancestor project skill
directories), Built-in for `skill://` paths, and Other for unclassified sources.
Uses OpenCode's reactive skill registry for the current session's location,
including global, project, and built-in skills; no filesystem scanning is needed.
It appends to `sidebar.content` without replacing any built-in sections.
The host controls built-in ordering: this places the section below built-in
sidebar content, not necessarily immediately after Context.

## Installation and configuration

Prepared against OpenCode 2.2.7. See the [repository installation
guide](../../README.md) for dependencies and replacing an existing local copy.
Merge this TUI-only plugin's entry into `~/.config/opencode/cli.json` (or its XDG
equivalent), replacing the example path with your checkout's absolute path:

```json
{
  "plugins": [
    {
      "package": "/path/to/opencode-plugins/packages/sidebar-info",
      "options": { "title": "Skills" }
    }
  ]
}
```

The `title` option customizes the heading label; `@ ` is always prepended.
The section is visible when the session sidebar is visible. With
`session.sidebar` set to `auto`, the terminal must be wide enough to show it.
Valid configuration changes reload automatically; `/reload` forces a refresh.

The plugin returns the slot's unregister function so reloads clean up the old
section. It does not modify Context Inspector or session data. The original
plugin ID `local.sidebar-info` is retained; do not load both copies at once.

Run checks with `node --test skills.test.mjs` in this directory.

For the optional rendered hover regression, install devDependencies and run
`npm run test:hover` with Bun. It sends simulated terminal mouse movements and
checks that the card is on-screen, stays open over its contents, and dismisses on
leave. The portal wrapper is absolutely positioned and zero-sized so it neither
flows below the application nor intercepts the skill row's mouse events.
