import assert from "node:assert/strict";
import { testRender, useRenderer } from "@opentui/solid";
import { RGBA, type TextareaRenderable } from "@opentui/core";
import plugin from "./tui";
import { createSignal } from "solid-js";

let prompt: TextareaRenderable;
const actions: string[] = [];
const warnings: string[] = [];
let unavailable = false;
const [sidebarWidth, setSidebarWidth] = createSignal(30);
function Favorites() {
  let slot;
  const renderer = useRenderer();
  const commands = [
    { id: "host.new", slash: { name: "clear" }, run() { actions.push("clear"); } },
    { id: "host.compaction", slash: { name: "compact" }, run() { actions.push("compact"); } },
    { id: "command.palette.show", run() { actions.push("palette"); } },
  ];
  plugin.setup({
    renderer,
    theme: { text: { base: RGBA.fromHex("#ffffff"), muted: RGBA.fromHex("#888888") } },
    keymap: { commands: () => unavailable ? [] : commands, dispatch: (id) => {
      if (id === "pane.focus.left") {
        prompt.focus();
      } else if (id === "prompt.clear") prompt.setText("");
      else {
        const command = commands.find((command) => command.id === id);
        assert.ok(command, `Unexpected command: ${id}`);
        command.run();
      }
    } },
    ui: {
      slot: (definition) => { slot = definition; return () => {}; },
      toast: { show: ({ message }) => { warnings.push(message); } },
    },
  });
  return slot.render({ sessionID: "test" });
}

const setup = await testRender(() => (
  <box width="100%" height="100%" flexDirection="row">
    <box width={60} height="100%">
      <textarea ref={(editor) => { prompt = editor; }} width={60} height={3} />
    </box>
    <box width={sidebarWidth()} height="100%"><Favorites /></box>
  </box>
), { width: 90, height: 20 });

try {
  await setup.renderOnce();
  const lines = setup.captureCharFrame().split("\n");
  assert.ok(lines.some((line) => line.includes("Favorites")));
  const clearRow = lines.findIndex((line) => line.includes("/clear"));
  const compactRow = lines.findIndex((line) => line.includes("/compact"));
  const paletteRow = lines.findIndex((line) => line.includes("Show all commands"));
  assert.ok(clearRow >= 0 && compactRow === clearRow + 1);
  assert.equal(paletteRow, compactRow + 2, "Palette link follows compact with exactly one empty line");
  assert.equal(lines[compactRow + 1].trim(), "", "The separator is an empty line");
  assert.equal(lines[paletteRow].indexOf("Show all commands"), lines[clearRow].indexOf("/clear"), "Palette link aligns with the other entries");
  const column = lines[clearRow].indexOf("/clear");
  prompt.setText("Do not send this unfinished draft");
  await setup.mockMouse.click(column + 2, clearRow);
  await setup.renderOnce();
  assert.deepEqual(actions, ["clear"]);
  assert.equal(prompt.plainText, "");
  assert.equal(setup.renderer.currentFocusedEditor, prompt);
  await setup.mockMouse.click(column + 2, compactRow);
  await setup.renderOnce();
  assert.deepEqual(actions, ["clear", "compact"]);
  await setup.mockMouse.click(column + 2, clearRow, 2);
  await setup.renderOnce();
  assert.equal(actions.length, 2, "Right-click never runs commands");
  // Pressing a row then leaving it must not activate on release.
  await setup.mockMouse.pressDown(column + 2, clearRow);
  await setup.mockMouse.moveTo(0, 10);
  await setup.mockMouse.release(0, 10);
  await setup.renderOnce();
  assert.equal(actions.length, 2, "Dragging away never runs commands");
  prompt.setText("Keep this unfinished draft");
  await setup.mockMouse.click(column + 2, paletteRow, 2);
  await setup.renderOnce();
  assert.equal(actions.length, 2, "Right-click never opens the palette");
  await setup.mockMouse.pressDown(column + 2, paletteRow);
  await setup.mockMouse.moveTo(0, 10);
  await setup.mockMouse.release(0, 10);
  await setup.renderOnce();
  assert.equal(actions.length, 2, "Dragging away never opens the palette");
  await setup.mockMouse.click(column + 2, paletteRow);
  await new Promise((resolve) => setImmediate(resolve));
  await setup.renderOnce();
  assert.deepEqual(actions, ["clear", "compact", "palette"], "Palette click dispatches the native Ctrl+P action once");
  assert.equal(prompt.plainText, "Keep this unfinished draft", "Opening the palette preserves the draft");
  await setup.mockMouse.moveTo(0, 10);
  await setup.renderOnce();
  unavailable = true;
  prompt.setText("Keep this draft when the command is unavailable");
  await setup.mockMouse.click(column + 2, clearRow);
  await new Promise((resolve) => setImmediate(resolve));
  await setup.renderOnce();
  assert.equal(actions.length, 3, "Unavailable command never runs");
  assert.equal(prompt.plainText, "Keep this draft when the command is unavailable");
  assert.equal(warnings.length, 1, "Unavailable slash action shows a warning");
  await setup.mockMouse.click(column + 2, paletteRow);
  await new Promise((resolve) => setImmediate(resolve));
  await setup.renderOnce();
  assert.equal(actions.length, 3, "Unavailable palette never runs");
  assert.equal(prompt.plainText, "Keep this draft when the command is unavailable");
  assert.equal(warnings.length, 2);
  assert.match(warnings[1], /Unable to open the command palette/);
  const findText = (node, text) => node.plainText === text ? node
    : node.getChildren().map((child) => findText(child, text)).find(Boolean);
  const icon = findText(setup.renderer.root, "[-]");
  assert.ok(icon, "Expanded header has an ASCII minus control");
  assert.equal(icon.width, 3, "Control occupies three visible columns");
  assert.deepEqual(icon.fg, RGBA.fromHex("#888888"), "Control is gray by default");
  await setup.mockMouse.moveTo(icon.x + 1, icon.y);
  await setup.renderOnce();
  assert.deepEqual(icon.fg, RGBA.fromHex("#ffffff"), "Control turns bright white on hover");
  await setup.mockMouse.moveTo(0, 10);
  await setup.renderOnce();
  assert.deepEqual(icon.fg, RGBA.fromHex("#888888"), "Control returns to gray when the pointer leaves");
  assert.equal(icon.x + icon.width, 89, "One blank column follows the control");
  const heading = findText(setup.renderer.root, "Favorites");
  const originalHeight = heading.parent.parent.height;
  await setup.mockMouse.click(icon.x, icon.y, 2);
  await setup.renderOnce();
  assert.ok(findText(setup.renderer.root, "/clear"), "Right-click does not collapse");
  await setup.mockMouse.pressDown(icon.x, icon.y);
  await setup.mockMouse.moveTo(0, 10);
  await setup.mockMouse.release(0, 10);
  await setup.renderOnce();
  assert.ok(findText(setup.renderer.root, "/clear"), "Dragging off the icon does not collapse");
  await setup.mockMouse.click(icon.x, icon.y);
  await setup.renderOnce();
  assert.ok(findText(setup.renderer.root, "Favorites"), "Collapsed header remains visible");
  assert.ok(findText(setup.renderer.root, "[+]"), "Collapsed header has an ASCII plus control");
  for (const text of ["/clear", "/compact", "Show all commands"]) {
    assert.ok(!findText(setup.renderer.root, text), "Collapse removes every entry and the palette separator");
  }
  assert.equal(heading.parent.parent.height, 1, "Collapsed section occupies only the header line");
  assert.equal(actions.length, 3, "Toggle does not dispatch favorite commands");
  assert.equal(prompt.plainText, "Keep this draft when the command is unavailable", "Toggle preserves the draft");
  setSidebarWidth(24);
  setup.renderer.resize(84, 20);
  await setup.renderOnce();
  const plus = findText(setup.renderer.root, "[+]");
  await setup.mockMouse.moveTo(0, 10);
  await setup.renderOnce();
  assert.deepEqual(plus.fg, RGBA.fromHex("#888888"), "Expand control is gray by default");
  await setup.mockMouse.moveTo(plus.x + 1, plus.y);
  await setup.renderOnce();
  assert.deepEqual(plus.fg, RGBA.fromHex("#ffffff"), "Expand control turns bright white on hover");
  assert.equal(plus.width, 3, "Expand control occupies three visible columns");
  assert.equal(plus.x + plus.width, 83, "Icon keeps its right padding after resize");
  await setup.mockMouse.click(plus.x + 2, plus.y);
  await setup.renderOnce();
  assert.ok(findText(setup.renderer.root, "/clear") && findText(setup.renderer.root, "Show all commands"), "Expand restores all entries");
  assert.equal(heading.parent.parent.height, originalHeight, "Expand restores the original section height");
  console.log("PASS: Favorites dispatch and draft preservation; ASCII collapse/expand controls, right padding and resize, header-only collapse, restored entries, ignored right-clicks/drags.");
} finally {
  setup.renderer.destroy();
}
