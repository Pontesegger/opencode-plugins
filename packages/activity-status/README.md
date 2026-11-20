# Activity Status

Compact **OpenCode V2** footer indicators: `2 ⧉ · 1 ❯_ · ⚑`, matching the Skills sidebar's
dark green (`#228B22`) and light-green hover highlighting (`#86EFAC`).
Paused goals use yellow (`#EAB308`), with light yellow (`#FDE047`) on hover;
resuming restores the green palette.

The indicators form a right-aligned group to the left of Context Inspector's
usage display. Context remains rightmost; when Context Inspector is not loaded,
Activity Status aligns to the right edge itself. Busy Status stays on the left.

The group reserves **14 character columns**: three for subagents, four for shells,
one for the goal, and two ` · ` separators. Each count uses one character;
totals above nine display **X** (the hover list still contains the actual items).
Inactive indicators remain as ghostly dark-gray (`#333333`) `0 ⧉`, `0 ❯_`, and
`⚑` labels in their fixed slots. Empty counters stay faint on hover and are not
clickable. The empty-goal flag turns bright white on hover; left-click selects
the registered `/goal` through native prompt autocomplete, leaving `/goal `
ready for an objective without submitting or pasting. Existing draft text and
attachments are preserved, with the cursor after the command's trailing space.
Repeated clicks do not duplicate the prefix. Right-clicks and drags are ignored.
A middle dot appears only when both adjacent indicators are active; otherwise
its three columns remain blank. All slots remain reserved even when both counts
are zero and no goal is set, so indicators and Context never hop left or right as
activity changes. Dots are not interactive. The group is hidden on the home
screen and in shell input mode.

- `⧉` counts running descendant sessions, excluding the main session. Its hover
  list includes idle/completed subagents too, so their work remains inspectable.
- `❯_` counts running shell commands owned by the current session at its
  location. Other sessions' shells and terminal/PTY panes are not counted.
- `⚑` becomes colored whenever the current session has a goal (active, paused, or met).
  Hover for its objective, status, reason, and continuation count. Click the flag
  for a larger scrollable, read-only details dialog; Esc closes it without
  interrupting the session. Goals are session-specific, not inherited or counted.
  The hover heading offers **Pause** for active goals, **Resume** for paused
  goals, and **Clear** for every goal, including met goals. These explicit clicks
  invoke OpenCode's built-in `/goal` command for the selected session. Clear
  removes the goal and restores the faint flag after the server confirms the change.
  Viewing details alone does not modify a goal. Actions are disabled while a
  command is pending; failures show an error toast. The indicator updates live,
  rereads state after successful commands, and refreshes on reconnect.
- Hover either counter for a floating, scrollable list; click the counter to
  open the list immediately. A blank row separates the help line from list entries.
  Click a subagent to open its native session view,
  with its transcript, work, and existing context plugin. **Esc returns to the
  originating main session** without interrupting the worker.
- Click a shell to open a read-only stdout/stderr viewer. It follows live output,
  stays open after exit, and shows the most recent 64 KiB. Up/Down, wheel,
  PgUp/PgDn and Home scroll; End resumes following; Esc returns without killing
  the command. Output redirected to files is not captured here.
- Each counter is green while its active count is greater than zero and dark gray
  otherwise. An active goal keeps its own slot alongside inactive counters.
  Labels never wrap. Hover cards float above the footer instead of taking a second
  status row, and dismiss if their indicator becomes inactive or moves.
- Existing plugin contributions and OpenCode's built-in footer are unchanged.

## Install

Add the directory to global `~/.config/opencode/cli.json`:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["/path/to/opencode-plugins/packages/activity-status"]
}
```

Merge with your existing plugin list. No server component is required. The plugin
contributes before `prompt.footer`; Context Inspector contributes after that
slot, preserving their order independently of plugin load order. With the
standard footer hidden, the indicators sit directly before the Context usage bar.
Other footer contents can still exceed a
very narrow terminal; this plugin does not remove or reflow them.

Config changes reload automatically; use `/reload` if needed. SDK 2.2.7 and the
workspace's renderer versions remain pinned; validate on your installed OpenCode
(the implementation was prepared for a 2.3.2 installation). A subagent uses the
native view; the shell viewer is custom, built on the connected client's shell
API, not OpenCode's internal renderables. Goal reads use the published
`Goal.Definition` from the directly pinned `@opencode/schema` dependency. The
built-in `opencode.goal` RPC must be available on the connected server at the
session's location. If it is unavailable or returns unknown/malformed state, the
goal indicator stays faint while the counters continue working. Preparing a goal
requires the registered `goal` command and native prompt autocomplete; unavailable
completion shows an error instead of pasting or running the command. Goal-specific
API stability is not documented, and the hover actions require the built-in
`goal` command (a custom override may change its behavior); test compatibility before
upgrading. No output, objectives, or transcripts are persisted by this plugin.

The footer contribution is additive and lives before the standard footer's
boundary. When Busy Status is installed, its `/statusbar` command controls the
standard footer (hidden by default). Counters, goals, and their hover state remain
mounted regardless of that preference; no cross-plugin synchronization or
relocation is needed.

## Verify

```sh
npm test --workspace=opencode-activity-status
npm run test:activity-status
```

Helper tests cover ownership, ancestry, active counts, hover geometry, bounded
output, exit, failures, cancellation, goal validation, location isolation, stale
reads/events, reconnect, and disposal. Bun renderer tests simulate hover,
click, keyboard return, live output and goals, palette equality with Skills,
inactive ghost colors, noninteractive empty counters, empty-goal hover and native command preparation,
menu spacing, Pause/Resume/Clear commands, paused colors, duplicate-click guards,
failure feedback, session-switch cancellation, and disabling with a mocked host. Manually check real
subagents/shells/goals, narrow-terminal layout, and reload in OpenCode before
publishing. Source is maintained in the same GitHub repository as the other
plugins; this package is private and is not automatically published.
