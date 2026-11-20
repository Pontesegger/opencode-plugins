import assert from "node:assert/strict";
import { test } from "node:test";
import { outputLimit, plainOutput, watchOutput } from "./output.mjs";

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function scheduler() {
  const pending = new Map();
  return {
    pending,
    schedule: (callback, delay) => { const id = {}; pending.set(id, { callback, delay }); return id; },
    cancel: (id) => pending.delete(id),
    tick: () => { const [id, timer] = pending.entries().next().value; pending.delete(id); void timer.callback(); },
  };
}
test("control sequences are removed without eating text between OSC links", () => {
  assert.equal(plainOutput("\x1b[31mred\x1b[0m\r\n\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\\x00"), "red\nlink");
});

test("output uses the connected location, tails large logs, follows updates, and remains after exit", async () => {
  const clock = scheduler();
  let text = "x".repeat(outputLimit + 10);
  let status = "running";
  const updates = [];
  const location = { directory: "/test/project" };
  const client = { shell: {
    get: async (input, options) => {
      assert.deepEqual(input, { id: "shell", location }); assert.ok(options.signal);
      return { data: { id: "shell", status, exit: status === "exited" ? 0 : undefined } };
    },
    output: async ({ id, location: at, cursor, limit }, options) => {
      assert.equal(id, "shell"); assert.deepEqual(at, location); assert.ok(options.signal);
      const end = Math.min(text.length, cursor + (limit ?? outputLimit));
      return { data: { output: text.slice(cursor, end), cursor: Math.min(end, text.length), size: text.length } };
    },
  } };
  const stop = watchOutput(client, { id: "shell", status }, location, (update) => updates.push(update), clock.schedule, clock.cancel);
  await flush();
  assert.equal(updates[0].output.length, outputLimit);
  assert.equal(updates[0].truncated, true);
  assert.equal(clock.pending.size, 1);
  text += "\nfinished"; status = "exited";
  clock.tick(); await flush();
  assert.ok(updates.at(-1).output.endsWith("finished"));
  assert.equal(updates.at(-1).shell.exit, 0);
  assert.equal(clock.pending.size, 0, "No polling once exit and final output are read");
  stop();
});

test("closing during a request aborts it, suppresses stale results, and schedules no polling", async () => {
  const clock = scheduler();
  let resolve;
  let signal;
  const updates = [];
  const client = { shell: { get: (_input, options) => {
    signal = options.signal;
    return new Promise((done) => { resolve = done; });
  }, output: () => { throw Error("Must not read output after closing"); } } };
  const stop = watchOutput(client, { id: "shell", status: "running" }, {}, (update) => updates.push(update), clock.schedule, clock.cancel);
  assert.equal(clock.pending.size, 0, "No overlapping request timer");
  stop();
  assert.equal(signal.aborted, true);
  resolve({ data: { status: "running" } }); await flush();
  assert.deepEqual(updates, []);
  assert.equal(clock.pending.size, 0);
});

test("temporary failures retry and closing clears the retry timer", async () => {
  const clock = scheduler();
  const updates = [];
  const client = { shell: { get: async () => { throw Error("Offline"); } } };
  const stop = watchOutput(client, { id: "shell", status: "running" }, {}, (update) => updates.push(update), clock.schedule, clock.cancel);
  await flush();
  assert.match(updates[0].error, /Retrying/);
  assert.equal(clock.pending.size, 1);
  stop(); assert.equal(clock.pending.size, 0);
});
