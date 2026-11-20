import assert from "node:assert/strict";
import { test } from "node:test";
import { colors, frames, stepInterval, startScanner } from "./scanner.mjs";

function fakeClock() {
  const active = new Map();
  let nextID = 0;
  return {
    active,
    setTimeout(tick, delay) {
      const id = ++nextID;
      active.set(id, { tick, delay });
      return id;
    },
    clearTimeout(id) { active.delete(id); },
    advance() {
      assert.equal(active.size, 1);
      const [id, timer] = active.entries().next().value;
      active.delete(id);
      timer.tick();
      return timer.delay;
    },
  };
}

test("the bright head moves one cell per frame through both edges without jumping", () => {
  assert.deepEqual(frames.map((frame) => frame.indexOf("█")), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  for (const [index, frame] of frames.entries()) {
    assert.equal(frame.length, 12);
    assert.equal(frame.split("█").length, 2, "Exactly one bright head");
    const next = frames[(index + 1) % frames.length];
    assert.equal(Math.abs(next.indexOf("█") - frame.indexOf("█")), 1, "Head moves one cell even at turnarounds and the loop boundary");
  }
});

test("four fading trail cells follow the head's actual history through both reversals", () => {
  const shades = ["█", "▓", "▒", "░", "·"];
  for (const [index, frame] of frames.entries()) {
    const history = shades.map((_, age) => frames[(index - age + frames.length) % frames.length].indexOf("█"));
    for (const [age, shade] of shades.entries()) {
      const position = history[age];
      assert.equal(frame.indexOf(shade), history.indexOf(position) === age ? position : -1,
        "More recent shades win when the fading trail overlaps at a reversal");
    }
    assert.equal(frame.trim().length, new Set(history).size, "Only distinct head/trail positions are painted");
    assert.ok(frame.trim().length >= 3 && frame.trim().length <= 5, "Three to five cells remain visible, including at turnarounds");
  }
  assert.equal(frames[5].trim().length, 5, "Away from reversals, the head has four additional trail cells");
});

test("all five saturated-red scanner shades fade progressively to the darkest trail", () => {
  const shades = ["█", "▓", "▒", "░", "·"].map((shade) => {
    const hex = colors[shade].slice(1);
    return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  });
  assert.equal(colors["█"], "#ff0000", "Head uses full-intensity saturated red");
  assert.ok(shades.every(([, green, blue]) => green === 0 && blue === 0), "Every scanner shade retains pure-red saturation");
  for (let index = 1; index < shades.length; index++) {
    assert.ok(shades[index][0] < shades[index - 1][0], "Each trail cell has a darker red channel");
    assert.ok(shades[index].every((channel, offset) => channel <= shades[index - 1][offset]), "No color channel brightens along the trail");
  }
});

test("scanner advances every 90ms without blanks or pauses, loops, and stops", () => {
  const clock = fakeClock();
  assert.equal(stepInterval, 90);
  const seen = [];
  const stop = startScanner((frame) => seen.push(frame), clock);
  assert.deepEqual(seen, [frames[0]]);
  for (let i = 0; i < frames.length; i++) {
    assert.equal(clock.advance(), 90);
  }
  assert.deepEqual(seen, [...frames, frames[0]]);
  stop();
  assert.equal(clock.active.size, 0);
  stop();
  assert.equal(clock.active.size, 0, "Cleanup is safe to repeat");
});

test("a new busy period restarts at the first frame without sharing state", () => {
  const clock = fakeClock();
  const first = [];
  const stopFirst = startScanner((frame) => first.push(frame), clock);
  clock.advance();
  stopFirst();
  const second = [];
  const stopSecond = startScanner((frame) => second.push(frame), clock);
  assert.deepEqual(first, frames.slice(0, 2));
  assert.deepEqual(second, [frames[0]]);
  assert.equal(clock.active.size, 1);
  stopSecond();
  assert.equal(clock.active.size, 0);
});

test("stopping at a turnaround cancels its timer and prevents late updates", () => {
  const clock = fakeClock();
  const seen = [];
  const stop = startScanner((frame) => seen.push(frame), clock);
  for (let i = 0; i < 11; i++) clock.advance();
  assert.equal(seen.at(-1), frames[11]);
  const pending = clock.active.values().next().value;
  assert.equal(pending.delay, 90);
  stop();
  assert.equal(clock.active.size, 0);
  const count = seen.length;
  pending.tick();
  assert.equal(seen.length, count, "Even an already-queued callback cannot redraw after cleanup");
  assert.equal(clock.active.size, 0);
});
