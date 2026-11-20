import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareGoalPrompt } from "./goal-prompt.mjs";

function fixture(text = "", options = {}) {
  const calls = [];
  const parts = [{ type: "file", uri: "file:///draft.txt" }];
  const editor = {
    plainText: text, cursorOffset: text.length, isDestroyed: false, traits: {},
    hasSelection: () => options.selection ?? false,
    get logicalCursor() {
      const lines = this.plainText.slice(0, this.cursorOffset).split("\n");
      return { row: lines.length - 1, col: lines.at(-1).length };
    },
    insertText(value) {
      this.plainText = this.plainText.slice(0, this.cursorOffset) + value + this.plainText.slice(this.cursorOffset);
      this.cursorOffset += value.length;
    },
    deleteRange(row, col, endRow, endCol) {
      const lines = this.plainText.split("\n");
      const offset = (r, c) => lines.slice(0, r).reduce((sum, line) => sum + line.length + 1, 0) + c;
      const start = offset(row, col), end = offset(endRow, endCol);
      this.plainText = this.plainText.slice(0, start) + this.plainText.slice(end);
      this.cursorOffset = start;
    },
    focus() { calls.push("focus"); },
    setText() { assert.fail("Do not replace or paste the draft"); },
  };
  const context = {
    renderer: { currentFocusedEditor: editor },
    data: { location: { command: { list: () => options.available === false ? [] : [{ name: "goal" }] } } },
    keymap: {
      commands: () => [
        ...(options.shadow ? [options.shadow] : []),
        { id: "prompt.autocomplete.hide" },
        ...(options.completion === false ? [] : [{ id: "prompt.autocomplete.complete", enabled: options.enabled }]),
      ],
      async dispatch(id) {
        calls.push(id);
        if (id === "prompt.autocomplete.complete") {
          if (options.complete) return options.complete(editor, context);
          assert.equal(editor.plainText.slice(0, editor.cursorOffset), "/goal", "Select the exact native query");
          const end = editor.logicalCursor;
          editor.deleteRange(0, 0, end.row, end.col);
          editor.insertText("/goal ");
        }
      },
    },
  };
  return { context, editor, calls, parts };
}

test("native goal completion leaves a trailing space without executing or submitting", async () => {
  const f = fixture();
  await prepareGoalPrompt(f.context, {});
  assert.equal(f.editor.plainText, "/goal ");
  assert.equal(f.editor.cursorOffset, 6);
  assert.deepEqual(f.calls, ["pane.focus.left", "prompt.autocomplete.hide", "prompt.autocomplete.complete", "focus"]);
});

test("preserves existing multiline/Unicode draft and attachments after the command prefix", async () => {
  const f = fixture("Review café\nthen test");
  const parts = structuredClone(f.parts);
  await prepareGoalPrompt(f.context, {});
  assert.equal(f.editor.plainText, "/goal Review café\nthen test");
  assert.equal(f.editor.cursorOffset, 6);
  assert.deepEqual(f.parts, parts);
});

test("repeated clicks focus the already prepared command without duplicating it", async () => {
  const f = fixture("/goal Improve tests");
  await prepareGoalPrompt(f.context, {});
  assert.equal(f.editor.plainText, "/goal Improve tests");
  assert.equal(f.editor.cursorOffset, 6);
  assert.ok(!f.calls.includes("prompt.autocomplete.complete"));
});

test("missing goal registration and unsafe shadow actions never change the draft", async () => {
  for (const options of [{ available: false },
    { shadow: { slash: { name: "goal" } } },
    { shadow: { slash: { name: "goal", arguments: true }, enabled: false } }]) {
    const f = fixture("Keep my draft", options);
    await assert.rejects(prepareGoalPrompt(f.context, {}), /unavailable/);
    assert.equal(f.editor.plainText, "Keep my draft");
    assert.ok(!f.calls.includes("prompt.autocomplete.complete"));
  }
});

test("unavailable, shell-mode, and selected editors are left alone", async () => {
  for (const kind of ["missing", "destroyed", "shell", "selection"]) {
    const f = fixture("Keep my draft", { selection: kind === "selection" });
    if (kind === "missing") f.context.renderer.currentFocusedEditor = undefined;
    if (kind === "destroyed") f.editor.isDestroyed = true;
    if (kind === "shell") f.editor.traits.mode = "shell";
    await assert.rejects(prepareGoalPrompt(f.context, {}), /unavailable|selection/);
    assert.equal(f.editor.plainText, "Keep my draft");
  }
});

test("unavailable or ineffective completion rolls back only our insertion and restores the cursor", async () => {
  for (const options of [{ completion: false }, { enabled: false }, { enabled: () => false }, { complete() {} },
    { complete() { throw Error("Failed completion"); } }]) {
    const f = fixture("Keep my draft", options);
    f.editor.cursorOffset = 4;
    await assert.rejects(prepareGoalPrompt(f.context, {}), /autocomplete|completion|select/);
    assert.equal(f.editor.plainText, "Keep my draft");
    assert.equal(f.editor.cursorOffset, 4);
  }
});

test("concurrent edits are never overwritten on completion failure", async () => {
  const f = fixture("Draft", { complete(editor) { editor.insertText(" edited"); } });
  await assert.rejects(prepareGoalPrompt(f.context, {}), /select/);
  assert.equal(f.editor.plainText, "/goal editedDraft");
});

test("session/goal changes cancel before modifying or completing the prompt", async () => {
  const f = fixture("Draft");
  await prepareGoalPrompt(f.context, {}, () => false);
  assert.equal(f.editor.plainText, "Draft");
  assert.deepEqual(f.calls, ["pane.focus.left"]);
  let checks = 0;
  await assert.rejects(prepareGoalPrompt(f.context, {}, () => ++checks < 3), /changed/);
  assert.equal(f.editor.plainText, "Draft");
  assert.ok(!f.calls.includes("prompt.autocomplete.complete"));
});
