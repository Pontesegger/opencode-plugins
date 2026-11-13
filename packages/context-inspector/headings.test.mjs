import assert from "node:assert/strict";
import { test } from "node:test";
import { adjacentHeading, headingLines, headingOffsets } from "./headings.mjs";

test("recognizes Markdown headings of all levels, preserving the original text", () => {
  const text = "intro\r\n# First\r\nbody\r\n  ## Second\r\n###### Sixth\r\nSetext\r\n---\r\nEnd\r\n===\r\n";
  assert.deepEqual(headingLines(text), [1, 3, 4, 5, 7]);
  assert.deepEqual(headingLines("#nospace\n####### too many\n    # indented\n\t# code\n"), []);
  assert.deepEqual(headingLines(""), []);
});

test("does not navigate to headings inside fenced examples", () => {
  const text = "# Real\n````md\n# Example\n```\n## Still fenced\n````\n## Real too\n~~~\n# Example\n~~~\n### Last";
  assert.deepEqual(headingLines(text), [0, 6, 10]);
  assert.deepEqual(headingLines("```\n# unclosed example"), []);
});

test("wrapped headings land on their first visual row, at any terminal width", () => {
  assert.deepEqual(headingOffsets([1, 3], [0, 0, 1, 1, 2, 3], 12), [14, 17]);
  assert.deepEqual(headingOffsets([1, 3], [0, 1, 2, 3], 12), [13, 15]);
  assert.deepEqual(headingOffsets([], [0, 1], 0), []);
});

test("jumps relative to current scroll position without wrapping at the ends", () => {
  const offsets = [20, 0, 10, 10];
  assert.equal(adjacentHeading(offsets, 0, 1), 10);
  assert.equal(adjacentHeading(offsets, 10, -1), 0);
  assert.equal(adjacentHeading(offsets, 13, -1), 10);
  assert.equal(adjacentHeading(offsets, 13, 1), 20);
  assert.equal(adjacentHeading(offsets, 0, -1), undefined);
  assert.equal(adjacentHeading(offsets, 20, 1), undefined);
  assert.equal(adjacentHeading([], 0, 1), undefined);
});
