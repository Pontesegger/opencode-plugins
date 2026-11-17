import assert from "node:assert/strict";
import { testRender, useRenderer } from "@opentui/solid";
import { RGBA, type TextareaRenderable } from "@opentui/core";
import plugin from "./tui";

let prompt: TextareaRenderable;
const actions: string[] = [];
const warnings: string[] = [];
let unavailable = false;
function Favorites() {
  let slot;
  const renderer = useRenderer();
  const commands = [
    { id: "host.new", slash: { name: "clear" }, run() { actions.push("clear"); } },
    { id: "host.compaction", slash: { name: "compact" }, run() { actions.push("compact"); } },
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
    <box width={30} height="100%"><Favorites /></box>
  </box>
), { width: 90, height: 20 });

try {
  await setup.renderOnce();
  const lines = setup.captureCharFrame().split("\n");
  assert.ok(lines.some((line) => line.includes("Favorites")));
  const clearRow = lines.findIndex((line) => line.includes("/clear"));
  const compactRow = lines.findIndex((line) => line.includes("/compact"));
  assert.ok(clearRow >= 0 && compactRow === clearRow + 1);
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
  unavailable = true;
  prompt.setText("Keep this draft when the command is unavailable");
  await setup.mockMouse.click(column + 2, clearRow);
  await setup.renderOnce();
  assert.equal(actions.length, 2, "Unavailable command never runs");
  assert.equal(prompt.plainText, "Keep this draft when the command is unavailable");
  assert.equal(warnings.length, 1);
  console.log("PASS: Favorites heading; clear/compact one-click action dispatch without chat submission; draft clearing; focus; right-click and drag ignored; unavailable command preserves draft and warns.");
} finally {
  setup.renderer.destroy();
}
