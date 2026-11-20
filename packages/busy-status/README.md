# Busy Status

A three-character red running light sweeps continuously back and forth across a
dark, twelve-cell track with no text label. All three characters are lower-half
blocks (`▄`): a bright red head, a darker red block behind it, and a very dark red tail.
The bright head travels one cell per frame all the way to each edge. The two
darker shades mark its previous two positions, rather than flipping the whole
shape when reversing. Immediately after each turnaround, the oldest trail cell
briefly overlaps the head, so two blocks are visible for that frame; the bright
head always stays on top. This avoids an edge jump while keeping the light inside
the track throughout the sweep.
It lives in the current session's prompt status row, with a fixed width so the
animation never shifts nearby text. The entire indicator disappears when the
session is idle, including after completion, cancellation, or failure. Other
sessions do not affect it.

Uses OpenCode V2's reactive session status, so loading the plugin during a running
turn works without waiting for another start event. The track stays visible throughout
the turn, including tool calls and retries, for as long as OpenCode reports the
session as running. It does not infer activity from individual text/tool events.

## Install

Merge this entry into your global `~/.config/opencode/cli.json` (or the equivalent
under `$XDG_CONFIG_HOME`), replacing the placeholder with your checkout path:

```json
{
  "plugins": ["/path/to/opencode-plugins/packages/busy-status"]
}
```

Configuration reloads automatically; `/reload` forces a refresh. No server
plugin or credentials are required. Tested against the OpenCode **2.2.7** API.

The scanner intentionally animates independently of the global `animations`
setting. Its bright red head (`#ff3030`), darker red middle (`#a81414`), and very
dark red tail (`#480909`) move on a dark red track (`#200508`). The light reverses
at each end without blank frames or pauses. It advances one cell every 90ms. Its animation
timer exists only while visible and is cleaned up on idle, session switching,
plugin disable/reload, or UI disposal. Existing status contributions are preserved.

## Standard status bar

The standard session status bar is **hidden by default**. Run `/statusbar` to
show it, then run `/statusbar` again to hide it. The command palette offers
**Show standard status bar** or **Hide standard status bar**, matching the
current state. The choice is stored durably and survives plugin reloads and
client restarts; it also synchronizes across running clients.

Hiding the bar replaces only the session's built-in prompt footer. The scanner
and Activity Status live outside that boundary permanently, so they remain
visible without remounting when the bar is toggled. Their animation, hover, and
goal state are independent of the standard bar's visibility and plugin order.
Plugins placed before/after `prompt.footer` remain
visible; prepend/append contributions and plugins inside `prompt.footer.status`
or `prompt.footer.file` are hidden with the built-in row.
The home screen is unchanged.

This replaces the temporary `/footertrial` prototype. No changes to `cli.json`
are needed; the preference belongs to Busy Status's plugin storage.

## Verify

```sh
npm test --workspace=opencode-busy-status
npm run test:busy-status
```

The renderer test requires Bun. For a live smoke test, send a prompt with a tool
call, verify the three-block light sweeps both ways while working and disappears after the final
response, then repeat with cancellation and a session switch. Reload during a
running turn and confirm there is only one indicator.
