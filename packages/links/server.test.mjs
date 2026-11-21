import assert from "node:assert/strict";
import { test } from "node:test";
import plugin from "./server.ts";

test("server registers a session-scoped tool, read-only RPC, proactive instructions, and cleanup", async () => {
  const values = new Map();
  const tools = [];
  const events = [];
  const disposed = [];
  let methods, hook, namespace;
  let notifyFails = false;
  const registration = (name) => ({ dispose: async () => { disposed.push(name); } });
  const context = {
    storage: {
      get: async (key) => values.get(key),
      set: async (key, value) => { values.set(key, value); },
    },
    rpc: { register: async (_contract, implementation) => {
      methods = implementation;
      return { ...registration("rpc"), events: { emit: async (name, data) => {
        if (notifyFails) throw new Error("Disconnected");
        events.push({ name, data });
      } } };
    } },
    tool: { transform: async (callback) => {
      callback({ namespace: (value) => { namespace = value; }, add: (value) => tools.push(value) });
      return registration("tools");
    } },
    session: { hook: async (name, callback) => {
      assert.equal(name, "context"); hook = callback; return registration("hook");
    } },
  };
  const cleanup = await plugin.setup(context);
  assert.equal(namespace.name, "links");
  assert.equal(tools.length, 1);
  const tool = tools[0];
  assert.equal(tool.name, "post");
  assert.deepEqual(tool.options, { namespace: "links", codemode: false });
  assert.deepEqual(tool.input.required, ["url", "label"]);
  assert.equal(tool.input.properties.label.maxLength, 30);
  assert.equal(tool.input.properties.description.maxLength, 1000);
  assert.equal(tool.input.properties.sessionID, undefined, "The model cannot redirect a post to another session");
  const result = await tool.execute({ url: "https://example.com", label: "Docs" }, { sessionID: "current" });
  assert.match(result.content, /Posted to Links: Docs/);
  assert.deepEqual(await methods.list({ sessionID: "current" }), [{ url: "https://example.com/", label: "Docs" }]);
  assert.deepEqual(await methods.list({ sessionID: "other" }), []);
  assert.deepEqual(events, [{ name: "updated", data: { sessionID: "current" } }]);
  await assert.rejects(tool.execute({ url: "javascript:alert(1)", label: "Unsafe" }, { sessionID: "current" }));
  assert.equal(events.length, 1, "Invalid posts never emit an update");
  notifyFails = true;
  await tool.execute({ url: "https://example.com/second", label: "Second", description: "More detail on the second link" }, { sessionID: "current" });
  assert.equal((await methods.list({ sessionID: "current" })).length, 2);
  assert.equal((await methods.list({ sessionID: "current" }))[0].description, "More detail on the second link");
  const event = { system: [{ type: "text", text: "Original instructions" }] };
  hook(event);
  assert.equal(event.system[0].text, "Original instructions");
  assert.match(event.system[1].text, /proactively post it with links_post/);
  await cleanup();
  assert.deepEqual(disposed, ["hook", "tools", "rpc"]);
});
