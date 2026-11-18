# Busy Status

A high-contrast red badge with an animated spinner and bold white **BUSY** label
in the current session's prompt status row. Colored padding makes it stand out
without flashing. The entire indicator disappears when the session is idle, including after
completion, cancellation, or failure. Other sessions do not affect it.

Uses OpenCode V2's reactive session status, so loading the plugin during a running
turn works without waiting for another start event. It stays visible throughout
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

The spinner intentionally animates independently of the global `animations`
setting. It uses a fixed vivid red background (`#d71920`) and white text (`#ffffff`)
in every theme, with a contrast ratio above 5:1. Its 80ms animation
timer exists only while visible and is cleaned up on idle, session switching,
plugin disable/reload, or UI disposal. Existing status contributions are preserved.

## Verify

```sh
npm test --workspace=opencode-busy-status
npm run test:busy-status
```

The renderer test requires Bun. For a live smoke test, send a prompt with a tool
call, verify the red spinner moves while working and disappears after the final
response, then repeat with cancellation and a session switch. Reload during a
running turn and confirm there is only one indicator.
