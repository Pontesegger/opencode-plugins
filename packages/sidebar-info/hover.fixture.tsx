import assert from "node:assert/strict";
import { testRender, useRenderer } from "@opentui/solid";
import { RGBA, type TextareaRenderable } from "@opentui/core";
import { homedir } from "node:os";
import { createSignal, Show } from "solid-js";
import { createStore, produce } from "solid-js/store";
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
  { id: "long", name: "Very long skill name that wraps", path: "skill://long" },
];
const background = RGBA.fromHex("#222222");
const location = { directory: "/home/test/project" };
let prompt: TextareaRenderable;
let submits = 0;
const [sessionID, setSessionID] = createSignal("test");
const [mounted, setMounted] = createSignal(true);
let savedUsage = { lastClicked: {
  global: Date.now() - 24 * 60 * 60 * 1000,
  other: Date.now() - 8 * 24 * 60 * 60 * 1000,
} };
const warnings: string[] = [];
let failWrites = false;

function Skills() {
  let slot;
  plugin.setup({
    renderer: useRenderer(), options: {}, location,
    storage: { store: (key, { initial }) => {
      assert.equal(key, "skill-usage");
      const [state, setState] = createStore(structuredClone(savedUsage ?? initial));
      return [state, async (mutation) => {
        if (failWrites) throw new Error("Disk unavailable");
        setState(produce(mutation));
        savedUsage = JSON.parse(JSON.stringify(state));
      }];
    } },
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
    ui: {
      slot: (definition) => { slot = definition; return () => {}; },
      toast: { show: ({ message }) => { warnings.push(message); } },
    },
  });
  return slot.render({ get sessionID() { return sessionID(); } });
}

const setup = await testRender(() => (
  <box width="100%" height="100%" flexDirection="row">
    <box width={90} height="100%">
      <text>Main transcript</text>
      <textarea ref={(editor) => { prompt = editor; }} width={80} height={3}
        onSubmit={() => { submits++; }} />
    </box>
    <box width={30} height="100%"><Show when={mounted()}><Skills /></Show></box>
  </box>
), { width: 120, height: 30 });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  await setup.renderOnce();
  const lines = setup.captureCharFrame().split("\n");
  assert.ok(lines.some((line) => line.includes("@ Skills")), "Heading starts with an at sign and a space");
  const row = lines.findIndex((line) => line.includes("Alpha"));
  assert.ok(row >= 0, "Skill should be visible before hovering");
  const column = lines[row].indexOf("Alpha");
  const dividerRow = (frame) => frame.split("\n").findIndex((line) => line.includes("─"));
  assert.ok(dividerRow(setup.captureCharFrame()) < row, "Unused skills start below the divider");
  assert.equal(lines[dividerRow(setup.captureCharFrame())].indexOf("─"), column,
    "Divider is indented to match skill names");
  assert.ok(lines.findIndex((line) => line.includes("Global")) < dividerRow(lines.join("\n")),
    "A skill clicked yesterday is preferred on startup");
  assert.ok(lines.findIndex((line) => line.includes("Other")) > dividerRow(lines.join("\n")),
    "A skill clicked more than a week ago is not preferred on startup");
  const findText = (node, text) => node.plainText === text ? node
    : node.getChildren().map((child) => findText(child, text)).find(Boolean);
  const skillRow = findText(setup.renderer.root, "Alpha");
  for (const [name, color] of [["Alpha", blue], ["Builtin", purple], ["Global", muted], ["Other", muted]]) {
    const nameText = findText(setup.renderer.root, name);
    assert.deepEqual(nameText.fg, muted, `${name} uses the same neutral name color`);
    const line = lines.find((line) => line.includes(name));
    const hasDot = name === "Alpha" || name === "Builtin";
    if (hasDot) {
      assert.ok(line.endsWith(" ●  "), `${name} has a source dot followed by two spaces`);
      assert.equal(line.lastIndexOf("●"), 117, "Source dot stays two columns away from the sidebar's right edge");
    } else {
      assert.ok(!line.includes("●"), `${name} has no origin dot`);
    }
    const dot = nameText.parent.getChildren()[1];
    assert.equal(dot.plainText, hasDot ? "●" : " ", "Only repo and built-in skills show origin dots");
    assert.deepEqual(dot.fg, color, `${name} dot uses its hover source color`);
  }
  const longName = findText(setup.renderer.root, "Very long skill name that wraps");
  const longSuffix = longName.parent.getChildren()[1];
  assert.ok(longName.height > 1, "Long skill names wrap within their column");
  assert.ok(longName.x + longName.width < longSuffix.x, "Wrapped names leave a gap before the source");
  assert.equal(longSuffix.x + longSuffix.width, 118, "Long names preserve the two-column gap after the dot");
  await setup.mockMouse.moveTo(column + 2, row);
  await setup.renderOnce();
  assert.deepEqual(skillRow.fg, white, "Skill highlights immediately, before the hover card delay");
  await wait(350);
  await setup.renderOnce();
  const frame = setup.captureCharFrame();
  assert.equal(frame.split("Alpha").length - 1, 2, "Sidebar row and hover title both show the skill name");
  assert.ok(frame.includes("@Alpha"), "Hover title starts with an at sign");
  assert.ok(!frame.includes("/Alpha"), "Sidebar row and hover title do not have a slash prefix");
  assert.ok(frame.includes("A distinctive hover description."), "Hover description should be visible");
  assert.ok(frame.includes("Location: Repo"), "Source scope should be visible");
  const sourceLine = findText(setup.renderer.root, "Location: Repo");
  assert.deepEqual(sourceLine.fg, muted, "Location label stays muted gray");
  assert.deepEqual(sourceLine.textNode.toChunks().find((chunk) => chunk.text === "Repo")?.fg, blue,
    "Location value matches the skill's source color");
  assert.ok(frame.includes("Main transcript"), "Hover must not displace application layout");
  const suffixColumn = lines[row].lastIndexOf("●");
  await setup.mockMouse.moveTo(suffixColumn, row);
  await wait(350);
  await setup.renderOnce();
  assert.deepEqual(skillRow.fg, white, "Hovering the source suffix highlights the skill name too");
  assert.deepEqual(skillRow.parent.getChildren()[1].fg, blue, "Hovering keeps the origin dot's source color");
  assert.ok(setup.captureCharFrame().includes("A distinctive hover description."),
    "Hover details are accessible from the source suffix");

  const cardLines = frame.split("\n");
  const cardRow = cardLines.findIndex((line) => line.includes("Location: Repo"));
  await setup.mockMouse.moveTo(cardLines[cardRow].indexOf("Location: Repo"), cardRow);
  await setup.renderOnce();
  assert.deepEqual(skillRow.fg, muted, "Skill returns to its neutral color when the pointer leaves the row");
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
  await setup.mockMouse.click(suffixColumn, row);
  await wait(50);
  assert.equal(prompt.plainText, "Existing text @alpha ", "Clicking the suffix inserts ID, at sign and one trailing space without replacing existing input");
  assert.equal(submits, 0, "Click must not submit the prompt");
  assert.equal(setup.renderer.currentFocusedEditor, prompt, "Prompt keeps keyboard focus");
  const firstClickedAt = savedUsage.lastClicked.alpha;
  assert.ok(Number.isFinite(firstClickedAt) && Date.now() - firstClickedAt < 1000,
    "Click persists a last-click timestamp in milliseconds");
  await setup.renderOnce();
  const usedFrame = setup.captureCharFrame();
  const usedRow = usedFrame.split("\n").findIndex((line) => line.includes("Alpha"));
  assert.ok(usedRow < dividerRow(usedFrame), "Clicked skill moves above the divider");
  assert.ok(usedFrame.split("\n").findIndex((line) => line.includes("Builtin")) > dividerRow(usedFrame),
    "Unclicked skills stay below the divider");
  assert.equal(usedFrame.split("Alpha").length - 1, 1, "Moved skill is not duplicated");
  await setup.mockMouse.click(column + 2, usedRow, 2);
  await wait(50);
  assert.equal(prompt.plainText, "Existing text @alpha ", "Right-click must not insert anything");

  const builtinRow = usedFrame.split("\n").findIndex((line) => line.includes("Builtin"));
  await setup.mockMouse.click(column + 2, builtinRow, 2);
  await wait(50);
  await setup.renderOnce();
  assert.equal(setup.captureCharFrame(), usedFrame, "Right-click does not promote an unused skill");
  await setup.mockMouse.click(column + 2, builtinRow);
  await wait(50);
  await setup.renderOnce();
  const bothUsed = setup.captureCharFrame().split("\n");
  const alphaRow = bothUsed.findIndex((line) => line.includes("Alpha"));
  const promotedBuiltinRow = bothUsed.findIndex((line) => line.includes("Builtin"));
  assert.ok(alphaRow < promotedBuiltinRow && promotedBuiltinRow < dividerRow(bothUsed.join("\n")),
    "Used skills stay alphabetical above the divider");
  await setup.mockMouse.click(column + 2, alphaRow);
  await wait(50);
  await setup.renderOnce();
  assert.equal(setup.captureCharFrame().split("Alpha").length - 1, 1, "Repeated clicks do not duplicate used skills");
  assert.ok(savedUsage.lastClicked.alpha > firstClickedAt, "Clicking again refreshes the saved timestamp");

  setSessionID("other-session");
  await setup.renderOnce();
  const otherFrame = setup.captureCharFrame();
  assert.ok(otherFrame.split("\n").findIndex((line) => line.includes("Alpha")) < dividerRow(otherFrame),
    "Preferred skills are shared across sessions");
  setSessionID("test");
  await setup.renderOnce();
  const restoredFrame = setup.captureCharFrame();
  assert.ok(restoredFrame.split("\n").findIndex((line) => line.includes("Builtin")) < dividerRow(restoredFrame),
    "Returning to a session keeps shared preferred skills");

  setMounted(false);
  await setup.renderOnce();
  setMounted(true);
  await setup.renderOnce();
  const startupFrame = setup.captureCharFrame();
  assert.ok(startupFrame.split("\n").findIndex((line) => line.includes("Alpha")) < dividerRow(startupFrame),
    "A fresh plugin instance restores recently clicked skills from durable storage");
  assert.ok(startupFrame.split("\n").findIndex((line) => line.includes("Other")) > dividerRow(startupFrame),
    "Expired history stays below the divider after reloading");
  assert.ok(savedUsage.lastClicked.other < Date.now() - 7 * 24 * 60 * 60 * 1000,
    "Old timestamps are retained rather than deleting history");

  failWrites = true;
  const expiredRow = startupFrame.split("\n").findIndex((line) => line.includes("Other"));
  prompt.gotoBufferEnd();
  await setup.mockMouse.moveTo(0, 0);
  await setup.mockMouse.click(column + 2, expiredRow);
  await wait(50);
  assert.ok(prompt.plainText.endsWith("@other "), "A storage failure does not prevent prompt insertion");
  assert.deepEqual(warnings, ["Skill inserted, but its usage could not be saved."],
    "Storage failure reports an accurate warning");
  assert.equal(submits, 0, "Promoting and reusing skills never submits the prompt");
  console.log("PASS: hover and click-to-insert; shared durable usage and refreshed timestamps; startup week filtering; alphabetical groups; right-click ignored; storage failure warning.");
} finally {
  setup.renderer.destroy();
}
