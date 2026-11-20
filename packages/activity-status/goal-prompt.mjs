const query = "/goal";
const prefix = `${query} `;
const enabled = (command) => command && command.enabled !== false
  && (typeof command.enabled !== "function" || command.enabled());

/** Select the registered goal through native completion, without submitting or pasting. */
export async function prepareGoalPrompt(context, location, isCurrent = () => true) {
  await context.keymap.dispatch("pane.focus.left");
  const editor = context.renderer.currentFocusedEditor;
  if (!isCurrent()) return;
  if (!editor || editor.isDestroyed || editor.traits?.mode === "shell") {
    throw new Error("Prompt editor is unavailable");
  }
  if (editor.hasSelection()) throw new Error("Clear the text selection before starting a goal");
  const commands = context.keymap.commands();
  const shadow = commands.find((command) => command.slash?.name === "goal" || command.slash?.aliases?.includes("goal"));
  if (shadow && (!enabled(shadow) || !shadow.slash.arguments)) {
    throw new Error("Goal command is unavailable for completion");
  }
  if (!(context.data.location.command.list(location) ?? []).some((command) => command.name === "goal")) {
    throw new Error("Goal command is unavailable");
  }
  if (commands.some((command) => command.id === "prompt.autocomplete.hide")) {
    await context.keymap.dispatch("prompt.autocomplete.hide");
  }
  if (!isCurrent() || editor.isDestroyed || context.renderer.currentFocusedEditor !== editor) return;
  if (editor.plainText.startsWith(prefix)) {
    editor.cursorOffset = prefix.length;
    editor.focus();
    return;
  }
  const before = editor.plainText;
  const cursor = editor.cursorOffset;
  editor.cursorOffset = 0;
  editor.insertText(query);
  const pending = query + before;
  try {
    // Let the reactive autocomplete layer observe the query before selecting it.
    await Promise.resolve();
    if (!isCurrent() || editor.isDestroyed || context.renderer.currentFocusedEditor !== editor
      || editor.plainText !== pending || editor.cursorOffset !== query.length) {
      throw new Error("Prompt changed while selecting the goal command");
    }
    const complete = context.keymap.commands().find((command) => command.id === "prompt.autocomplete.complete");
    if (!enabled(complete)) throw new Error("Goal autocomplete is unavailable");
    await context.keymap.dispatch(complete.id);
    if (!isCurrent() || editor.isDestroyed || context.renderer.currentFocusedEditor !== editor
      || editor.plainText !== prefix + before || editor.cursorOffset !== prefix.length) {
      throw new Error("Native autocomplete could not select the goal command");
    }
    editor.focus();
  } catch (error) {
    // Undo only our prefix if no concurrent edits changed the draft.
    if (!editor.isDestroyed && [pending, prefix + before].includes(editor.plainText)) {
      const length = editor.plainText === pending ? query.length : prefix.length;
      editor.cursorOffset = length;
      const end = editor.logicalCursor;
      editor.deleteRange(0, 0, end.row, end.col);
      editor.cursorOffset = cursor;
    }
    throw error;
  }
}
