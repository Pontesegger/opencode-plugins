import assert from "node:assert/strict";
import { RGBA } from "@opentui/core";
import { usePlugin } from "@opencode/plugin/tui";
import { testRender } from "@opentui/solid";
import { createSignal, Show } from "solid-js";
import { UsageBar } from "./usage-bar";
import { InteractiveText } from "./interactive-text";

const [busy, setBusy] = createSignal(false);
const [activity, setActivity] = createSignal(false);
const [standardBar, setStandardBar] = createSignal(false);
const [sessionID, setSessionID] = createSignal<string | undefined>("first");
const [mode, setMode] = createSignal("normal");
let toggles = 0;
let categoryClicks = 0;
function CategoryControl() {
  return <InteractiveText context={usePlugin()} color="#bb66ff" onClick={() => { categoryClicks++; }}>Skills category</InteractiveText>;
}

// Contributions outside prompt.footer stay mounted when its built-in row is
// replaced. Context is the after contribution, following the left-hand items.
const setup = await testRender(() => (
  <box width="100%" flexDirection="column">
   <box width="100%" flexDirection="row" gap={1}>
    <Show when={busy()}><text flexShrink={0}>▄</text></Show>
    <Show when={activity()}><text flexShrink={0}>sub 1 shell 1 ⚑</text></Show>
    <Show when={standardBar()}><text flexShrink={0}>STANDARD</text></Show>
    <UsageBar sessionID={sessionID()} mode={mode()} onToggle={() => { toggles++; }} />
   </box>
   <box height={1}><CategoryControl /></box>
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
  const findNode = (node, text) => node.plainText === text ? node
    : node.getChildren().map((child) => findNode(child, text)).find(Boolean);
  for (const [label, normal, clicks] of [
    ["Context", "#888888", () => toggles],
    ["Skills category", "#bb66ff", () => categoryClicks],
  ] as const) {
    await setup.mockMouse.moveTo(79, 2); await setup.renderOnce();
    const control = findNode(setup.renderer.root, label);
    assert.deepEqual(control.fg, RGBA.fromHex(normal), "Controls retain their neutral or semantic normal color");
    const before = clicks();
    await setup.mockMouse.moveTo(control.x, control.y); await setup.renderOnce();
    assert.deepEqual(control.fg, RGBA.fromHex("#ffffff"), "Every Context control uses bright-white hover feedback");
    await setup.mockMouse.click(control.x, control.y, 2); await setup.renderOnce();
    assert.equal(clicks(), before, "Right-click does not activate a control");
    await setup.mockMouse.pressDown(control.x, control.y);
    await setup.mockMouse.moveTo(79, 2); await setup.mockMouse.release(79, 2);
    await setup.renderOnce();
    assert.equal(clicks(), before, "Dragging away does not activate a control");
    assert.deepEqual(control.fg, RGBA.fromHex(normal), "Mouse leave restores the normal color");
    await setup.mockMouse.pressDown(79, 2);
    await setup.mockMouse.moveTo(control.x, control.y); await setup.mockMouse.release(control.x, control.y);
    await setup.renderOnce();
    assert.equal(clicks(), before, "Dragging onto a control does not activate it");
    await setup.mockMouse.click(control.x, control.y); await setup.renderOnce();
    assert.equal(clicks(), before + 1, "Left click activates the control exactly once");
    setup.renderer.emit("blur"); await setup.renderOnce();
    assert.deepEqual(control.fg, RGBA.fromHex(normal), "Blur clears hover feedback");
  }
  setMode("shell");
  await setup.renderOnce();
  assert.ok(!setup.captureCharFrame().includes("Context"));
  setMode("normal");
  setSessionID(undefined);
  await setup.renderOnce();
  assert.ok(!setup.captureCharFrame().includes("Context"), "Home screen is unchanged");
  console.log("PASS: Context is right-aligned and rightmost while idle/busy, with activity and standard footer toggles; neutral/category hover colors, one-click activation, ignored right-clicks/drags, and blur cleanup.");
} finally {
  setup.renderer.destroy();
}
