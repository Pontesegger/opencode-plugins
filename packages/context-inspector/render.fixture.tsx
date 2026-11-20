import assert from "node:assert/strict";
import { testRender } from "@opentui/solid";
import { createSignal, Show } from "solid-js";
import { UsageBar } from "./usage-bar";

const [busy, setBusy] = createSignal(false);
const [activity, setActivity] = createSignal(false);
const [standardBar, setStandardBar] = createSignal(false);
const [sessionID, setSessionID] = createSignal<string | undefined>("first");
const [mode, setMode] = createSignal("normal");
let toggles = 0;

// Contributions outside prompt.footer stay mounted when its built-in row is
// replaced. Context is the after contribution, following the left-hand items.
const setup = await testRender(() => (
  <box width="100%" flexDirection="row" gap={1}>
    <Show when={busy()}><text flexShrink={0}>▄</text></Show>
    <Show when={activity()}><text flexShrink={0}>sub 1 shell 1 ⚑</text></Show>
    <Show when={standardBar()}><text flexShrink={0}>STANDARD</text></Show>
    <UsageBar sessionID={sessionID()} mode={mode()} onToggle={() => { toggles++; }} />
  </box>
), { width: 100, height: 3 });

async function checkRightmost() {
  await setup.renderOnce();
  const lines = setup.captureCharFrame().split("\n");
  const row = lines.find((line) => line.includes("Context"));
  assert.ok(row, "Context remains visible when the session is waiting for input");
  assert.equal(row.trimEnd().length, setup.renderer.width,
    "Context ends at the right edge even without any left-hand plugin");
  assert.ok(row.endsWith("($1.23)"), "Context cost is the rightmost footer content");
  for (const label of ["sub", "STANDARD"]) {
    if (row.includes(label)) assert.ok(row.indexOf(label) < row.indexOf("Context"));
  }
  return row;
}

try {
  await checkRightmost(); // Minimal repro: idle session, hidden standard bar.
  for (const active of [true, false]) {
    setBusy(active);
    for (const hasActivity of [true, false]) {
      setActivity(hasActivity);
      for (const visible of [true, false]) {
        setStandardBar(visible);
        await checkRightmost();
      }
    }
  }
  setup.renderer.resize(80, 3);
  const row = await checkRightmost();
  const column = row.indexOf("Context");
  await setup.mockMouse.moveTo(column, 0);
  await setup.mockMouse.click(column, 0);
  assert.equal(toggles, 1, "Right-aligned Context still toggles details on click");
  setMode("shell");
  await setup.renderOnce();
  assert.ok(!setup.captureCharFrame().includes("Context"));
  setMode("normal");
  setSessionID(undefined);
  await setup.renderOnce();
  assert.ok(!setup.captureCharFrame().includes("Context"), "Home screen is unchanged");
  console.log("PASS: Context is right-aligned and rightmost while idle/busy, with activity and standard footer toggles, after resize, and remains clickable.");
} finally {
  setup.renderer.destroy();
}
