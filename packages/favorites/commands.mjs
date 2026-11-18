export const favorites = ["clear", "compact"];

/** Open the native Ctrl+P palette without clearing or submitting the draft. */
export async function showAllCommands(context) {
  const action = context.keymap.commands().find((action) => action.id === "command.palette.show");
  if (!action || action.enabled === false || (typeof action.enabled === "function" && !action.enabled())) {
    throw new Error("Command palette is unavailable");
  }
  await context.keymap.dispatch(action.id);
}

export async function submitFavorite(context, command) {
  if (!favorites.includes(command)) throw new Error("Unknown favorite command");
  // Resolve the same reachable slash action used by prompt completion. Submitting
  // literal slash text is not equivalent to selecting a completion item.
  await context.keymap.dispatch("pane.focus.left");
  const action = context.keymap.commands().find((action) =>
    action.id && (action.slash?.name === command || action.slash?.aliases?.includes(command))
  );
  if (!action || action.enabled === false || (typeof action.enabled === "function" && !action.enabled())) {
    throw new Error("Favorite command is unavailable");
  }
  // Like completion, commands accepting arguments stay in the prompt for editing.
  // Validate the editor before clearing an existing draft.
  const editor = action.slash.arguments ? context.renderer.currentFocusedEditor : undefined;
  if (action.slash.arguments && (!editor || editor.isDestroyed)) {
    throw new Error("Prompt editor is unavailable");
  }
  await context.keymap.dispatch("prompt.clear");
  if (editor) {
    editor.setText(`/${command} `);
    editor.focus();
    return;
  }
  await context.keymap.dispatch(action.id);
}
