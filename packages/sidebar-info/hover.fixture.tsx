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
const darkGreen = RGBA.fromHex("#228B22");
const midGreen = RGBA.fromHex("#4CAF50");
const lightGreen = RGBA.fromHex("#86EFAC");
const skills = [
  skill,
  { id: "builtin", name: "Builtin", path: "skill://builtin" },
  { id: "global", name: "Global", path: `${homedir()}/.config/opencode/skills/global/SKILL.md` },
  { id: "other", name: "Other", path: "/shared/skills/other/SKILL.md" },
  { id: "long", name: "Very long skill name that wraps", path: "skill://long" },
  { id: "hidden", name: "Hidden skill", path: "/shared/skills/hidden/SKILL.md" },
];
const [registeredSkills, setRegisteredSkills] = createSignal(skills);
let hideAlpha = false;
const background = RGBA.fromHex("#222222");
const location = { directory: "/home/test/project" };
let prompt: TextareaRenderable;
let submits = 0;
const selectedSkills: string[] = [];
const skillMarks = new Map<number, string>();
let autocompleteAvailable = true;
const [sessionID, setSessionID] = createSignal("test");
const [mounted, setMounted] = createSignal(true);
let savedUsage: { lastClicked: Record<string, number | number[]> } = { lastClicked: {
  global: Date.now() - 24 * 60 * 60 * 1000,
  other: Date.now() - 8 * 24 * 60 * 60 * 1000,
  builtin: [Date.now() - 1000, Date.now() - 2000],
  long: [Date.now() - 1000, Date.now() - 2000, Date.now() - 3000],
} };
const warnings: string[] = [];
let failWrites = false;

function Skills() {
  let slot;
  plugin.setup({
    renderer: useRenderer(), options: {}, location,
    client: { file: { read: async ({ path, location: requestedLocation }) => {
      assert.deepEqual(requestedLocation, location, "Read metadata from the session's connected server location");
      const hidden = path.includes("/hidden/") || (path === skill.path && hideAlpha);
      return new TextEncoder().encode(`---\nmetadata:\n  hide-in-opencode: ${hidden}\n---\nBody`);
    } } },
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
      location: { skill: { list: () => registeredSkills(), sync: async () => {} }, reference: { list: () => [] } },
    },
    keymap: {
      commands: () => autocompleteAvailable ? [{ id: "prompt.autocomplete.complete", run() {} }] : [],
      dispatch: (command) => {
        if (command === "pane.focus.left") { prompt.focus(); return; }
        assert.equal(command, "prompt.autocomplete.complete", "Skill selection must never dispatch prompt submission");
        const query = prompt.getTextRange(0, prompt.cursorOffset).match(/@([^\s@]+)$/)?.[0];
        assert.ok(query, "Complete the skill before inserting a trailing space");
        const id = query.slice(1);
        assert.ok(skills.some((skill) => skill.id === id));
        // The native host does not attach an already-selected skill twice.
        if (prompt.extmarks.getAll().some((mark) => skillMarks.get(mark.id) === id)) return;
        const start = prompt.cursorOffset - query.length;
        const end = prompt.cursorOffset;
        prompt.insertText(" ");
        const markID = prompt.extmarks.create({ start, end, virtual: true, typeId: 123 });
        skillMarks.set(markID, id);
        selectedSkills.push(id);
      },
    },
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
const originalNow = Date.now;
try {
  await setup.renderOnce();
  const lines = setup.captureCharFrame().split("\n");
  assert.ok(lines.some((line) => line.includes("@ Skills")), "Heading starts with an at sign and a space");
  const row = lines.findIndex((line) => line.includes("Alpha"));
  assert.ok(row >= 0, "Skill should be visible before hovering");
  const column = lines[row].indexOf("Alpha");
  const assertSingleList = () => {
    const frame = setup.captureCharFrame();
    assert.ok(!frame.includes("─"), "There is no divider between skills");
    const names = ["Alpha", "Builtin", "Global", "Other", "Very long"];
    const positions = names.map((name) => frame.indexOf(name));
    assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])),
      "All skills stay in one alphabetical list regardless of usage");
    assert.equal(frame.split("Alpha").length - 1, 1, "Skills are not duplicated");
  };
  assertSingleList();
  assert.ok(!setup.captureCharFrame().includes("Hidden skill"), "True metadata hides the skill row");
  const findText = (node, text) => node.plainText === text ? node
    : node.getChildren().map((child) => findText(child, text)).find(Boolean);
  const skillRow = findText(setup.renderer.root, "Alpha");
  for (const [name, color] of [["Alpha", blue], ["Builtin", purple], ["Global", muted], ["Other", muted]]) {
    const nameText = findText(setup.renderer.root, name);
    const expectedColor = name === "Global" ? darkGreen : name === "Builtin" ? midGreen : muted;
    assert.deepEqual(nameText.fg, expectedColor, `${name} name reflects its weekly usage, independently of origin`);
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
  assert.deepEqual(longName.fg, lightGreen, "Three stored uses show light green on startup");
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
  assert.deepEqual(selectedSkills, ["alpha"], "Click must select the native skill completion, not just insert text");
  const alphaMark = prompt.extmarks.getAtOffset(14).find((mark) => skillMarks.get(mark.id) === "alpha");
  assert.ok(alphaMark, "The native completion owns a structured skill mention on the draft");
  prompt.insertText("Apply this workflow");
  assert.equal(prompt.plainText, "Existing text @alpha Apply this workflow", "Additional instructions can be typed after selecting a skill");
  assert.equal(submits, 0, "Click must not submit the prompt");
  assert.equal(setup.renderer.currentFocusedEditor, prompt, "Prompt keeps keyboard focus");
  const firstClickedAt = savedUsage.lastClicked.alpha[0];
  assert.ok(Number.isFinite(firstClickedAt) && Date.now() - firstClickedAt < 1000,
    "Click persists a last-click timestamp in milliseconds");
  await setup.renderOnce();
  assertSingleList();
  await setup.mockMouse.moveTo(0, 0);
  await setup.renderOnce();
  assert.deepEqual(skillRow.fg, darkGreen, "First click changes the name to dark green");
  const firstHistory = structuredClone(savedUsage.lastClicked.alpha);
  await setup.mockMouse.click(column + 2, row, 2);
  await wait(50);
  assert.equal(prompt.plainText, "Existing text @alpha Apply this workflow", "Right-click must not insert anything");
  assert.deepEqual(savedUsage.lastClicked.alpha, firstHistory, "Right-click does not record usage");

  const builtinRow = lines.findIndex((line) => line.includes("Builtin"));
  const builtinHistory = structuredClone(savedUsage.lastClicked.builtin);
  await setup.mockMouse.click(column + 2, builtinRow, 2);
  await wait(50);
  await setup.renderOnce();
  assert.deepEqual(savedUsage.lastClicked.builtin, builtinHistory, "Right-click does not change existing usage");
  await setup.mockMouse.click(column + 2, builtinRow);
  await wait(50);
  await setup.renderOnce();
  await setup.mockMouse.moveTo(0, 0);
  await setup.renderOnce();
  assert.deepEqual(findText(setup.renderer.root, "Builtin").fg, lightGreen, "Third use changes medium green to light green");
  assert.ok(prompt.extmarks.get(alphaMark.id), "Selecting another skill preserves existing draft attachments");
  assertSingleList();
  prompt.setText("");
  await setup.mockMouse.click(column + 2, row);
  await wait(50);
  await setup.renderOnce();
  await setup.mockMouse.moveTo(0, 0);
  await setup.renderOnce();
  assert.deepEqual(skillRow.fg, midGreen, "Second click changes the name to medium green");
  assert.ok(savedUsage.lastClicked.alpha[0] > firstClickedAt, "Clicking again appends a fresh timestamp");
  for (let count = 3; count <= 4; count++) {
    prompt.setText("");
    await setup.mockMouse.click(column + 2, row);
    await wait(50);
    await setup.mockMouse.moveTo(0, 0);
    await setup.renderOnce();
    assert.deepEqual(skillRow.fg, lightGreen, "Three or more clicks show light green");
    assert.equal(savedUsage.lastClicked.alpha.length, 3, "Only the three most recent timestamps are retained");
    assertSingleList();
  }
  assert.ok(!savedUsage.lastClicked.alpha.includes(firstClickedAt), "A fourth use evicts the oldest timestamp");

  const globalRow = lines.findIndex((line) => line.includes("Global"));
  const legacyGlobal = savedUsage.lastClicked.global;
  await setup.mockMouse.click(column + 2, globalRow);
  await wait(50);
  await setup.mockMouse.moveTo(0, 0);
  await setup.renderOnce();
  assert.deepEqual(findText(setup.renderer.root, "Global").fg, midGreen, "Clicking a legacy single-use skill adds its second use");
  assert.equal(savedUsage.lastClicked.global[1], legacyGlobal, "Legacy timestamp survives the history upgrade");

  setSessionID("other-session");
  await setup.renderOnce();
  assert.deepEqual(findText(setup.renderer.root, "Alpha").fg, lightGreen, "Usage colors are shared across sessions");
  setSessionID("test");
  await setup.renderOnce();
  assert.deepEqual(findText(setup.renderer.root, "Builtin").fg, lightGreen, "Returning to a session keeps shared usage colors");

  setMounted(false);
  await setup.renderOnce();
  setMounted(true);
  await setup.renderOnce();
  const startupFrame = setup.captureCharFrame();
  assert.deepEqual(findText(setup.renderer.root, "Alpha").fg, lightGreen, "A fresh plugin instance restores three uses from durable storage");
  assert.deepEqual(findText(setup.renderer.root, "Other").fg, muted, "Expired usage stays gray after reloading");
  assert.ok(Number(savedUsage.lastClicked.other) < Date.now() - 7 * 24 * 60 * 60 * 1000,
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
  await setup.mockMouse.moveTo(0, 0);
  await setup.renderOnce();
  assert.deepEqual(findText(setup.renderer.root, "Other").fg, muted, "A failed save does not invent a recorded use");
  assert.equal(submits, 0, "Recording usage never submits the prompt");

  failWrites = false;
  const beforeDuplicate = prompt.plainText;
  const beforeFailedSelections = structuredClone(savedUsage);
  await setup.mockMouse.click(column + 2, expiredRow);
  await wait(50);
  assert.equal(prompt.plainText, beforeDuplicate, "Duplicate selection rolls back its raw query");
  assert.deepEqual(savedUsage, beforeFailedSelections, "Duplicate selection does not record a use");
  assert.match(warnings.at(-1), /already selected/);

  autocompleteAvailable = false;
  await setup.mockMouse.click(column + 2, row);
  await wait(50);
  assert.equal(prompt.plainText, beforeDuplicate, "Unavailable native completion leaves no raw mention behind");
  assert.deepEqual(savedUsage, beforeFailedSelections, "Failed completion does not record a use");
  assert.match(warnings.at(-1), /autocomplete is unavailable/);
  assert.equal(submits, 0, "Successful and failed skill selections never submit");
  autocompleteAvailable = true;
  await setup.mockMouse.moveTo(0, 0);
  await setup.renderOnce();

  const historyBeforeAging = structuredClone(savedUsage);
  hideAlpha = true;
  setRegisteredSkills([...skills]);
  await setup.renderOnce();
  assert.ok(!setup.captureCharFrame().includes("Alpha"), "Registry updates re-read visibility metadata");
  assert.deepEqual(savedUsage, historyBeforeAging, "Hiding does not delete usage history");
  hideAlpha = false;
  setRegisteredSkills([...skills]);
  await setup.renderOnce();
  assert.ok(setup.captureCharFrame().includes("Alpha"), "False restores the existing skill display");
  const future = originalNow() + 7 * 24 * 60 * 60 * 1000;
  Date.now = () => future;
  setMounted(false);
  await setup.renderOnce();
  setMounted(true);
  await setup.renderOnce();
  for (const name of ["Alpha", "Builtin", "Global", "Other", "Very long skill name that wraps"]) {
    assert.deepEqual(findText(setup.renderer.root, name).fg, muted, "All usage expires to gray after a week");
  }
  assert.deepEqual(savedUsage, historyBeforeAging, "Aging preserves the stored last three uses");
  assertSingleList();
  console.log("PASS: alphabetical list; weekly usage; durable history; hover cards; native skill completion; editable draft; attachment preservation; no auto-submit; right-click ignored; duplicate/unavailable completion rollback; storage failure warning; weekly expiry.");
} finally {
  Date.now = originalNow;
  setup.renderer.destroy();
}
