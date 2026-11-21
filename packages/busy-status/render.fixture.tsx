import assert from "node:assert/strict";
import { testRender } from "@opentui/solid";
import { RGBA } from "@opentui/core";
import { createSignal, onCleanup, Show } from "solid-js";
import { createStore } from "solid-js/store";
import plugin from "./tui";
import { colors, trackBackground, bracketColor, width, frames, stepInterval } from "./scanner.mjs";

const [statuses, setStatus] = createStore<Record<string, "idle" | "running">>({ first: "running", second: "idle" });
const [sessionID, setSessionID] = createSignal<string | undefined>("first");
const [enabled, setEnabled] = createSignal(true);
const timers = new Map<object, { tick: () => void; delay: number }>();
const originalSet = globalThis.setTimeout;
const originalClear = globalThis.clearTimeout;
let unregisters = 0;
// A previously saved visible-bar preference exercises the original scanner row.
const [settings, updateSettings] = createStore({ hidden: false });
const definitions = new Set<any>();

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
    storage: { store: (key, { initial }) => {
      assert.equal(key, "status-bar");
      assert.deepEqual(initial, { hidden: true });
      return [settings, async (update) => updateSettings("hidden", (hidden) => {
        const draft = { hidden };
        update(draft);
        return draft.hidden;
      })];
    } },
    keymap: { layer: (factory) => {
      const layer = factory();
      assert.equal(layer.mode, "global", "Status bar command must be active in the real command palette");
      assert.equal(layer.commands[0].slash.name, "statusbar");
    } },
    data: { session: { status: (id) => statuses[id] ?? "idle" } },
    ui: { toast: { show: () => {} }, slot: (definition) => {
      definitions.add(definition);
      if (definition.prepend || definition.before) slot = definition;
      return () => { definitions.delete(definition); unregisters++; };
    } },
  });
  assert.equal(slot.before, "prompt.footer");
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
  assert.equal(output.includes("▬"), expected);
  assert.equal(output.includes("■"), false, "Scanner uses the preferred centered rectangle rather than squares");
  assert.equal(output.includes("▄"), false, "Scanner no longer uses bottom-aligned half blocks");
  assert.equal(output.includes("["), expected, "Opening bracket is visible only while busy");
  assert.equal(output.includes("]"), expected, "Closing bracket is visible only while busy");
  assert.equal(timers.size, expected ? 1 : 0, "Exactly one timer when busy; none when idle");
  return output;
}

try {
  function checkFrame(frame: string) {
    const spans = setup.captureSpans().lines.flatMap((line) => line.spans).filter((span) =>
      JSON.stringify(span.bg) === JSON.stringify(RGBA.fromHex(trackBackground)));
    assert.equal(spans.map((span) => span.text).join(""), ` [${frame.replace(/[·░▒▓█]/g, "▬")}] `,
      "Square brackets fence the centered-rectangle scanner track");
    assert.equal(frame.length, 14, "The running light travels across the widened fourteen-cell track");
    assert.equal(width + 4, 18, "The whole indicator is two columns wider, including brackets and padding");
    assert.equal(spans.reduce((sum, span) => sum + span.width, 0), width + 4, "Brackets add exactly two columns to the track plus padding");
    const brackets = spans.filter((span) => /[\[\]]/.test(span.text));
    assert.equal(brackets.length, 2, "Both square brackets remain visible through every animation frame");
    for (const bracket of brackets) {
      assert.deepEqual(bracket.fg, RGBA.fromHex(bracketColor), "Brackets use the dark-red color");
      assert.equal(bracket.width, 1, "Each bracket occupies exactly one column");
    }
    const blocks = spans.filter((span) => span.text.includes("▬"));
    assert.ok(blocks.length >= 3 && blocks.length <= 5, "Head and four fading trail cells stay visible except for reversal overlaps");
    assert.equal(blocks.length, frame.trim().length, "Trail can overlap the bright head when reversing; never blank");
    for (const [index, shade] of [...frame.trim()].entries()) {
      assert.deepEqual(blocks[index].fg, RGBA.fromHex(colors[shade]), "Tail colors follow the head in either direction");
      assert.equal(blocks[index].text.trim(), "▬");
    }
  }
  await checkBusy(true);
  checkFrame(frames[0]);
  // Verify a complete rendered round trip, both turnarounds, and the next loop.
  let previousHeadColumn = setup.captureCharFrame().indexOf("▬"); // Initial head is at the left edge.
  for (let index = 1; index <= frames.length; index++) {
    assert.equal(advance(), 90);
    const current = frames[index % frames.length];
    await checkBusy(true);
    checkFrame(current);
    const spans = setup.captureSpans().lines[0].spans;
    let column = 0;
    let headColumn = -1;
    for (const span of spans) {
      if (span.text.includes("▬") && JSON.stringify(span.fg) === JSON.stringify(RGBA.fromHex(colors["█"]))) {
        headColumn = column + span.text.indexOf("▬");
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
  assert.equal(definitions.size, 0);
  // Exercise durable preferences and the actual command/slot lifecycle.
  const activity = { before: "prompt.footer", render: () => null };
  definitions.add(activity);
  let persisted: { hidden: boolean } | undefined;
  let preference;
  let changePreference;
  let layerFactory;
  let indicatorRegistrations = 0;
  let expectedIndicatorRegistrations = 0;
  let failSave = false;
  const errors: any[] = [];
  const context = {
    storage: { store: (key, { initial }) => {
      assert.equal(key, "status-bar");
      assert.deepEqual(initial, { hidden: true });
      [preference, changePreference] = createStore(persisted ?? initial);
      return [preference, async (update) => {
        if (failSave) throw Error("Storage unavailable");
        const draft = { ...preference };
        update(draft);
        persisted = { ...draft };
        changePreference(draft);
      }];
    } },
    keymap: { layer: (factory) => {
      const layer = factory();
      assert.equal(layer.mode, "global");
      assert.equal(layer.commands[0].slash.name, "statusbar");
      assert.ok(layer.commands[0].palette);
      layerFactory = factory;
    } },
    data: { session: { status: () => "idle" } },
    ui: { toast: { show: (error) => errors.push(error) }, slot: (definition) => {
      definitions.add(definition);
      if (definition.before) indicatorRegistrations++;
      return () => { definitions.delete(definition); };
    } },
  };
  const assertPlacement = (hidden: boolean) => {
    assert.equal(preference.hidden, hidden);
    const own = [...definitions].filter((definition) => definition !== activity);
    assert.equal(own.length, hidden ? 2 : 1);
    assert.equal(own.filter((definition) => definition.before === "prompt.footer").length, 1);
    assert.equal(indicatorRegistrations, expectedIndicatorRegistrations, "Toggles never remount the scanner or duplicate its registration");
    const replacement = own.find((definition) => definition.replace);
    assert.equal(!!replacement, hidden);
    if (replacement) {
      assert.equal(replacement.replace, "prompt.footer");
      assert.equal(replacement.render(), null);
    }
    assert.ok(definitions.has(activity), "Sibling activity contribution remains registered");
    assert.equal(activity.before, "prompt.footer", "Activity always remains outside the replaceable boundary");
    assert.equal(layerFactory().commands[0].title, hidden ? "Show standard status bar" : "Hide standard status bar");
    assert.ok(own.every((definition) => !Object.values(definition).includes("home.footer")));
  };
  const toggleStatusBar = () => layerFactory().commands[0].run();
  let stop = plugin.setup(context);
  expectedIndicatorRegistrations++;
  assertPlacement(true);
  await toggleStatusBar();
  assertPlacement(false);
  assert.deepEqual(persisted, { hidden: false });
  stop();
  assert.equal(definitions.size, 1, "Cleanup removes only this plugin's slots");
  stop = plugin.setup(context);
  expectedIndicatorRegistrations++;
  assertPlacement(false); // A fresh store restores the saved visible preference.
  await toggleStatusBar();
  assertPlacement(true);
  stop();
  stop = plugin.setup(context);
  expectedIndicatorRegistrations++;
  assertPlacement(true); // The hidden preference survives client recreation too.
  persisted = { hidden: false };
  changePreference(persisted);
  assertPlacement(false); // Another client's saved preference is observed.
  await toggleStatusBar();
  assertPlacement(true);
  failSave = true;
  await toggleStatusBar();
  assertPlacement(true);
  assert.deepEqual(errors, [{ message: "Unable to save status bar preference", variant: "error" }]);
  stop();
  assert.equal(definitions.size, 1);
  console.log("PASS: fourteen-cell scanner occupies eighteen columns with dark-red brackets and padding; unchanged five-block light and animation speed; animation and cleanup; hidden-by-default status bar; /statusbar toggle; stable plugin registration; durable preferences, cross-client updates, and save failures.");
} finally {
  if (!setup.renderer.isDestroyed) setup.renderer.destroy();
  globalThis.setTimeout = originalSet;
  globalThis.clearTimeout = originalClear;
}
