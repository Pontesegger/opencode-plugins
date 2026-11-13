# Context usage and component inspector (OpenCode V2)

## Use

- The context-usage row below the prompt footer stays visible. Click **Context**
  immediately left of its progress bar to show/hide the component details above
  the prompt. Only the label toggles details, not the progress bar or token count.
  The label is muted gray and highlights in the theme's bright text color on hover.
- `/context`: the same show/hide toggle for keyboard access.
- Click a colored block **or its legend label** to view captured text in a
  dedicated, scrollable read-only inspector, centered at 80% of screen width.
- `/context-inspect`: keyboard-accessible category picker.
- The selector at the top switches between the included main categories.
  Click a heading or use Left/Right; the selected heading is bracketed.
  Switching keeps the same captured revision and resets scrolling to the top.
- Inspector: Esc closes; Up/Down, Page Up/Down, Home/End, or mouse wheel scroll.
- Horizontal rules separate the fixed header and navigation footer from the
  scrollable content, using the active theme's border color.
- Shift+Up/Down jumps to the previous/next heading in the current category:
  entry titles and Markdown headings within captured text (excluding fenced
  code examples). Jumps follow the current scroll position, account for wrapped
  lines, and stop at the ends rather than switching categories.

Blue: System prompt. Purple: AGENTS.md / rules. Green: System tools.
Yellow: Skills. Orange: MCP tools, only when separately identifiable definitions
are present in the outgoing context. Zero-sized categories are hidden.

The bar occupies about 70% of the composer's available width, with two-column
gaps. Widths are proportional to the included components, not the model window.
It has no conversation, ordinary file/tool-result history, or free-space segment.
The overall context-usage row and component inspector are provided by this single
plugin; built-in footer/status information is left intact.

## Overall context usage

The usage row uses the latest assistant request's reported input + cached input +
output + reasoning, matching V2's normalized `TokenUsage.total`, not cumulative
billing totals. Usage updates when the provider reports it; unreported new
messages/tool output are not estimated. The denominator follows the prompt's
selected model. Compaction is reflected when the next measured request arrives.

- Green: fewer than 150,000 tokens.
- Yellow: at least 150,000 tokens and at most 50% of the selected model's window.
- Red: at least 150,000 tokens and more than 50% of the window.
- Green takes priority if these thresholds overlap on smaller windows.

Set `width` (5–40 characters), `greenBelow` (tokens), and `yellowThrough` (fraction)
under this plugin's `options` in `~/.config/opencode/opencode.jsonc`.

## Captures and accuracy

The server's read-only `session.context` hook copies the assembled system text,
model-visible tool descriptions/input schemas, and explicitly loaded skill text
from the next primary model request and tool-driven continuations. It does not
run additional model requests. Auxiliary title/compaction requests do not replace
the primary capture. No old request is reconstructed from current files.

Each view identifies the captured time, model, and revision. Inspector headings
and the pretty-printed tool JSON are presentation formatting; instruction/skill
text is copied from the captured context. It is **not** the exact provider HTTP
payload, which may be formatted or transformed afterwards. Later plugins can
also edit the context after this hook; keep this plugin last when possible.

Counts are explicitly **estimates**: UTF-8 bytes / 4 rounded upward per entry.
They do not include provider message framing and are not RAM measurements.

Instruction attribution uses experimental `metadata.experimental.instructions`.
Only source substrings still present in the assembled text are attributed; stale
metadata is never displayed as though it was sent. Unattributed text stays under
System prompt and the inspector reports the limitation. Skill catalogs and
loaded skill content have separate entries within Skills.

MCP names are matched to the active server catalog. Identifiable Code Mode
namespace groups are separated from the system tool catalog without rewriting
their text. Where definitions cannot be separated reliably,
the inspector notes this instead of counting every installed tool as included.
Set `options.showMcp` to `false` in the plugin's global `opencode.jsonc` entry
to omit a separately identifiable MCP segment from the bar/picker.

## Privacy and lifecycle

Captures are kept only in server process memory: at most eight sessions, two
revisions per session, and 32 MiB serialized content per loaded location. Old
captures are evicted, and plugin unload/reload clears them. Oversized captures
are rejected rather than truncated. RPC summary events contain no prompt text;
full text is fetched through OpenCode's connected authenticated client only on
inspection. The plugin performs no filesystem writes, telemetry, or logging.
The read-only inspector cannot change context. Do not post screenshots of private
instructions or tool schemas publicly without reviewing them.

Valid configuration changes reload automatically. `/reload` can force a refresh.
A session with no capture shows “awaiting the next model request.” Captures from
before installation or a service/plugin reload are unavailable.

## Installation

Requires OpenCode V2; prepared against 2.2.7. See the [repository installation
guide](../../README.md) for dependencies and replacing an existing local copy.
Merge an entry into `~/.config/opencode/opencode.jsonc` (or its XDG equivalent):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/path/to/opencode-plugins/packages/context-inspector",
      "options": {
        "showMcp": true,
        "width": 20,
        "greenBelow": 150000,
        "yellowThrough": 0.5
      }
    }
  ]
}
```

Replace the example path with your checkout's absolute path. This loads both the
server hook and TUI; do not also list the package in `cli.json`. Keep it last
among context-modifying plugins where possible. Disable both parts through the
plugin manager or a `-local.context-inspector` directive. Plugin and RPC IDs retain
their original `local.*` names. The former standalone `context-bar` functionality
has been merged here; it needs no separate configuration.

Tests: `npm test` in this directory, or `npm run check` at the repository root.
Before release, manually verify the bar, clicks, category selection, 80% centered
sizing, terminal resizing, scrolling, heading jumps, Esc, and slash commands in a
session with a fresh in-memory capture. Never publish captured private text.
