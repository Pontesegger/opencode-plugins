# Sidebar info

OpenCode V2 TUI plugin that lists available skills in the right sidebar,
sorted alphabetically by display name (case-insensitive, with ID tie-breaking).
Skill names are indented two columns, prefixed with `/`, and colored by source:

- **Global**: the theme's original muted text color (gray).
- **Built-in**: the theme's accent color.
- **Repo / workspace**: the theme's info text color (typically blue).
- **Other**: muted text for unclassified sources.

Colors follow the active theme, including light/dark mode. The hover card's
location value uses the same color; the `Location:` label stays muted gray.
Hovering highlights the skill name immediately in the heading's bright text
color; leaving the row restores its source color.
Hover over a skill for 250 ms to show a card with its name, source scope, and
description. The card disappears shortly after the pointer leaves the skill and
card, on a skill click/scroll, terminal blur, resize, or session/location changes.
Move onto the card to scroll long descriptions. Mouse movement reporting must be
enabled in the terminal.
Left-click a skill to insert `/skill-id ` at the prompt cursor, preserving existing
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
