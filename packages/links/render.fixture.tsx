import assert from "node:assert/strict";
import { testRender, useRenderer } from "@opentui/solid";
import { RGBA } from "@opentui/core";
import { createSignal, onCleanup, Show } from "solid-js";
import plugin from "./tui";

const [sessionID, setSessionID] = createSignal("first");
const [enabled, setEnabled] = createSignal(true);
const values = new Map<string, { url: string; label: string; description?: string }[]>([["first", []], ["second", [{ url: "https://other.example/", label: "Other session" }]]]);
const listeners = new Set<(event: any) => void>();
const reconnects = new Set<(event: any) => void>();
const calls: { sessionID: string; location: unknown; signal: AbortSignal }[] = [];
const delayed: { sessionID: string; resolve: (value: any) => void }[] = [];
let delay = false;
let fail = false;
let unregisters = 0;

function HostSlot() {
  let slot;
  const unregister = plugin.setup({
    renderer: useRenderer(),
    client: { rpc: () => ({
      list: ({ sessionID }, options) => {
        calls.push({ sessionID, ...options });
        if (fail) return Promise.reject(new Error("Offline"));
        if (delay) return new Promise((resolve) => delayed.push({ sessionID, resolve }));
        return Promise.resolve(values.get(sessionID) ?? []);
      },
      events: { on: (name, callback) => {
        assert.equal(name, "updated");
        listeners.add(callback); return () => listeners.delete(callback);
      } },
    }) },
    data: {
      session: { get: (id) => ({ location: { directory: `/project/${id}` } }) },
      listen: (callback) => { reconnects.add(callback); return () => reconnects.delete(callback); },
    },
    theme: {
      text: { base: RGBA.fromHex("#ffffff"), muted: RGBA.fromHex("#888888") },
      border: { base: RGBA.fromHex("#888888") },
      background: { raised: { base: RGBA.fromHex("#222222") } },
    },
    ui: { slot: (definition) => {
      assert.equal(definition.after, "sidebar.content", "Links follows all sidebar content, including Skills, regardless of load order");
      slot = definition; return () => { unregisters++; };
    } },
  });
  onCleanup(unregister);
  return slot.render({ get sessionID() { return sessionID(); } });
}

const setup = await testRender(() => (
  <box width="100%" height="100%" flexDirection="row">
    <box width={64}><text>Main transcript</text></box>
    <box width={36} flexDirection="column">
      <text>EXISTING SIDEBAR</text>
      <text>@ Skills</text>
      <text>Example skill</text>
      <Show when={enabled()}><HostSlot /></Show>
      <text>SIDEBAR END</text>
    </box>
  </box>
), { width: 100, height: 24 });

async function frame() {
  await setup.renderOnce();
  await new Promise((resolve) => setImmediate(resolve));
  await setup.renderOnce();
  return setup.captureCharFrame();
}
const emit = (id: string) => { for (const listener of listeners) listener({ data: { sessionID: id } }); };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const findText = (node, text) => node.plainText === text ? node
  : node.getChildren().map((child) => findText(child, text)).find(Boolean);

try {
  let output = await frame();
  assert.ok(output.includes("EXISTING SIDEBAR") && !output.includes("Links"), "An empty session has no Links heading or placeholder");
  assert.equal(findText(setup.renderer.root, "SIDEBAR END").y,
    findText(setup.renderer.root, "Example skill").y + 1,
    "An empty Links section takes no space or margin");
  assert.deepEqual(calls[0].location, { directory: "/project/first" }, "RPC uses the session's location");
  const before = calls.length;
  emit("second");
  await frame();
  assert.equal(calls.length, before, "Other sessions' events are ignored");

  values.set("first", [{ url: "https://example.com/docs", label: "Plugin docs", description: "Detailed plugin reference." }, { url: "http://localhost:3000/", label: "Preview" }]);
  emit("first");
  output = await frame();
  assert.ok(output.includes("Plugin docs") && output.includes("Preview"), `Live update: ${JSON.stringify(output)}`);
  assert.ok(output.indexOf("Links") > output.indexOf("Example skill"), "Links appears below Skills");
  const lines = output.split("\n");
  const row = lines.findIndex((line) => line.includes("Plugin docs"));
  assert.equal(setup.renderer.getLinkAt(lines[row].indexOf("Plugin docs"), row), "https://example.com/docs",
    "The short label retains the complete native hyperlink target");
  assert.ok(!output.includes("https://example.com"), "Long URLs do not clutter the sidebar");
  const label = findText(setup.renderer.root, "Plugin docs");
  assert.deepEqual(label.fg, RGBA.fromHex("#888888"), "Link labels use the theme's muted gray");
  assert.deepEqual(label.textNode.toChunks()[0].fg, RGBA.fromHex("#888888"), "Native hyperlinks inherit the gray color");
  const column = lines[row].indexOf("Plugin docs");
  await setup.mockMouse.moveTo(column + 2, row);
  await wait(300);
  output = await frame();
  assert.ok(output.includes("Detailed plugin reference.") && output.includes("https://example.com/docs"), "Hover shows the description and full URL");
  assert.ok(output.includes("Main transcript") && output.includes("EXISTING SIDEBAR"), "Hover does not change application layout");
  const details = output.split("\n");
  const detailRow = details.findIndex((line) => line.includes("Detailed plugin reference."));
  await setup.mockMouse.moveTo(details[detailRow].indexOf("Detailed plugin reference."), detailRow);
  await wait(200);
  output = await frame();
  assert.ok(output.includes("Detailed plugin reference."), "Card remains open while the pointer is over it");
  await setup.mockMouse.moveTo(0, 0);
  await wait(200);
  output = await frame();
  assert.ok(!output.includes("Detailed plugin reference."), "Hover card dismisses when the pointer leaves");

  const previewRow = lines.findIndex((line) => line.includes("Preview"));
  await setup.mockMouse.moveTo(column + 2, previewRow);
  await wait(300);
  output = await frame();
  assert.ok(output.includes("http://localhost:3000/"), "Existing links without descriptions still show their full URL");

  setSessionID("second");
  output = await frame();
  assert.ok(output.includes("Other session") && !output.includes("Plugin docs"), `Session switch: ${JSON.stringify(output)}`);
  assert.ok(!output.includes("http://localhost:3000/"), "Switching sessions dismisses the previous hover card");
  const secondRow = output.split("\n").findIndex((line) => line.includes("Other session"));
  await setup.mockMouse.moveTo(column + 2, secondRow);
  await wait(300);
  output = await frame();
  assert.ok(output.includes("https://other.example/"));
  setup.renderer.emit("blur");
  output = await frame();
  assert.ok(!output.includes("https://other.example/"), "Losing terminal focus dismisses the hover card");

  // Resolve the previous session after the current one: stale replies must not leak.
  delay = true;
  setSessionID("first");
  output = await frame();
  assert.ok(!output.includes("Links"), "The section stays hidden while the new session's links load");
  setSessionID("second");
  await frame();
  assert.equal(delayed.length, 2);
  delayed[1].resolve([{ url: "https://other.example/new", label: "Current result" }]);
  output = await frame();
  assert.ok(output.includes("Current result"), `Current reply: ${JSON.stringify(output)}`);
  delayed[0].resolve([{ url: "https://example.com/old", label: "Stale result" }]);
  output = await frame();
  assert.ok(output.includes("Current result") && !output.includes("Stale result"), `Stale reply: ${JSON.stringify(output)}`);

  delay = false;
  fail = true;
  setSessionID("empty");
  output = await frame();
  assert.ok(!output.includes("Links") && !output.includes("Current result"), "An empty failed load renders no heading or error placeholder");
  fail = false;
  for (const listener of reconnects) listener({ details: { type: "server.connected" } });
  output = await frame();
  assert.ok(!output.includes("Links"), "Reconnect preserves invisibility for sessions with no links");
  values.set("empty", [{ url: "https://example.com/first", label: "First link" }]);
  emit("empty");
  output = await frame();
  assert.ok(output.includes("Links") && output.includes("First link"), "The first live post makes Links appear without a session switch");
  values.set("empty", []);
  emit("empty");
  output = await frame();
  assert.ok(!output.includes("Links"), "Returning to zero links removes the whole section");

  delay = true;
  emit("empty");
  await frame();
  setEnabled(false);
  output = await frame();
  assert.ok(!output.includes("Links") && output.includes("EXISTING SIDEBAR"));
  assert.equal(listeners.size, 0);
  assert.equal(reconnects.size, 0);
  assert.equal(unregisters, 1);
  assert.ok(calls.at(-1).signal.aborted);
  delayed.at(-1)!.resolve([{ url: "https://example.com/late", label: "After cleanup" }]);
  await frame();
  delay = false;
  setEnabled(true);
  await frame();
  assert.equal(listeners.size, 1, "Reload creates one subscription, not duplicates");
  setup.renderer.destroy();
  assert.equal(listeners.size, 0);
  assert.equal(reconnects.size, 0);
  console.log("PASS: Links below Skills, no empty heading or spacing, first-post visibility, gray labels, native hyperlinks, detailed hover cards, session isolation, stale request protection, reconnect, and cleanup.");
} finally {
  if (!setup.renderer.isDestroyed) setup.renderer.destroy();
}
