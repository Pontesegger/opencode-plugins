# Goal indicator research — OpenCode V2

Research date: 2026-11-20. Scope: extend Activity Status with a **read-only** goal indicator. No implementation, dependency, global configuration, or runtime goal changes were made. No commit/push. Existing working-tree changes were left intact.

## Conclusion

**Feasible as a TUI-only addition.** The installed OpenCode **2.3.2** exposes the built-in goal plugin's read-only RPC, `opencode.goal`: method `get`, event `changed`. The installed **2.2.7** schema package already publishes the same contract as `Goal.Definition` from `@opencode/schema/goal`. Its fields and method/event shapes match the installed binary. No custom server part or goal-state writes are needed. [S1–S5, B1–B3]

The distinction is important: `Rpc.define`, `context.client.rpc`, subscriptions, and footer slots are **documented V2 extension APIs**. The specific goal contract has a **public package export and first-party comments**, but is **not documented as a stable goal API in the fetched V2 guides**. The binary's goal lifecycle and footer renderer are **observations of this installed version**, not promises about future releases. [D1–D5, S1–S5, B1–B4]

## Current package and coexistence

### Implementation follow-up

#### Hover controls follow-up

The user subsequently requested goal mutation controls. The hover heading now
offers Pause for active goals, Resume for paused goals, and Clear for all stored
goals. It calls `context.client.session.command({ sessionID, name: "goal", text:
"pause" | "resume" | "clear" }, { signal })`, matching the native dialog's
observed command contract (B3), rather than inventing goal RPC mutation methods.
The flag is yellow `#EAB308`/hover `#FDE047` while paused and uses the existing
green palette otherwise. Commands are single-flight, scoped to the selected
session, cancelled on disposal, and refreshed through the existing RPC watcher
after success. Errors show a toast; stale completions do not change a new
session's UI. The details dialog remains read-only. Renderer tests exercise
commands against a mocked server; no live goal was paused, resumed, or cleared
for this follow-up's verification. The original read-only proposal below is
retained as historical research, not the current action policy.

The read-only goal indicator is now implemented in `tui.tsx`, `goals.mjs`, and
`goal-details.tsx`. It uses the canonical `Goal.Definition` with an explicit
`@opencode/schema: 2.2.7` dependency, the selected `⚑` icon, and the Skills sidebar
palette. Goal-only visibility, blank header spacing, a scrollable details dialog,
runtime state validation, session/location isolation, stale-read protection,
reconnect, and cleanup have automated coverage. The additive footer and concurrent
Busy Status footer-placement trial hook are preserved. No goal-mutating actions
were added.

A read-only live API check succeeded for this session at its explicit location:
`POST /api/rpc/opencode.goal/get?location[directory]=<session directory>` returned
`output.status: "active"` and the user-provided objective. Calling that route
without a location returned `rpc.unavailable`, demonstrating why the plugin
always supplies the selected session's directory. A fresh full-screen OpenCode
TUI attached to this session in a pseudo-terminal also emitted `⚑` with foreground
RGB `(34, 139, 34)` (`#228B22`), with no detected module-load/startup error. It
submitted no prompt and changed no goal state; only the verification client was
terminated. Hover/click, dialog updates, and Escape are covered by mocked renderer
tests rather than a human-driven live visual check.

Verification: `npm run check` passed all 88 workspace helper tests and all six
tarball checks; all five Bun renderer suites passed. Activity Status runtime
TypeScript checking passed with `--noEmit --skipLibCheck`, bundler resolution,
and the OpenTUI JSX types.

- `tui.tsx` appends to `prompt.footer`; it does not replace it. The source intentionally places this contribution before Context Inspector's `after: prompt.footer` contribution. Retain that placement, the existing subagent navigation/Esc behavior, shell viewer, and custom plugin contributions. [P1:40–48, 90–114, P2:23, 36–40]
- The existing row appears only in normal mode, with a session ID and at least one active subagent/shell counter. A goal-only row will require widening that visibility condition; do not tie goal visibility to either counter. [P1:46–51, 116–127]
- Package dependency is `@opencode/plugin: 2.2.7`, with OpenTUI 0.8.4 and Solid 1.9.16 development versions. It exports only `./tui`; there is no server part. [P3]
- No `AGENTS.md` or existing `*RESEARCH*.md` convention was found inside this repo; this package-local note is the only research artifact.

## Exact RPC contract

This is the published 2.2.7 contract, also observed in the 2.3.2 binary. All fields below are required except `reason` and `stalls`. The published schema uses `Number`, **not integer or bounded-number refinements**. The state is nullable, not an array. [S1, S2, B1]

```ts
type GoalState = {
  id: string;
  objective: string;
  status: "active" | "paused" | "complete";
  reason?: string;
  rounds: number;
  maxRounds: number;
  stalls?: number;
  boot: string;
  updatedAt: number;
};

// RPC ID: "opencode.goal"
// Method: "get"
type GetInput = { sessionID: string };
type GetOutput = GoalState | null;

// Subscribe with local name: "changed"
// Received event.type: "rpc.opencode.goal.changed"
type ChangedData = { sessionID: string; goal: GoalState | null };
// Event envelope also includes location (directory), ID, etc.
```

The getter returns the state directly through the RPC subclient: **not** `response.data`, `response.goal`, or `response.output`. `null` means no stored goal. A clear writes/removes state and publishes `{ sessionID, goal: null }`. There are no goal-specific declared method errors and no `set`, `list`, `pause`, or `resume` RPC methods. Standard RPC/transport failures still apply. [S1, S4, S6, B2]

### Public import route

```ts
import { Goal } from "@opencode/schema/goal";

const goals = context.client.rpc(Goal.Definition);
const goal = await goals.get(
  { sessionID },
  { location: { directory } },
);
const unsubscribe = goals.events.on("changed", (event) => {
  // Filter event.data.sessionID and event.location.directory.
  // event.data.goal is Goal.State | null.
});
```

`@opencode/schema/package.json` publicly exports `./*`, resolving this import to `dist/goal.js`/`dist/goal.d.ts`. A read-only Node inspection successfully imported `Goal`, decoded a sample `Goal.State` and nullable state, and checked `Definition`'s ID/method/event names. **This proves local SDK availability, not in-TUI integration.** [S1–S3]

`Goal` is **not re-exported by `@opencode/plugin`**; its Promise index exports `Rpc`, but not `Goal`. There is no `Plugin.RPC` symbol to use here. The documented spelling is `import { Rpc } from "@opencode/plugin/rpc"; Rpc.define(...)`. [S5, S7, D2]

For a later implementation using the canonical import, declare `@opencode/schema` as a **direct package dependency** at a tested compatible version rather than relying on workspace hoisting/transitive installation. The installed binary explicitly supplies `@opencode/plugin/rpc` and host `effect` modules, but its runtime-module table does **not** contain `@opencode/schema/goal`; the schema package must resolve from installed dependencies. Normal dependency resolution for this import has not been tested inside this TUI. [P3, S3, S7, B4]

### Existing-dependencies-only alternative

It is also possible to describe an equivalent JSON wire contract with the documented `Rpc.define` API. This **defines a client contract only**; do **not** register a replacement server RPC under the built-in ID. Definition itself does not reserve/register the ID, and the client dispatches by ID and method name, not contract object identity. [D2, S4, S6, S7]

```ts
import { Rpc } from "@opencode/plugin/rpc";

const state = {
  type: "object",
  properties: {
    id: { type: "string" }, objective: { type: "string" },
    status: { enum: ["active", "paused", "complete"] },
    reason: { type: "string" }, rounds: { type: "number" },
    maxRounds: { type: "number" }, stalls: { type: "number" },
    boot: { type: "string" }, updatedAt: { type: "number" },
  },
  required: ["id", "objective", "status", "rounds", "maxRounds", "boot", "updatedAt"],
} as const;
const nullableState = { anyOf: [state, { type: "null" }] } as const;

const GoalRPC = Rpc.define({
  id: "opencode.goal",
  methods: {
    get: {
      input: {
        type: "object", properties: { sessionID: { type: "string" } },
        required: ["sessionID"],
      },
      output: nullableState,
    },
  },
  events: {
    changed: {
      schema: {
        type: "object",
        properties: { sessionID: { type: "string" }, goal: nullableState },
        required: ["sessionID", "goal"],
      },
    },
  },
});
```

This intentionally allows additional properties for forward compatibility; it reproduces the known wire fields, not every Effect schema decoding behavior. JSON schemas produce `unknown` method results in TypeScript, so narrow/check received values before rendering. Furthermore, the 2.2.7 Promise RPC implementation does **not validate responses/events against the supplied schema**: it returns raw `result.output` and forwards matching events. Even the canonical import provides type inference, not client-side runtime verification. [D2, S4, S6]

### Underlying HTTP shapes (not necessary for the TUI)

```text
POST /api/rpc/opencode.goal/get
location query: deepObject { directory: "/absolute/session/directory" }
JSON request body: { "input": { "sessionID": "ses_..." } }
JSON response body: { "output": GoalState | null }
```

The generated `rpc.call` input is `{ rpcID: "opencode.goal", method: "get", input: { sessionID }, location: { directory } }`. The typed RPC wrapper unwraps `output`. Continue using `context.client` so existing connection/authentication/remote-server handling is preserved; do not construct a separate unauthenticated fetch. [S4, S8, B5, D1, D2]

## How the built-in footer reads goals

In installed function `Ai(context, sessionIDAccessor)`: [B3]

1. Create `context.client.rpc(Xpe)` (`Xpe` is the `opencode.goal` definition).
2. On session selection, clear the previous displayed goal, then call `get({ sessionID }, { location: { directory } })`, deriving directory from `context.data.session.get(sessionID)?.location.directory`. If absent, the built-in omits location options.
3. Subscribe to `changed`; compare `event.data.sessionID` with the current session, invalidate older pending reads, and set `event.data.goal ?? undefined` directly. The built-in does not additionally compare event location; a plugin should, because RPC subscriptions are not location-filtered. [D2, S4]
4. Re-read on `context.data.on("server.connected", ...)`, because subscriptions are live-only and reconnects can miss changes. [D2]
5. Use a monotonically increasing request token plus current-session equality so old getters cannot overwrite newer reads, session changes, or events. Dispose listeners with Solid cleanup.

The rendered labels are `◎ goal`, `◎ goal paused`, and `◎ goal met`. Active uses muted text, paused warning text, complete success text, and hover uses base text. The indicator persists for paused/complete goals while stored; it is not limited to active execution. It appears in normal prompt mode. Clicking opens an internal goal dialog displaying objective/status/reason. That dialog dispatches **mutating** commands with `context.client.session.command({ sessionID, name: "goal", text: "pause" | "resume" | "clear" })`. Neither the internal dialog component nor a native goal-dialog command is documented in the fetched TUI APIs. A read-only extension should show its own details card/dialog and **not copy these actions**. [B3, D1]

## Goal status, finality, and ownership

Published comments establish that a session owns its own goal; **children and forks start without one**, and changes publish in that session's Location. Do not display a parent goal as the child's goal or aggregate descendant goals into the current indicator. There is one current state per session (`get` is scalar; installed storage uses `"session:" + sessionID`). A new objective overwrites the current state with a new ID; no goal-history/list API is present in this contract. [S1:23–25, B2]

| Status | Meaning in installed 2.3.2 | Suggested UI |
| --- | --- | --- |
| `active` | Armed for automatic goal review/continuation at experimental idle boundaries. Not equivalent to the session currently running. | `◎ goal`, optional round detail |
| `paused` | Automatic continuation stopped, without declaring success. May be user-driven or a safety/error condition. | `◎ goal paused`, reason in details |
| `complete` | The model-based goal reviewer returned `done`; the goal settled to complete with the reviewer's reason. | `◎ goal met`, retained until cleared/replaced |
| `null` | No current stored goal, including after clear. | Hide indicator |

These lifecycle meanings come from **installed implementation**, not a documented stability guarantee. [B2, B3]

Important limitations and safety semantics observed in that implementation: [B2]

- Completion is a **reviewer's judgment**, not independent verification, a progress percentage, an immutable terminal session state, or a guarantee that all background work ended. Background shells are supplied to the reviewer; it may return `wait` when a needed result is pending. Waiting is **not another public status**: the goal remains active.
- Idle review defers while that session has background subagent/image/Code Mode work. Session `idle` does not mean the goal is complete; an active goal can trigger another synthetic continuation.
- Defaults observed: maximum 50 rounds, pause after 3 consecutive stalls; objectives limited to 4000 characters. These are implementation constants, not schema constraints or configuration recommendations.
- `rounds` counts continuations since set/resume; it is not percent-complete. Initial set has `rounds: 0`; resume reconstructs an active state with `rounds: 1` and the same ID/objective/maxRounds, dropping prior reason/stalls.
- User stop, execution failure, unusable review, repeated review overflow, stall/round limit, background inactivity (30 minutes), or a server-process restart can pause an active goal. `boot` identifies the process that armed it. Paused state is not necessarily user-requested.
- The status can be replaced by a new goal. Only paused goals accept `resume` in the observed command handler; complete has no resume action. Clear removes the state. Do not infer a general terminal/finality API from `complete`.
- Getter is a storage read; it does not arm, resume, continue, or clear a goal. No live goal commands were invoked during this research.

## Minimal design proposal

Selected visual design: use `⚑` (milestone flag) for the goal indicator,
with the Skills sidebar's dark green `#228B22` normally and light green `#86EFAC`
on hover. These are fixed palette choices from `../sidebar-info/skills.mjs`, not
dynamic colors that change with the sidebar's rolling skill-use counts. The
goal and existing subagent/shell indicators use this palette.

1. Keep the existing TUI plugin and `append: prompt.footer`; do not replace the footer, inspect/modify host renderables, disable built-ins, or touch another plugin/global config. A duplicate of the built-in goal label may be visible when both render; accept this as an explicit tradeoff or offer a plugin-local opt-out later. There is no documented goal-specific slot replacement target. [D1, P1, B3]
2. Add a small goal-reader component/helper scoped to the slot's reactive `sessionID` **and directory**, with its own signal, request generation, disposal, `changed` subscription, and reconnect refresh. Use the existing `location()` precedence (session location, context location, default). Filter both session and event directory; ignore stale read results and stale events. Recreate/rebind subscriptions when the connected client changes. [P1:45, D2, B3]
3. Prefer `Goal.Definition` with an explicit direct schema dependency if dependency changes are acceptable. If preserving the exact existing dependency set is the priority, use a local `Rpc.define` JSON contract through the host-provided plugin SDK. Neither path requires RPC registration/server configuration.
4. Show goal status independent of shell/subagent counts; include goal presence in the row's visibility rule. Keep a single nonwrapping compact row, existing green counters, and existing hover timing/placement. Use semantic goal status colors; hover/click may expose objective/reason/rounds in a **read-only** card. Dismiss/re-anchor other hover cards if goal insertion/removal shifts counters. [P1, P2, B3]
5. Keep goal state ephemeral in Solid; do not persist objectives or copy server storage. Distinguish unsupported RPC / disconnected / invalid data from confirmed `null` internally; fail closed for goal rendering without breaking counters or spamming toasts. Handle plain RPC failure objects as well as `Error`. [D2, S4, S6]
6. On reconnect, avoid treating the last active state as current until refreshed (hide or mark stale). On unload, unsubscribe, abort/invalidate requests and clear timers. Read-only UI should have no pause/resume/clear bindings and never call `session.command` or synthetic/prompt APIs.

## Compatibility risks and proposed verification

**Evidence supports compatibility, not a tested live extension.** The 2.2.7 published goal definition and 2.3.2 embedded definition match; both versions support `Rpc.define` and the RPC wrapper shape. The host resolves plugin SDK/Effect imports to its own bundled modules, so installed npm typings are not necessarily the runtime implementation. [S1, S4–S7, B1, B4]

- Pin/test the supported runtime/server combinations; the server version is relevant, especially remotely. A 2.3.2 TUI does not prove a remote server has this RPC enabled/available. Handle `rpc.unavailable`, `rpc.method_not_found`, validation/transport failures, and future unrecognized statuses non-fatally. [D2, S6]
- Canonical schema import must be tested from the **installed package inside the TUI**, not only this hoisted workspace. JSON contract avoids that import but duplicates an evolving first-party contract and needs explicit value checks. [D3, S3, B4]
- Existing fixture mocks lack `client.rpc`, `data.on`, and warning/success theme tokens; a later implementation needs those mocked. Add getter/null, active/paused/complete, event clear, wrong session/directory, session switches, response/event races, reconnect, unknown/error, and disposal tests. [P4]
- Renderer tests should cover goal-only visibility with zero counters, all counters plus goal, narrow terminal overflow, read-only details interaction, disappearance moving an open hover anchor, and preserving Busy Status/Context Inspector/custom plugins. No runtime command side effects should occur in these tests. [P1, P2, P4]
- Manual in-TUI verification remains necessary. Research ran only `opencode --version`, read files/binary/docs, and a local SDK import/schema test; it did not call a live RPC, create goals, alter config, install packages, or start/restart services.

## Primary sources and reproducibility

### Official V2 documentation (fetched 2026-11-20)

- **D1:** [Building TUI plugins](https://opencode.ai/docs/build/plugins/cli): context/client, event cleanup, slots/placement, dialog APIs, host-renderable stability warning.
- **D2:** [Plugin RPC](https://opencode.ai/docs/build/plugins/rpc): `Rpc.define`, JSON/Standard Schema, client RPC, live-only subscriptions, local vs prefixed names, location filtering.
- **D3:** [Building plugins](https://opencode.ai/docs/build/plugins): parts, package exports, dependency compatibility and installed-package testing.
- **D4:** [V2 docs index](https://opencode.ai/docs/llms.txt): no dedicated goal guide was listed. Also fetched [CLI](https://opencode.ai/docs/cli), [TUI](https://opencode.ai/docs/cli/tui), [CLI commands](https://opencode.ai/docs/cli/commands), and [Commands](https://opencode.ai/docs/commands); these pages did not document this goal RPC/lifecycle.
- **D5:** [Commands — Loading](https://opencode.ai/docs/commands#loading): custom command definitions can replace built-ins; presence of `/goal` alone does not establish the built-in contract.

### Published first-party SDK installed in this repo (2.2.7)

Links below are relative to this research note; source packages identify `anomalyco/opencode` as their repository.

- **S1:** [`@opencode/schema/dist/goal.js`](../../node_modules/@opencode/schema/dist/goal.js), lines 1–40: status/state, ownership comments, full RPC definition.
- **S2:** [`goal.d.ts`](../../node_modules/@opencode/schema/dist/goal.d.ts), lines 1–126: exact optional/nullable types and inferred Standard Schema contract.
- **S3:** [`@opencode/schema/package.json`](../../node_modules/@opencode/schema/package.json), lines 4, 18–27: version and public wildcard exports.
- **S4:** [`@opencode/client/dist/chunks/shared-events-xqwq6bgr.js`](../../node_modules/@opencode/client/dist/chunks/shared-events-xqwq6bgr.js), lines 7–78: dispatch/unwrap, subscription filtering, cancellation, failures; [`promise/rpc.d.ts`](../../node_modules/@opencode/client/dist/promise/rpc.d.ts), lines 7–28: call location options and event shapes.
- **S5:** [`@opencode/plugin/dist/promise/index.d.ts`](../../node_modules/@opencode/plugin/dist/promise/index.d.ts), lines 1–20: exports `Rpc`, not `Goal`.
- **S6:** [`@opencode/schema/dist/rpc.d.ts`](../../node_modules/@opencode/schema/dist/rpc.d.ts), lines 43–51, 74, 99–110: portable contracts, inference, system errors, event payloads.
- **S7:** [`@opencode/plugin/dist/rpc.js`](../../node_modules/@opencode/plugin/dist/rpc.js), line 1, and [`@opencode/schema/dist/rpc.js`](../../node_modules/@opencode/schema/dist/rpc.js), lines 1–9: public `Rpc` re-export and definition-only behavior; [`plugin/package.json`](../../node_modules/@opencode/plugin/package.json), lines 4, 64–86: version, exports and schema dependency.
- **S8:** [`@opencode/protocol/dist/groups/rpc.js`](../../node_modules/@opencode/protocol/dist/groups/rpc.js), lines 6–23, and [`groups/location.js`](../../node_modules/@opencode/protocol/dist/groups/location.js), lines 5–20: HTTP envelopes, routing and deepObject location query.

### Existing plugin sources

- **P1:** [`tui.tsx`](./tui.tsx), lines 40–165: current slot, visibility, location, navigation, hover lifecycle and cleanup.
- **P2:** [`README.md`](./README.md), lines 19–46: no-gap behavior, coexistence, Context Inspector ordering and pinned-version warning.
- **P3:** [`package.json`](./package.json), lines 16–33: entrypoint/dependencies/tests.
- **P4:** [`render.fixture.tsx`](./render.fixture.tsx), lines 28–70, 86–98: mocked context and coexistence assertions.

### Installed binary observations (not a source checkout)

File: `/home/ponteseg/.opencode/bin/opencode`; `--version` returned `opencode v2.3.2`. SHA-256: `e6543f6e5c39c40971ba38afd1819ac852c29ac735b5a89065d3d148d47f27ad`. The following are **zero-based byte offsets in this specific binary**; offsets/minified identifiers change between builds.

- **B1:** Around byte **177843732**: goal schema/definition, exported `Gpe`/`Xpe`.
- **B2:** Around byte **178417504** through **178426000**: `NJ` built-in server plugin, storage/get/write, reviewer, pause conditions, command handler. Search anchors: `GoalPlugin.read`, `GoalPlugin.idle`, `Usage: /goal`.
- **B3:** Function `Ai(t,n)` starts at byte **178865534** (locate by `function Ai(t,n){let[r,o]=G(),i=t.client.rpc(Xpe)`); immediately following `Ii`, `Al`, `Li`, `Il`, `Ll` and `Nl` contain colors/labels/dialog/footer. The byte offset for the JavaScript `goal paused` label is **178866191**.
- **B4:** Around byte **166357938**: host module table contains `@opencode/plugin/rpc`; following loader supplies host SDK/Effect modules and guards against loading alternate copies from plugin dependencies. No exact `"@opencode/schema/goal"` key was present.
- **B5:** Around byte **169548507**: generated HTTP RPC route/query/body construction.

Binary inspection used Python 3 byte searches/regex and **bounded surrounding slices**, never a full strings dump. Reproduce the key anchors without running the service:

```python
from pathlib import Path
import re
b = Path("/home/ponteseg/.opencode/bin/opencode").read_bytes()
for pattern in [
    rb'Xpe=.{0,800}id:"opencode.goal"',
    rb'GoalPlugin\.read',
    rb'function Ai\(t,n\)\{let\[r,o\]=G\(\),i=t\.client\.rpc\(Xpe\)',
]:
    for match in list(re.finditer(pattern, b))[:3]:
        print(match.start(), b[max(0, match.start()-200):match.start()+2000]
              .decode("utf-8", "replace"))
```
