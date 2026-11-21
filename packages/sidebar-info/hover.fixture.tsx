import assert from "node:assert/strict";
import { testRender, useRenderer } from "@opentui/solid";
import { RGBA, ScrollBoxRenderable, type TextareaRenderable } from "@opentui/core";
import { homedir } from "node:os";
import { createSignal, Show } from "solid-js";
import { createStore, produce } from "solid-js/store";
import plugin from "./tui";

const skill = {
  id: "alpha", name: "Alpha",
  path: "/home/test/project/.opencode/skills/alpha/SKILL.md",
   description: "A distinctive hover description.\n" + Array.from({ length: 20 },
     (_, index) => `Long skill description line ${index + 1}.`).join("\n"),
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
const background = RGBA.fromHex("#222222");
const location = { directory: "/home/test/project" };
let prompt: TextareaRenderable;
let submits = 0;
const selectedSkills: string[] = [];
const skillMarks = new Map<number, string>();
let autocompleteAvailable = true;
const [sessionID, setSessionID] = createSignal("test");
const [mounted, setMounted] = createSignal(true);
const [sidebarWidth, setSidebarWidth] = createSignal(30);
let savedUsage: { lastClicked: Record<string, number | number[]> } = { lastClicked: {
  global: Date.now() - 24 * 60 * 60 * 1000,
  other: Date.now() - 8 * 24 * 60 * 60 * 1000,
  builtin: [Date.now() - 1000, Date.now() - 2000],
  long: [Date.now() - 1000, Date.now() - 2000, Date.now() - 3000],
} };
let savedVisibility = { hiddenIDs: { hidden: true } as Record<string, boolean> };
const warnings: string[] = [];
let failWrites = false;

function Skills() {
  let slot;
  plugin.setup({
    renderer: useRenderer(), options: {}, location,
    client: { file: { read: async () => { throw new Error("Visibility must not read skill files"); } } },
    storage: { store: (key, { initial }) => {
      assert.ok(["skill-usage", "skill-visibility"].includes(key));
      const [state, setState] = createStore(structuredClone((key === "skill-usage" ? savedUsage : savedVisibility) ?? initial));
      return [state, async (mutation) => {
        if (failWrites) throw new Error("Disk unavailable");
        setState(produce(mutation));
        if (key === "skill-usage") savedUsage = JSON.parse(JSON.stringify(state));
        else savedVisibility = JSON.parse(JSON.stringify(state));
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
    <box width={sidebarWidth()} height="100%"><Show when={mounted()}><Skills /></Show></box>
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
   assert.ok(!setup.captureCharFrame().includes("Hidden skill"), "Saved user preference hides the skill row on startup");
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
   const hide = findText(setup.renderer.root, "hide");
   const hoverTitle = findText(setup.renderer.root, "@Alpha");
   assert.ok(hide, "Hover card offers a hide action");
   assert.equal(hide.y, hoverTitle.y, "Hide shares the top title row");
   assert.ok(hide.x > hoverTitle.x, "Hide is in the upper-right corner");
   assert.deepEqual(hide.fg, muted, "Hide text is gray by default");
   await setup.mockMouse.moveTo(hide.x + 1, hide.y);
   await setup.renderOnce();
   assert.deepEqual(hide.fg, white, "Hide text turns bright white on hover");
   await wait(200);
   await setup.renderOnce();
   assert.ok(findText(setup.renderer.root, "hide"), "Hover card stays open over the hide action");
   await setup.mockMouse.click(hide.x + 1, hide.y, 2);
   await setup.renderOnce();
   assert.equal(savedVisibility.hiddenIDs.alpha, undefined, "Right-click cannot hide a skill");
   await setup.mockMouse.pressDown(hide.x + 1, hide.y);
   await setup.mockMouse.moveTo(hoverTitle.x, hoverTitle.y);
   await setup.mockMouse.release(hoverTitle.x, hoverTitle.y);
   await setup.renderOnce();
   assert.equal(savedVisibility.hiddenIDs.alpha, undefined, "Dragging off hide does not hide a skill");
   assert.deepEqual(hide.fg, muted, "Hide returns to gray on mouse leave");
   const findScrollBox = (node): ScrollBoxRenderable | undefined => node instanceof ScrollBoxRenderable ? node
     : node.getChildren().map(findScrollBox).find(Boolean);
   const descriptionScroll = findScrollBox(hoverTitle.parent.parent);
   assert.ok(descriptionScroll, "Long descriptions have a scrollable region");
   const sourceY = sourceLine.y;
   assert.equal(descriptionScroll.y, sourceY + sourceLine.height + 1,
     "Location and one blank line sit above the description's scrollable region");
   await setup.mockMouse.moveTo(descriptionScroll.x + 1, descriptionScroll.y + 1);
   for (let step = 0; step < 8; step++) {
     await setup.mockMouse.scroll(descriptionScroll.x + 1, descriptionScroll.y + 1, "down");
   }
   await setup.renderOnce();
   assert.ok(descriptionScroll.scrollTop > 0, "Mouse wheel scrolls the long description");
   const scrolledFrame = setup.captureCharFrame();
   assert.ok(!scrolledFrame.includes("A distinctive hover description."), "Description contents actually move");
   assert.ok(scrolledFrame.split("\n")[sourceY].includes("Location: Repo"), "Location remains visible at its original row");
   assert.ok(!scrolledFrame.split("\n")[sourceY + 1].includes("Long skill description"), "Blank separator stays above the scrolling text");
   assert.ok(findText(setup.renderer.root, "hide"), "Hide action remains available while scrolling");
   descriptionScroll.scrollTo(0);
   await setup.renderOnce();
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
   setRegisteredSkills([...skills]);
   await setup.renderOnce();
   assert.ok(!setup.captureCharFrame().includes("Hidden skill"), "Registry updates retain saved hiding preferences");
   assert.deepEqual(savedUsage, historyBeforeAging, "Visibility refresh does not delete usage history");
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
  const icon = findText(setup.renderer.root, "[-]");
  assert.ok(icon, "Skills header starts expanded with an ASCII minus control");
  assert.equal(icon.width, 3, "Control occupies three visible columns");
  assert.deepEqual(icon.fg, muted, "Control is gray by default");
  await setup.mockMouse.moveTo(icon.x + 1, icon.y);
  await setup.renderOnce();
  assert.deepEqual(icon.fg, white, "Control turns bright white on hover");
  await setup.mockMouse.moveTo(0, 0);
  await setup.renderOnce();
  assert.deepEqual(icon.fg, muted, "Control returns to gray when the pointer leaves");
  assert.equal(icon.x + icon.width, 119, "Icon leaves one blank column at the right edge");
  const header = findText(setup.renderer.root, "@ Skills");
  for (const [label, x] of [["title", header.x + 2], ["empty space", icon.x - 2], ["right padding", icon.x + icon.width]] as const) {
    await setup.mockMouse.moveTo(x, header.y);
    await setup.renderOnce();
    assert.deepEqual(icon.fg, white, `Hovering the ${label} highlights the toggle`);
    await setup.mockMouse.click(x, header.y, 2);
    await setup.renderOnce();
    assertSingleList();
    await setup.mockMouse.pressDown(x, header.y);
    await setup.mockMouse.moveTo(0, 0);
    await setup.mockMouse.release(0, 0);
    await setup.renderOnce();
    assertSingleList();
    await setup.mockMouse.pressDown(0, 0);
    await setup.mockMouse.moveTo(x, header.y);
    await setup.mockMouse.release(x, header.y);
    await setup.renderOnce();
    assertSingleList();
    await setup.mockMouse.click(x, header.y);
    await setup.renderOnce();
    assert.ok(findText(setup.renderer.root, "[+]") && !findText(setup.renderer.root, "Alpha"), `Clicking the ${label} collapses exactly once`);
    await setup.mockMouse.click(x, header.y, 2);
    await setup.renderOnce();
    assert.ok(findText(setup.renderer.root, "[+]"), `Right-clicking the ${label} does not expand`);
    await setup.mockMouse.click(x, header.y);
    await setup.renderOnce();
    assertSingleList();
  }
  await setup.mockMouse.click(icon.x, icon.y, 2);
  await setup.renderOnce();
  assertSingleList();
  await setup.mockMouse.pressDown(icon.x, icon.y);
  await setup.mockMouse.moveTo(0, 0);
  await setup.mockMouse.release(0, 0);
  await setup.renderOnce();
  assertSingleList();
  const alpha = findText(setup.renderer.root, "Alpha");
  await setup.mockMouse.moveTo(alpha.x, alpha.y);
  await wait(350);
  await setup.renderOnce();
  assert.ok(setup.captureCharFrame().includes("A distinctive hover description."));
  const draft = prompt.plainText;
  const selections = selectedSkills.length;
  await setup.mockMouse.click(icon.x, icon.y);
  await wait(350);
  await setup.renderOnce();
  assert.ok(findText(setup.renderer.root, "@ Skills"), "Collapse preserves the header");
  assert.ok(findText(setup.renderer.root, "[+]"), "Collapsed header has an ASCII plus control");
  assert.ok(!findText(setup.renderer.root, "Alpha") && !findText(setup.renderer.root, "Builtin"), "Collapse removes all skill rows");
  assert.ok(!setup.captureCharFrame().includes("A distinctive hover description."), "Collapse dismisses hover cards and pending timers");
  assert.equal(findText(setup.renderer.root, "@ Skills").parent.parent.height, 1, "Only the header line remains");
  setRegisteredSkills([]);
  await setup.renderOnce();
  assert.ok(!setup.captureCharFrame().includes("No skills available"), "Collapsed state also hides empty/loading messages");
  setRegisteredSkills([...skills]);
  setSessionID("collapsed-session");
  await setup.renderOnce();
  assert.ok(!findText(setup.renderer.root, "Alpha"), "Data updates and session switches do not expand the section");
  setSidebarWidth(24);
  setup.renderer.resize(114, 30);
  await setup.renderOnce();
  const plus = findText(setup.renderer.root, "[+]");
  await setup.mockMouse.moveTo(0, 0);
  await setup.renderOnce();
  assert.deepEqual(plus.fg, muted, "Expand control is gray by default");
  await setup.mockMouse.moveTo(plus.x + 1, plus.y);
  await setup.renderOnce();
  assert.deepEqual(plus.fg, white, "Expand control turns bright white on hover");
  assert.equal(plus.width, 3, "Expand control occupies three visible columns");
  assert.equal(plus.x + plus.width, 113, "Icon remains one column from the edge after resize");
  await setup.mockMouse.click(plus.x + 2, plus.y);
  await setup.renderOnce();
  assertSingleList();
  assert.equal(prompt.plainText, draft, "Toggle does not modify the prompt");
  assert.equal(selectedSkills.length, selections, "Toggle does not select skills");
   assert.deepEqual(savedUsage, historyBeforeAging, "Collapse/expand preserves usage history");
   const openAlphaCard = async () => {
     await setup.mockMouse.moveTo(0, 0);
     await setup.renderOnce();
     const row = findText(setup.renderer.root, "Alpha");
     await setup.mockMouse.moveTo(row.x, row.y);
     await wait(350);
     await setup.renderOnce();
     const action = findText(setup.renderer.root, "hide");
     assert.ok(action, "Hide is accessible after resize");
     return action;
   };
   failWrites = true;
   const failedHide = await openAlphaCard();
   await setup.mockMouse.click(failedHide.x + 1, failedHide.y);
   await wait(50);
   await setup.renderOnce();
   assert.equal(savedVisibility.hiddenIDs.alpha, undefined, "Failed storage does not persist hiding");
   assert.ok(findText(setup.renderer.root, "Alpha"), "Failed storage leaves the skill visible");
   assert.match(warnings.at(-1), /Unable to save the hidden skill preference/);
   failWrites = false;
   const action = await openAlphaCard();
   await setup.mockMouse.click(action.x + 1, action.y);
   await wait(50);
   await setup.renderOnce();
   assert.equal(savedVisibility.hiddenIDs.alpha, true, "Left-click persists the hidden skill ID");
   assert.ok(!findText(setup.renderer.root, "Alpha"), "Hiding immediately removes the sidebar row");
   assert.ok(!findText(setup.renderer.root, "hide"), "Hiding dismisses the hover card");
   assert.equal(prompt.plainText, draft, "Hiding does not modify the draft");
   assert.equal(selectedSkills.length, selections, "Hiding does not invoke or select the skill");
   assert.equal(submits, 0, "Hiding never submits the prompt");
   assert.deepEqual(savedUsage, historyBeforeAging, "Hiding retains usage history");
   setSessionID("hidden-session");
   setRegisteredSkills([...skills]);
   await setup.renderOnce();
   assert.ok(!findText(setup.renderer.root, "Alpha"), "Hiding survives session and registry changes");
   setMounted(false);
   await setup.renderOnce();
   setMounted(true);
   await setup.renderOnce();
   assert.ok(!findText(setup.renderer.root, "Alpha"), "A new plugin instance restores durable visibility preferences");
   assert.ok(findText(setup.renderer.root, "Builtin"), "Other skills remain visible after reload");
   console.log("PASS: Skills hover, insertion, usage, collapse/expand and durable user hiding; hide placement, hover colors, right-click/drag guards, failed saves, reload and session persistence.");
} finally {
  Date.now = originalNow;
  setup.renderer.destroy();
}
