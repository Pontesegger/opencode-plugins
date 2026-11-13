import assert from "node:assert/strict";
import { test } from "node:test";
import { barState, formatTokens, latestUsage } from "./usage.mjs";

test("color boundaries: under 150k green; through 50% yellow; above red", () => {
  assert.equal(barState(0, 1000000).level, "green");
  assert.equal(barState(149999, 1000000).level, "green");
  assert.equal(barState(150000, 1000000).level, "yellow");
  assert.equal(barState(500000, 1000000).level, "yellow");
  assert.equal(barState(500001, 1000000).level, "red");
});

test("green takes precedence on smaller windows", () => {
  assert.equal(barState(149999, 200000).level, "green");
  assert.equal(barState(150000, 200000).level, "red");
});

test("bar represents usage and clamps overflow without hiding the percentage", () => {
  const state = barState(300000, 1000000);
  assert.equal(state.filled, "██████");
  assert.equal(state.empty.length, 14);
  assert.equal(state.percent, 30);
  assert.equal(barState(1100, 1000).filled.length, 20);
  assert.equal(barState(1100, 1000).percent, 110);
});

test("unknown usage/window does not invent a measurement", () => {
  for (const [used, limit] of [[undefined, 1000], [100, undefined], [100, 0], [NaN, 1000]]) {
    assert.equal(barState(used, limit).known, false);
    assert.equal(barState(used, limit).level, "unknown");
  }
  assert.equal(barState(0, 1000).percent, 0);
});

test("uses the latest measured request, including caches and separate reasoning", () => {
  const assistant = (input, output, read = 0, write = 0) => ({
    type: "assistant", tokens: { input, output, reasoning: output > 0 ? 50 : 0, cache: { read, write } },
  });
  assert.equal(latestUsage([
    assistant(999999, 100), assistant(100, 200, 300, 400),
    { type: "user" }, assistant(0, 0), { type: "assistant" },
  ]), 1050);
  assert.equal(latestUsage([]), undefined);
  assert.equal(latestUsage([assistant(100, 0)]), 100);
});

test("compaction can reduce usage; do not retain the historical high-water mark", () => {
  assert.equal(latestUsage([
    { type: "assistant", tokens: { input: 500000, output: 100 } },
    { type: "compaction" },
    { type: "assistant", tokens: { input: 10000, output: 100 } },
  ]), 10100);
});

test("formats compact token counts", () => {
  assert.equal(formatTokens(128000), "128k");
  assert.equal(formatTokens(1000000), "1M");
  assert.equal(formatTokens(1250000), "1.25M");
  assert.equal(formatTokens(42), "42");
});
