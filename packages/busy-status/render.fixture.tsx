import assert from "node:assert/strict";
import { testRender } from "@opentui/solid";
import { RGBA } from "@opentui/core";
import { createSignal, onCleanup, Show } from "solid-js";
import { createStore } from "solid-js/store";
import plugin from "./tui";
import { colors, trackBackground, frames, stepInterval } from "./scanner.mjs";

const [statuses, setStatus] = createStore<Record<string, "idle" | "running">>({ first: "running", second: "idle" });
const [sessionID, setSessionID] = createSignal<string | undefined>("first");
const [enabled, setEnabled] = createSignal(true);
const timers = new Map<object, { tick: () => void; delay: number }>();
const originalSet = globalThis.setTimeout;
const originalClear = globalThis.clearTimeout;
let unregisters = 0;

// Advance only the plugin's animation manually; leave renderer timers untouched.
globalThis.setTimeout = ((callback, delay, ...args) => {
  if (delay !== stepInterval) return originalSet(callback, delay, ...args);
  const timer = {};
  timers.set(timer, { tick: callback, delay });
  return timer;
}) as typeof setTimeout;
globalThis.clearTimeout = ((timer) => {
  if (timers.delete(timer)) return;
  return originalClear(timer);
}) as typeof clearTimeout;

function advance() {
  assert.equal(timers.size, 1);
  const [id, timer] = timers.entries().next().value;
  timers.delete(id);
  timer.tick();
  return timer.delay;
}

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
  assert.equal(output.includes("BUSY"), false, "No BUSY label is rendered");
  assert.equal(output.includes("●"), false, "No round dot is rendered");
  assert.equal(output.includes("█"), false, "No full-height block is rendered");
  assert.equal(output.includes("▄"), expected);
  assert.equal(timers.size, expected ? 1 : 0, "Exactly one timer when busy; none when idle");
  return output;
}

try {
  function checkFrame(frame: string) {
    const spans = setup.captureSpans().lines.flatMap((line) => line.spans).filter((span) =>
      JSON.stringify(span.bg) === JSON.stringify(RGBA.fromHex(trackBackground)));
    assert.equal(spans.map((span) => span.text).join(""), ` ${frame.replace(/[░▓█]/g, "▄")} `,
      "Head and trail render as lower-half blocks on a stable track");
    assert.equal(spans.reduce((sum, span) => sum + span.width, 0), 14, "Twelve-cell track plus padding");
    const blocks = spans.filter((span) => span.text.includes("▄"));
    assert.equal(blocks.length, frame.trim().length, "Trail can overlap the bright head when reversing; never blank");
    for (const [index, shade] of [...frame.trim()].entries()) {
      assert.deepEqual(blocks[index].fg, RGBA.fromHex(colors[shade]), "Tail colors follow the head in either direction");
      assert.equal(blocks[index].text.trim(), "▄");
    }
  }
  await checkBusy(true);
  checkFrame(frames[0]);
  // Verify a complete rendered round trip, both turnarounds, and the next loop.
  let previousHeadColumn = setup.captureCharFrame().indexOf("▄"); // Initial head is at the left edge.
  for (let index = 1; index <= frames.length; index++) {
    assert.equal(advance(), 90);
    const current = frames[index % frames.length];
    await checkBusy(true);
    checkFrame(current);
    const spans = setup.captureSpans().lines[0].spans;
    let column = 0;
    let headColumn = -1;
    for (const span of spans) {
      if (span.text.includes("▄") && JSON.stringify(span.fg) === JSON.stringify(RGBA.fromHex(colors["█"]))) {
        headColumn = column + span.text.indexOf("▄");
      }
      column += span.width;
    }
    assert.equal(Math.abs(headColumn - previousHeadColumn), 1, "Rendered bright head never jumps at either edge");
    previousHeadColumn = headColumn;
  }

  // Going idle after a full sweep must cancel its pending timeout too.
  for (let index = 1; index < frames.length; index++) advance();
  await checkBusy(true);

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
  console.log("PASS: bright half-block head moves one cell at every step and turnaround; history-based fading trail; twelve-cell track; 90ms frames; no pauses; idle/session transitions and cleanup.");
} finally {
  if (!setup.renderer.isDestroyed) setup.renderer.destroy();
  globalThis.setTimeout = originalSet;
  globalThis.clearTimeout = originalClear;
}
