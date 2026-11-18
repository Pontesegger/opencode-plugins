import assert from "node:assert/strict";
import { test } from "node:test";
import { frames, startSpinner } from "./spinner.mjs";

test("spinner starts immediately, advances every 80ms, wraps, and stops", () => {
  const active = new Map();
  const clock = {
    setInterval(tick, delay) {
      assert.equal(delay, 80);
      active.set(1, tick);
      return 1;
    },
    clearInterval(id) { active.delete(id); },
  };
  const seen = [];
  const stop = startSpinner((frame) => seen.push(frame), clock);
  assert.deepEqual(seen, [frames[0]]);
  for (let i = 0; i < frames.length; i++) active.get(1)();
  assert.deepEqual(seen, [...frames, frames[0]]);
  stop();
  assert.equal(active.size, 0);
  stop();
  assert.equal(active.size, 0, "Cleanup is safe to repeat");
});

test("a new busy period restarts at the first frame without sharing state", () => {
  const active = new Set();
  const clock = {
    setInterval(tick) { active.add(tick); return tick; },
    clearInterval(tick) { active.delete(tick); },
  };
  const first = [];
  const stopFirst = startSpinner((frame) => first.push(frame), clock);
  for (const tick of active) tick();
  stopFirst();
  const second = [];
  const stopSecond = startSpinner((frame) => second.push(frame), clock);
  assert.deepEqual(first, frames.slice(0, 2));
  assert.deepEqual(second, [frames[0]]);
  assert.equal(active.size, 1);
  stopSecond();
  assert.equal(active.size, 0);
});
