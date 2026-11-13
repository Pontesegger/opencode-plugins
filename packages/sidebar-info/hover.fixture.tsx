import assert from "node:assert/strict";
import { testRender, useRenderer } from "@opentui/solid";
import { RGBA, type TextareaRenderable } from "@opentui/core";
import { homedir } from "node:os";
import plugin from "./tui";

const skill = {
  id: "alpha", name: "Alpha",
  path: "/home/test/project/.opencode/skills/alpha/SKILL.md",
  description: "A distinctive hover description.",
};
const white = RGBA.fromHex("#ffffff");
const muted = RGBA.fromHex("#888888");
const blue = RGBA.fromHex("#4488ff");
const purple = RGBA.fromHex("#bb66ff");
const green = RGBA.fromHex("#44cc88");
const skills = [
  skill,
  { id: "builtin", name: "Builtin", path: "skill://builtin" },
  { id: "global", name: "Global", path: `${homedir()}/.config/opencode/skills/global/SKILL.md` },
  { id: "other", name: "Other", path: "/shared/skills/other/SKILL.md" },
];
const background = RGBA.fromHex("#222222");
const location = { directory: "/home/test/project" };
let prompt: TextareaRenderable;
let submits = 0;

function Skills() {
  let slot;
  plugin.setup({
    renderer: useRenderer(), options: {}, location,
    theme: {
      text: { base: white, muted, feedback: { info: { base: blue }, success: { base: green } } },
      hue: { accent: { 500: purple } }, border: { base: muted },
      background: { raised: { base: background } },
    },
    data: {
      session: { get: () => ({ location }) },
      location: { skill: { list: () => skills, sync: async () => {} } },
    },
    keymap: { dispatch: (command) => {
      assert.equal(command, "pane.focus.left");
      prompt.focus();
    } },
    ui: { slot: (definition) => { slot = definition; return () => {}; } },
  });
  return slot.render({ sessionID: "test" });
}

const setup = await testRender(() => (
  <box width="100%" height="100%" flexDirection="row">
    <box width={90} height="100%">
      <text>Main transcript</text>
      <textarea ref={(editor) => { prompt = editor; }} width={80} height={3}
        onSubmit={() => { submits++; }} />
    </box>
    <box width={30} height="100%"><Skills /></box>
  </box>
), { width: 120, height: 30 });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  await setup.renderOnce();
  const lines = setup.captureCharFrame().split("\n");
  const row = lines.findIndex((line) => line.includes("/Alpha"));
  assert.ok(row >= 0, "Skill should be visible before hovering");
  const column = lines[row].indexOf("/Alpha");
  const findText = (node, text) => node.plainText === text ? node
    : node.getChildren().map((child) => findText(child, text)).find(Boolean);
  const skillRow = findText(setup.renderer.root, "/Alpha");
  assert.deepEqual(skillRow.fg, blue, "Repository skill starts in the info color");
  assert.deepEqual(findText(setup.renderer.root, "/Builtin").fg, purple, "Built-in skill uses the accent color");
  assert.deepEqual(findText(setup.renderer.root, "/Global").fg, muted, "Global skill uses the original muted gray");
  assert.deepEqual(findText(setup.renderer.root, "/Other").fg, muted, "Unknown source stays muted");
  await setup.mockMouse.moveTo(column + 2, row);
  await setup.renderOnce();
  assert.deepEqual(skillRow.fg, white, "Skill highlights immediately, before the hover card delay");
  await wait(350);
  await setup.renderOnce();
  const frame = setup.captureCharFrame();
  assert.equal(frame.split("/Alpha").length - 1, 2, "Sidebar row and hover title both start with a slash");
  assert.ok(frame.includes("A distinctive hover description."), "Hover description should be visible");
  assert.ok(frame.includes("Location: Repo"), "Source scope should be visible");
  const sourceLine = findText(setup.renderer.root, "Location: Repo");
  assert.deepEqual(sourceLine.fg, muted, "Location label stays muted gray");
  assert.deepEqual(sourceLine.textNode.toChunks().find((chunk) => chunk.text === "Repo")?.fg, blue,
    "Location value matches the skill's source color");
  assert.ok(frame.includes("Main transcript"), "Hover must not displace application layout");

  const cardLines = frame.split("\n");
  const cardRow = cardLines.findIndex((line) => line.includes("Location: Repo"));
  await setup.mockMouse.moveTo(cardLines[cardRow].indexOf("Location: Repo"), cardRow);
  await setup.renderOnce();
  assert.deepEqual(skillRow.fg, blue, "Skill returns to its source color when the pointer leaves the row");
  await wait(200);
  await setup.renderOnce();
  assert.ok(setup.captureCharFrame().includes("A distinctive hover description."), "Card stays open under its pointer");

  await setup.mockMouse.moveTo(0, 0);
  await wait(200);
  await setup.renderOnce();
  assert.ok(!setup.captureCharFrame().includes("A distinctive hover description."), "Card disappears on mouse leave");

  prompt.setText("Existing text ");
  prompt.gotoBufferEnd();
  prompt.focus();
  await setup.mockMouse.click(column + 2, row);
  await wait(50);
  assert.equal(prompt.plainText, "Existing text /alpha ", "Click inserts ID, slash and one trailing space without replacing existing input");
  assert.equal(submits, 0, "Click must not submit the prompt");
  assert.equal(setup.renderer.currentFocusedEditor, prompt, "Prompt keeps keyboard focus");
  await setup.mockMouse.click(column + 2, row, 2);
  await wait(50);
  assert.equal(prompt.plainText, "Existing text /alpha ", "Right-click must not insert anything");
  console.log("PASS: hover visibility and dismissal; left-click inserts /skill-id with one space, preserves input/focus, and does not submit; right-click does nothing.");
} finally {
  setup.renderer.destroy();
}
