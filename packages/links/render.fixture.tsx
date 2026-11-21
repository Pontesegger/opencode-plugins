import assert from "node:assert/strict";
import { testRender, useRenderer } from "@opentui/solid";
import { RGBA, TextAttributes } from "@opentui/core";
import { createSignal, onCleanup, Show } from "solid-js";
import plugin from "./tui";

const [sessionID, setSessionID] = createSignal("first");
const [enabled, setEnabled] = createSignal(true);
const [sidebarWidth, setSidebarWidth] = createSignal(36);
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
    <box width={sidebarWidth()} flexDirection="column">
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
  assert.equal(label.textNode.toChunks()[0].attributes & TextAttributes.UNDERLINE, 0, "Idle labels are not underlined");
  const column = lines[row].indexOf("Plugin docs");
  await setup.mockMouse.moveTo(column + 2, row);
  output = await frame();
  assert.deepEqual(label.fg, RGBA.fromHex("#7dd3fc"), "Hover immediately highlights the label in readable light blue");
  assert.equal(label.textNode.toChunks()[0].attributes & TextAttributes.UNDERLINE, TextAttributes.UNDERLINE,
    "Hover underlines the native hyperlink before the card opens");
  assert.equal(setup.renderer.getLinkAt(column, row), "https://example.com/docs", "Hover styling preserves the clickable URL");
  assert.deepEqual(findText(setup.renderer.root, "Preview").fg, RGBA.fromHex("#888888"), "Other links remain gray");
  assert.ok(!output.includes("Detailed plugin reference."), "Highlight does not wait for the hover card");
  await wait(300);
  output = await frame();
  assert.ok(output.includes("Detailed plugin reference.") && output.includes("https://example.com/docs"), "Hover shows the description and full URL");
  const fullURL = findText(setup.renderer.root, "https://example.com/docs");
  assert.deepEqual(fullURL.fg, RGBA.fromHex("#7dd3fc"), "The full URL in the hover card uses the same readable light blue");
  assert.deepEqual(fullURL.textNode.toChunks()[0].fg, RGBA.fromHex("#7dd3fc"), "The URL hyperlink inherits the blue color");
  assert.equal(setup.renderer.getLinkAt(fullURL.x, fullURL.y), "https://example.com/docs", "The blue hover-card URL remains clickable");
  assert.ok(output.includes("Main transcript") && output.includes("EXISTING SIDEBAR"), "Hover does not change application layout");
  const details = output.split("\n");
  const detailRow = details.findIndex((line) => line.includes("Detailed plugin reference."));
  await setup.mockMouse.moveTo(details[detailRow].indexOf("Detailed plugin reference."), detailRow);
  await frame();
  assert.deepEqual(label.fg, RGBA.fromHex("#888888"), "Leaving the sidebar row immediately restores muted gray");
  assert.equal(label.textNode.toChunks()[0].attributes & TextAttributes.UNDERLINE, 0, "Underline clears even while the hover card stays open");
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
  const secondLabel = findText(setup.renderer.root, "Other session");
  setup.renderer.emit("blur");
  output = await frame();
  assert.ok(!output.includes("https://other.example/"), "Losing terminal focus dismisses the hover card");
  assert.deepEqual(secondLabel.fg, RGBA.fromHex("#888888"), "Losing focus also clears the blue hover highlight");
  assert.equal(secondLabel.textNode.toChunks()[0].attributes & TextAttributes.UNDERLINE, 0);

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
  values.set("empty", [{ url: "https://example.com/collapse", label: "Collapsible link", description: "Collapse this hover card." }]);
  emit("empty");
  await frame();
  const icon = findText(setup.renderer.root, "[-]");
  assert.ok(icon, "Links starts expanded with an ASCII minus control");
  assert.equal(icon.width, 3, "Control occupies three visible columns");
  assert.deepEqual(icon.fg, RGBA.fromHex("#888888"), "Control is gray by default");
  await setup.mockMouse.moveTo(icon.x + 1, icon.y);
  await frame();
  assert.deepEqual(icon.fg, RGBA.fromHex("#ffffff"), "Control turns bright white on hover");
  await setup.mockMouse.moveTo(0, 0);
  await frame();
  assert.deepEqual(icon.fg, RGBA.fromHex("#888888"), "Control returns to gray when the pointer leaves");
  assert.equal(icon.x + icon.width, 99, "One blank column follows the icon");
  const header = findText(setup.renderer.root, "Links");
  for (const [label, x] of [["title", header.x + 2], ["empty space", icon.x - 2], ["right padding", icon.x + icon.width]] as const) {
    await setup.mockMouse.moveTo(x, header.y);
    await frame();
    assert.deepEqual(icon.fg, RGBA.fromHex("#ffffff"), `Hovering the ${label} highlights the toggle`);
    await setup.mockMouse.click(x, header.y, 2);
    await frame();
    assert.ok(findText(setup.renderer.root, "Collapsible link"), `Right-clicking the ${label} does not collapse`);
    await setup.mockMouse.pressDown(x, header.y);
    await setup.mockMouse.moveTo(0, 0);
    await setup.mockMouse.release(0, 0);
    await frame();
    assert.ok(findText(setup.renderer.root, "Collapsible link"), `Dragging off the ${label} does not collapse`);
    await setup.mockMouse.pressDown(0, 0);
    await setup.mockMouse.moveTo(x, header.y);
    await setup.mockMouse.release(x, header.y);
    await frame();
    assert.ok(findText(setup.renderer.root, "Collapsible link"), `Dragging onto the ${label} does not collapse`);
    await setup.mockMouse.click(x, header.y);
    await frame();
    assert.ok(findText(setup.renderer.root, "[+]") && !findText(setup.renderer.root, "Collapsible link"), `Clicking the ${label} collapses exactly once`);
    await setup.mockMouse.click(x, header.y, 2);
    await frame();
    assert.ok(findText(setup.renderer.root, "[+]"), `Right-clicking the ${label} does not expand`);
    await setup.mockMouse.click(x, header.y);
    await frame();
    assert.ok(findText(setup.renderer.root, "Collapsible link"), `Clicking the ${label} expands again`);
  }
  await setup.mockMouse.click(icon.x, icon.y, 2);
  await frame();
  assert.ok(findText(setup.renderer.root, "Collapsible link"), "Right-click does not collapse Links");
  await setup.mockMouse.pressDown(icon.x, icon.y);
  await setup.mockMouse.moveTo(0, 0);
  await setup.mockMouse.release(0, 0);
  await frame();
  assert.ok(findText(setup.renderer.root, "Collapsible link"), "Dragging off the icon does not collapse");
  const collapsible = findText(setup.renderer.root, "Collapsible link");
  await setup.mockMouse.moveTo(collapsible.x, collapsible.y);
  await wait(300);
  output = await frame();
  assert.ok(output.includes("Collapse this hover card."));
  await setup.mockMouse.click(icon.x, icon.y);
  await wait(300);
  output = await frame();
  const heading = findText(setup.renderer.root, "Links");
  assert.ok(heading && findText(setup.renderer.root, "[+]"), "Collapsed Links keeps its header with an ASCII plus control");
  assert.equal(heading.parent.parent.height, 1, "Collapsed Links occupies only its header line");
  assert.ok(!output.includes("Collapsible link") && !output.includes("Collapse this hover card."), "Collapse removes all rows and hover cards");
  assert.equal(setup.renderer.getLinkAt(collapsible.x, collapsible.y), null, "Hidden links leave no clickable native hyperlink");
  assert.ok(output.includes("Example skill"), "Collapsing Links does not hide the neighboring Skills section");
  values.set("empty", [{ url: "https://example.com/updated", label: "Updated while collapsed" }]);
  emit("empty");
  for (const listener of reconnects) listener({ details: { type: "server.connected" } });
  output = await frame();
  assert.ok(!output.includes("Updated while collapsed"), "Live updates and reconnect do not expand Links");
  setSessionID("second");
  output = await frame();
  assert.ok(findText(setup.renderer.root, "[+]") && !output.includes("Other session"), "Session switches preserve collapsed state");
  setSessionID("empty");
  await frame();
  setSidebarWidth(30);
  setup.renderer.resize(94, 24);
  await frame();
  const plus = findText(setup.renderer.root, "[+]");
  await setup.mockMouse.moveTo(0, 0);
  await frame();
  assert.deepEqual(plus.fg, RGBA.fromHex("#888888"), "Expand control is gray by default");
  await setup.mockMouse.moveTo(plus.x + 1, plus.y);
  await frame();
  assert.deepEqual(plus.fg, RGBA.fromHex("#ffffff"), "Expand control turns bright white on hover");
  assert.equal(plus.width, 3, "Expand control occupies three visible columns");
  assert.equal(plus.x + plus.width, 93, "Icon preserves its right padding after resize");
  await setup.mockMouse.click(plus.x + 2, plus.y);
  output = await frame();
  assert.ok(output.includes("Updated while collapsed"), "Expand shows the latest link data");
  setup.renderer.destroy();
  assert.equal(listeners.size, 0);
  assert.equal(reconnects.size, 0);
  console.log("PASS: Links updates, styling, hyperlinks, session isolation and cleanup; full-row collapse/expand (title, empty space, padding and icon), right padding and resize, hover cleanup, live updates while collapsed.");
} finally {
  if (!setup.renderer.isDestroyed) setup.renderer.destroy();
}
