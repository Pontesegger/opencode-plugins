import assert from "node:assert/strict";
import { test } from "node:test";
import { insertSkillMention, lastSkillUses, recentSkillUseCount, recordSkillUse, skillPromptText, skillScope, skillScopeColor, skillUsageColor, sortedSkills, tooltipPlacement } from "./skills.mjs";

test("counts only the last three valid uses within the previous seven days", () => {
  const now = 1_800_000_000_000;
  const week = 7 * 24 * 60 * 60 * 1000;
  assert.equal(recentSkillUseCount([now, now - week + 1, now - week], now), 2);
  assert.equal(recentSkillUseCount([now + 1, now - week - 1], now), 0);
  assert.equal(recentSkillUseCount([now, now - 1, now - 2, now - 3], now), 3);
  for (const invalid of [undefined, null, "yesterday", Infinity, NaN, -1]) {
    assert.equal(recentSkillUseCount(invalid, now), 0);
  }
  const history = [now, now - 1, now - 2];
  assert.equal(recentSkillUseCount(history, now + week - 1), 1);
  assert.equal(recentSkillUseCount(history, now + week), 0);
  assert.deepEqual(history, [now, now - 1, now - 2], "Aging does not delete stored timestamps");
});

test("reads legacy timestamps as one use and upgrades them on the next click", () => {
  assert.deepEqual(lastSkillUses(100), [100]);
  assert.equal(recentSkillUseCount(100, 101), 1);
  assert.deepEqual(recordSkillUse(100, 101), [101, 100]);
  assert.deepEqual(recordSkillUse(undefined, 101), [101]);
});

test("retains only the three latest uses without mutating input or deduplicating clicks", () => {
  const history = [100, 300, 200];
  assert.deepEqual(recordSkillUse(history, 400), [400, 300, 200]);
  assert.deepEqual(history, [100, 300, 200]);
  assert.deepEqual(recordSkillUse([100, 100], 100), [100, 100, 100]);
  assert.deepEqual(lastSkillUses([null, "bad", Infinity, -1, 200, 100]), [200, 100]);
  assert.deepEqual(recordSkillUse([500, 300, 200], 400), [400, 300, 200]);
});

test("uses gray for no weekly uses and progressively lighter greens for one to three", () => {
  const theme = { text: { muted: "gray" } };
  assert.equal(skillUsageColor(0, theme), "gray");
  assert.equal(skillUsageColor(1, theme), "#228B22");
  assert.equal(skillUsageColor(2, theme), "#4CAF50");
  assert.equal(skillUsageColor(3, theme), "#86EFAC");
  assert.equal(skillUsageColor(4, theme), "#86EFAC");
});

test("sorts skill display names alphabetically, ignoring case", () => {
  const skills = [
    { id: "report", name: "Report" },
    { id: "alpha", name: "alpha" },
    { id: "opencode", name: "OpenCode" },
  ];
  assert.deepEqual(sortedSkills(skills).map((skill) => skill.id), ["alpha", "opencode", "report"]);
  assert.deepEqual(skills.map((skill) => skill.id), ["report", "alpha", "opencode"]);
});

test("breaks equal-name ties by skill ID", () => {
  assert.deepEqual(sortedSkills([
    { id: "z", name: "Review" }, { id: "a", name: "review" },
  ]).map((skill) => skill.id), ["a", "z"]);
});

test("handles an empty skill list", () => {
  assert.deepEqual(sortedSkills([]), []);
});

test("prompt insertion uses the skill ID with an at sign and exactly one trailing space", () => {
  assert.equal(skillPromptText({ id: "alpha", name: "Alpha Display Name" }), "@alpha ");
  assert.throws(() => skillPromptText({ id: "bad\nname" }));
  assert.throws(() => skillPromptText({ id: "bad\rname" }));
  for (const id of ["", "two words", "name\t", "@alpha", "alpha#1", undefined, 1]) {
    assert.throws(() => skillPromptText({ id }));
  }
});

// Host contract double: only native completion may add a skill part and extmark.
function promptContext({ text = "Existing text ", cursor = text.length, complete = true, attach = true, references = [] } = {}) {
  const calls = [];
  const marks = [];
  const parts = [];
  const editor = {
    plainText: text, cursorOffset: cursor,
    get logicalCursor() { return { row: 0, col: this.cursorOffset }; },
    hasSelection: () => false,
    getTextRange(start, end) { return this.plainText.slice(start, end); },
    insertText(value) {
      this.plainText = this.plainText.slice(0, this.cursorOffset) + value + this.plainText.slice(this.cursorOffset);
      this.cursorOffset += value.length;
    },
    deleteRange(row, start, endRow, end) {
      assert.equal(row, 0); assert.equal(endRow, 0);
      this.plainText = this.plainText.slice(0, start) + this.plainText.slice(end);
      this.cursorOffset = start;
    },
    extmarks: { getAll: () => marks, getAtOffset: (offset) => marks.filter((mark) => mark.start <= offset && offset < mark.end) },
    focus() { calls.push("focus"); },
  };
  const context = {
    renderer: { currentFocusedEditor: undefined },
    data: { location: { reference: { list: () => references } } },
    keymap: {
      commands: () => complete ? [{ id: "prompt.autocomplete.complete" }] : [],
      dispatch(id) {
        calls.push(id);
        if (id === "pane.focus.left") { context.renderer.currentFocusedEditor = editor; return; }
        assert.equal(id, "prompt.autocomplete.complete", "Never submit, queue, or clear the prompt");
        const mention = editor.getTextRange(0, editor.cursorOffset).match(/@([^\s@]+)$/)?.[0];
        assert.equal(mention, "@alpha", "Complete the ID, not its display name, before adding whitespace");
        if (!attach) return;
        const start = editor.cursorOffset - mention.length;
        const end = editor.cursorOffset;
        if (editor.plainText[editor.cursorOffset] !== " ") editor.insertText(" ");
        marks.push({ id: marks.length + 1, start, end, virtual: true });
        parts.push({ id: "alpha", mention: { start, end, text: mention } });
      },
    },
  };
  return { context, editor, calls, parts, marks };
}

test("native skill completion attaches the ID and leaves the draft editable without submitting", async () => {
  const { context, editor, calls, parts } = promptContext();
  await insertSkillMention(context, { id: "alpha", name: "Different display name" });
  assert.equal(editor.plainText, "Existing text @alpha ");
  assert.deepEqual(parts, [{ id: "alpha", mention: { start: 14, end: 20, text: "@alpha" } }]);
  assert.deepEqual(calls, ["pane.focus.left", "prompt.autocomplete.complete", "focus"]);
  editor.insertText("Review this change");
  assert.equal(editor.plainText, "Existing text @alpha Review this change");
});

test("insertion at the cursor separates the mention and preserves following text", async () => {
  for (const [text, cursor, expected] of [
    ["Before after", 6, "Before @alpha after"],
    ["Beforeafter", 6, "Before @alpha after"],
    ["", 0, "@alpha "],
  ]) {
    const { context, editor } = promptContext({ text, cursor });
    await insertSkillMention(context, { id: "alpha" });
    assert.equal(editor.plainText, expected);
  }
});

test("unavailable or ineffective completion rolls back only its insertion", async () => {
  for (const options of [{ complete: false }, { attach: false }]) {
    const { context, editor, parts, marks } = promptContext({ text: "Beforeafter", cursor: 6, ...options });
    const existing = { id: 100, start: 0, end: 6, virtual: true };
    marks.push(existing);
    await assert.rejects(insertSkillMention(context, { id: "alpha" }), /autocomplete is unavailable|could not attach/);
    assert.equal(editor.plainText, "Beforeafter");
    assert.equal(editor.cursorOffset, 6);
    assert.deepEqual(parts, []);
    assert.deepEqual(marks, [existing], "Existing attachment marks are not reset");
  }
});

test("named-reference collisions never attach the wrong kind of reference", async () => {
  const { context, calls, editor } = promptContext({ references: [{ name: "alpha" }] });
  await assert.rejects(insertSkillMention(context, { id: "alpha" }), /shadows/);
  assert.deepEqual(calls, []);
  assert.equal(editor.plainText, "Existing text ");
  const hidden = promptContext({ references: [{ name: "alpha", hidden: true }] });
  await insertSkillMention(hidden.context, { id: "alpha" });
  assert.equal(hidden.parts.length, 1);
});

test("an unavailable editor, shell mode, or active selection never changes the draft", async () => {
  for (const change of [
    (editor) => { editor.isDestroyed = true; },
    (editor) => { editor.traits = { mode: "shell" }; },
    (editor) => { editor.hasSelection = () => true; },
  ]) {
    const { context, editor, calls } = promptContext();
    change(editor);
    await assert.rejects(insertSkillMention(context, { id: "alpha" }), /unavailable|text selection/);
    assert.deepEqual(calls, ["pane.focus.left"]);
    assert.equal(editor.plainText, "Existing text ");
  }
});

test("concurrent editing cancels completion without overwriting the user's changes", async () => {
  const { context, editor, calls } = promptContext();
  const inserting = insertSkillMention(context, { id: "alpha" });
  queueMicrotask(() => { editor.insertText(" more text"); });
  await assert.rejects(inserting, /Prompt changed/);
  assert.ok(editor.plainText.endsWith(" more text"));
  assert.deepEqual(calls, ["pane.focus.left"]);
});

test("distinguishes global, repo, ancestor-repo, built-in, and other skill sources", () => {
  const scope = (path, directory = "/home/test/project/packages/app") => skillScope(path, directory, "/home/test");
  assert.equal(scope("/home/test/.config/opencode/skills/review/SKILL.md"), "Global");
  assert.equal(scope("/home/test/.claude/skills/review/SKILL.md"), "Global");
  assert.equal(scope("/home/test/.agents/skills/review/SKILL.md"), "Global");
  assert.equal(scope("/home/test/project/.opencode/skills/review/SKILL.md"), "Repo");
  assert.equal(scope("/home/test/project/packages/app/custom-skills/review.md"), "Repo");
  assert.equal(scope("skill://opencode"), "Built-in");
  assert.equal(scope("/shared/skills/review.md"), "Other");
  assert.equal(scope("/home/test/project-other/.opencode/skills/review.md"), "Other");
  assert.equal(scope(undefined), "Other");
});

test("assigns distinct theme colors to skill sources and keeps unknown sources muted", () => {
  const theme = {
    text: { muted: "gray", feedback: { info: { base: "blue" }, success: { base: "green" } } },
    hue: { accent: { 500: "purple" } },
  };
  assert.equal(skillScopeColor("Global", theme), "gray");
  assert.equal(skillScopeColor("Built-in", theme), "purple");
  assert.equal(skillScopeColor("Repo", theme), "blue");
  assert.equal(skillScopeColor("Other", theme), "gray");
  assert.equal(skillScopeColor(undefined, theme), "gray");
});

test("places hover cards left of sidebar rows and inside terminal bounds", () => {
  assert.deepEqual(tooltipPlacement(100, 10, 140, 40), { width: 52, height: 12, left: 47, top: 10 });
  assert.deepEqual(tooltipPlacement(100, 39, 140, 40), { width: 52, height: 12, left: 47, top: 28 });
  for (const [columns, rows] of [[30, 8], [1, 1], [80, 24]]) {
    const card = tooltipPlacement(columns - 1, rows - 1, columns, rows);
    assert.ok(card.left >= 0 && card.top >= 0);
    assert.ok(card.left + card.width <= columns);
    assert.ok(card.top + card.height <= rows);
  }
});
