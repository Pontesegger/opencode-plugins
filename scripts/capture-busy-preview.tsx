import assert from "node:assert/strict";
import { testRender } from "@opentui/solid";
import { onCleanup } from "solid-js";
import plugin from "../packages/busy-status/tui";
import { frames, stepInterval, width } from "../packages/busy-status/scanner.mjs";

/** Capture actual plugin-rendered cells, not an independently drawn animation. */
export async function captureBusyPreview() {
  const timers = new Map<object, () => void>();
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  globalThis.setTimeout = ((callback, delay, ...args) => {
    if (delay !== stepInterval) return originalSet(callback, delay, ...args);
    const timer = {};
    timers.set(timer, callback);
    return timer;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((timer) => {
    if (!timers.delete(timer)) originalClear(timer);
  }) as typeof clearTimeout;
  let setup;
  function Scanner() {
    let slot;
    const stop = plugin.setup({
      storage: { store: (_key, { initial }) => [initial, async () => {}] },
      keymap: { layer: () => {} },
      data: { session: { status: () => "running" } },
      ui: { slot: (definition) => {
        if (definition.before === "prompt.footer") slot = definition;
        return () => {};
      } },
    });
    onCleanup(stop);
    return slot.render({ sessionID: "preview" });
  }
  try {
    setup = await testRender(() => (
      <box width="100%" height="100%" backgroundColor="#0a0a0a" padding={1}>
        <Scanner />
      </box>
    ), { width: width + 6, height: 3 });
    const captured = [];
    for (let index = 0; index < frames.length; index++) {
      await setup.renderOnce();
      const snapshot = setup.captureSpans();
      const text = snapshot.lines[1].spans.map((span) => span.text).join("");
      assert.equal(text.trim(), `[${frames[index].replace(/[·░▒▓█]/g, "▬")}]`, "Preview follows the actual scanner frame");
      captured.push(snapshot.lines.map((line) => line.spans.map((span) => ({
        text: span.text, width: span.width, fg: span.fg.toInts(), bg: span.bg.toInts(),
      }))));
      assert.equal(timers.size, 1, "Only the scanner's animation timer is advanced");
      const [id, tick] = timers.entries().next().value;
      timers.delete(id);
      tick();
    }
    return { columns: width + 6, rows: 3, duration: stepInterval, frames: captured };
  } finally {
    setup?.renderer.destroy();
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
    assert.equal(timers.size, 0, "Capture cleans up the scanner timer");
  }
}
