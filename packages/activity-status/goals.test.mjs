import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeGoal, watchGoal } from "./goals.mjs";

const goal = { id: "goal", objective: "Make plugins consistent", status: "active", rounds: 1, maxRounds: 50, boot: "server", updatedAt: 10 };
const location = { directory: "/test/project" };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function harness(get = async () => goal) {
  let changed;
  let reconnect;
  let stops = 0;
  const updates = [];
  const requests = [];
  const stop = watchGoal({
    get: (input, options) => { requests.push({ input, options }); return get(input, options); },
    events: { on: (name, callback) => { assert.equal(name, "changed"); changed = callback; return () => { stops++; }; } },
  }, "main", location, (value) => updates.push(value), (callback) => { reconnect = callback; return () => { stops++; }; });
  return {
    updates, requests, stop, stops: () => stops,
    event: (value, sessionID = "main", directory = location.directory, created = 10) => changed({ created, location: { directory }, data: { sessionID, goal: value } }),
    reconnect: () => reconnect(),
  };
}

test("validates known goal states and fails closed for malformed values", () => {
  for (const status of ["active", "paused", "complete"]) assert.deepEqual(normalizeGoal({ ...goal, status }), { ...goal, status });
  for (const value of [null, undefined, {}, [], { ...goal, status: "unknown" }, { ...goal, rounds: NaN }, { ...goal, reason: 1 }, { ...goal, stalls: Infinity }]) assert.equal(normalizeGoal(value), null);
  assert.notEqual(normalizeGoal(goal), goal, "Do not retain mutable RPC-owned state");
});

test("reads the exact session/location and updates through active, paused, met, and clear", async () => {
  const h = harness(); await flush();
  assert.deepEqual(h.requests[0].input, { sessionID: "main" });
  assert.deepEqual(h.requests[0].options.location, location);
  assert.ok(h.requests[0].options.signal instanceof AbortSignal);
  assert.equal(h.updates.at(-1).status, "active");
  h.event({ ...goal, status: "paused", reason: "Waiting" });
  assert.equal(h.updates.at(-1).reason, "Waiting");
  h.event({ ...goal, status: "complete", reason: "Met" }, "main", location.directory, 11);
  assert.equal(h.updates.at(-1).status, "complete");
  h.event(null, "main", location.directory, 12);
  assert.equal(h.updates.at(-1), null);
  h.stop(); assert.equal(h.stops(), 2);
});

test("other sessions, locations, and out-of-order events cannot replace the current goal", async () => {
  const h = harness(); await flush();
  const original = h.updates.at(-1);
  h.event({ ...goal, objective: "Other session" }, "other");
  h.event({ ...goal, objective: "Other location" }, "main", "/elsewhere");
  assert.equal(h.updates.at(-1), original);
  h.event(null, "main", location.directory, 20);
  h.event(goal, "main", location.directory, 19);
  assert.equal(h.updates.at(-1), null, "An older event must not revive a cleared goal");
  h.stop();
});

test("events invalidate in-flight reads, including when the goal is cleared", async () => {
  let resolve;
  const h = harness(() => new Promise((done) => { resolve = done; }));
  h.event(null);
  assert.equal(h.requests[0].options.signal.aborted, true);
  resolve(goal); await flush();
  assert.equal(h.updates.at(-1), null);
  h.stop();
});

test("reconnect hides stale state, refreshes, and rejects older read results", async () => {
  const pending = [];
  const h = harness(() => new Promise((done) => pending.push(done)));
  pending.shift()(goal); await flush();
  assert.equal(h.updates.at(-1).status, "active");
  h.reconnect(); assert.equal(h.updates.at(-1), null);
  h.reconnect();
  assert.equal(h.requests[1].options.signal.aborted, true);
  pending.shift()(goal);
  pending.shift()({ ...goal, status: "paused" }); await flush();
  assert.equal(h.updates.at(-1).status, "paused");
  h.stop();
});

test("unavailable RPC or invalid responses stay hidden and recover on reconnect", async () => {
  let fail = true;
  const h = harness(async () => { if (fail) throw { type: "rpc.unavailable" }; return goal; });
  await flush(); assert.equal(h.updates.at(-1), null);
  fail = false; h.reconnect(); await flush();
  assert.equal(h.updates.at(-1).objective, goal.objective);
  h.event({ ...goal, status: "future-status" }); assert.equal(h.updates.at(-1), null);
  h.stop();
});

test("disposal cancels reads and rejects late events/results", async () => {
  let resolve;
  const h = harness(() => new Promise((done) => { resolve = done; }));
  const before = h.updates.length;
  h.stop();
  assert.equal(h.requests[0].options.signal.aborted, true);
  resolve(goal); h.event(goal); h.reconnect(); await flush();
  assert.equal(h.updates.length, before);
  assert.equal(h.requests.length, 1, "A late reconnect cannot issue new reads after disposal");
  assert.equal(h.stops(), 2);
});

test("post-command refresh retains the hover state until authoritative data arrives", async () => {
  const pending = [];
  const h = harness(() => new Promise((done) => pending.push(done)));
  pending.shift()(goal); await flush();
  const before = h.updates.length;
  const refreshed = h.stop.refresh();
  assert.equal(h.updates.length, before, "Refresh must not briefly hide the flag or dismiss its hover");
  pending.shift()({ ...goal, status: "paused" }); await refreshed;
  assert.equal(h.updates.at(-1).status, "paused");
  const late = h.stop.refresh();
  h.event(null);
  pending.shift()(goal); await late;
  assert.equal(h.updates.at(-1), null, "A clear event wins over a stale post-command read");
  h.stop();
  await h.stop.refresh();
  assert.equal(h.requests.length, 3, "Disposed refresh cannot issue a request");
});
