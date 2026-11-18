import assert from "node:assert/strict";
import { testRender } from "@opentui/solid";
import { RGBA, TextAttributes } from "@opentui/core";
import { createSignal, onCleanup, Show } from "solid-js";
import { createStore } from "solid-js/store";
import plugin from "./tui";
import { background, foreground, frames } from "./spinner.mjs";

const [statuses, setStatus] = createStore<Record<string, "idle" | "running">>({ first: "running", second: "idle" });
const [sessionID, setSessionID] = createSignal<string | undefined>("first");
const [enabled, setEnabled] = createSignal(true);
const timers = new Map<object, () => void>();
const originalSet = globalThis.setInterval;
const originalClear = globalThis.clearInterval;
let unregisters = 0;

// Advance only the plugin's animation manually; leave renderer timers untouched.
globalThis.setInterval = ((callback, delay, ...args) => {
  if (delay !== 80) return originalSet(callback, delay, ...args);
  const timer = {};
  timers.set(timer, callback);
  return timer;
}) as typeof setInterval;
globalThis.clearInterval = ((timer) => {
  if (timers.delete(timer)) return;
  return originalClear(timer);
}) as typeof clearInterval;

function HostSlot() {
  let slot;
  const unregister = plugin.setup({
    data: { session: { status: (id) => statuses[id] ?? "idle" } },
    ui: { slot: (definition) => {
      assert.equal(definition.prepend, "prompt.footer.status");
      slot = definition;
      return () => { unregisters++; };
    } },
  });
  onCleanup(unregister);
  return slot.render({ get sessionID() { return sessionID(); }, mode: "normal", showDetails: false });
}

const setup = await testRender(() => (
  <box flexDirection="row" gap={1}>
    <text>EXISTING STATUS</text>
    <Show when={enabled()}><HostSlot /></Show>
  </box>
), { width: 50, height: 3 });

async function checkBusy(expected: boolean) {
  await setup.renderOnce();
  const output = setup.captureCharFrame();
  assert.ok(output.includes("EXISTING STATUS"), "Other status content is preserved");
  assert.equal(output.includes("BUSY"), expected);
  assert.equal(timers.size, expected ? 1 : 0, "Exactly one timer when busy; none when idle");
  return output;
}

try {
  let output = await checkBusy(true);
  assert.ok(output.includes(frames[0]), "Loading mid-turn immediately shows busy");
  const busySpan = setup.captureSpans().lines.flatMap((line) => line.spans).find((span) => span.text.includes("BUSY"));
  assert.ok(busySpan);
  assert.deepEqual(busySpan.fg, RGBA.fromHex(foreground), "Badge text is white");
  assert.deepEqual(busySpan.bg, RGBA.fromHex(background), "Badge has a solid vivid red background");
  assert.ok(busySpan.attributes & TextAttributes.BOLD, "Badge text is bold");
  assert.equal(busySpan.text, ` ${frames[0]}  BUSY `, "Colored padding makes the badge wider and separates the spinner");
  for (const tick of timers.values()) tick();
  output = await checkBusy(true);
  assert.ok(output.includes(frames[1]), "Spinner visibly advances");

  setStatus("first", "idle");
  await checkBusy(false);
  setStatus("second", "running");
  await checkBusy(false); // Another session cannot make this session look busy.
  setSessionID("second");
  await checkBusy(true);
  setSessionID("first");
  await checkBusy(false);

  // Success, failure and cancellation all settle the host status back to idle.
  for (const outcome of ["success", "failure", "cancellation"]) {
    setStatus("first", "running");
    await checkBusy(true);
    setStatus("first", "idle");
    await checkBusy(false);
  }
  setSessionID(undefined);
  await checkBusy(false);
  setSessionID("missing");
  await checkBusy(false);
  setSessionID("second");
  await checkBusy(true);

  setEnabled(false);
  await checkBusy(false);
  assert.equal(unregisters, 1, "Disabling unregisters the slot");
  setEnabled(true);
  await checkBusy(true);
  assert.equal(timers.size, 1, "Reload never duplicates the animation");
  setup.renderer.destroy();
  assert.equal(timers.size, 0, "Renderer disposal clears the animation");
  assert.equal(unregisters, 2);
  console.log("PASS: padded red badge with bold white text; animation; mid-turn load; idle transitions; session switching; preserved status; disable/reload and renderer cleanup.");
} finally {
  if (!setup.renderer.isDestroyed) setup.renderer.destroy();
  globalThis.setInterval = originalSet;
  globalThis.clearInterval = originalClear;
}
