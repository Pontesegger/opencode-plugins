import assert from "node:assert/strict";
import { test } from "node:test";
import { cardPlacement, isDescendant, shells, subagents } from "./activity.mjs";

const sessions = {
  main: { id: "main" },
  child: { id: "child", parentID: "main", title: "Worker" },
  nested: { id: "nested", parentID: "child", title: "Nested" },
  idle: { id: "idle", parentID: "main", title: "Done" },
  archived: { id: "archived", parentID: "main", time: { archived: 1 } },
  other: { id: "other", title: "Unrelated" },
};
const get = (id) => sessions[id];
const status = (id) => ["child", "nested"].includes(id) ? "running" : "idle";

test("subagents are deduplicated descendants, running first; idle workers remain inspectable", () => {
  const rows = subagents("main", [...Object.keys(sessions), "child", "missing"], get, status);
  assert.deepEqual(rows.map((row) => row.id), ["nested", "child", "idle"]);
  assert.equal(rows.filter((row) => row.status === "running").length, 2);
  assert.deepEqual(subagents("child", Object.keys(sessions), get, status).map((row) => row.id), ["nested"]);
  assert.deepEqual(subagents(undefined, Object.keys(sessions), get, status), []);
});

test("ancestry checks terminate for missing and cyclic sessions", () => {
  assert.equal(isDescendant("nested", "main", get), true);
  assert.equal(isDescendant("other", "main", get), false);
  assert.equal(isDescendant("missing", "main", get), false);
  assert.equal(isDescendant("loop", "main", () => ({ parentID: "loop" })), false);
});

test("shell counters only include running shells owned by this session", () => {
  const list = [
    { id: "new", status: "running", metadata: { sessionID: "main" }, time: { started: 2 } },
    { id: "old", status: "running", metadata: { sessionID: "main" }, time: { started: 1 } },
    ...["exited", "killed", "timeout"].map((status) => ({ id: status, status, metadata: { sessionID: "main" } })),
    { id: "other", status: "running", metadata: { sessionID: "other" } },
    { id: "unowned", status: "running" },
  ];
  assert.deepEqual(shells("main", list).map((shell) => shell.id), ["old", "new"]);
  assert.deepEqual(shells(undefined, list), []);
});

test("hover cards stay inside narrow and short terminals and above footer anchors", () => {
  for (const [width, height] of [[120, 30], [30, 8], [10, 3]]) {
    const card = cardPlacement({ x: width - 2, y: height - 1 }, width, height, 100);
    assert.ok(card.left >= 0 && card.top >= 0);
    assert.ok(card.left + card.width <= width);
    assert.ok(card.top + card.height <= height);
  }
  assert.equal(cardPlacement({ x: 10, y: 20 }, 120, 30, 2).top, 14);
});
