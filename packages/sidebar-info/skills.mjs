/** Sort a copy: the reactive host cache must not be mutated. */
export function sortedSkills(skills) {
  return [...skills].sort((left, right) =>
    left.name.localeCompare(right.name, "en", { sensitivity: "base", numeric: true })
    || left.id.localeCompare(right.id, "en"));
}

/** Read legacy single timestamps and retain the three newest uses, newest first. */
export function lastSkillUses(value) {
  return (Array.isArray(value) ? [...value] : [value])
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= 0)
    .sort((left, right) => right - left).slice(0, 3);
}

/** Preserve separate uses even when two clicks have the same timestamp. */
export function recordSkillUse(value, now = Date.now()) {
  return lastSkillUses([...lastSkillUses(value).filter((timestamp) => timestamp <= now), now]);
}

/** Old uses remain stored but stop contributing to the rolling weekly count. */
export function recentSkillUseCount(value, now = Date.now()) {
  const week = 7 * 24 * 60 * 60 * 1000;
  return lastSkillUses(value).filter((timestamp) => timestamp <= now && now - timestamp < week).length;
}

/** Usage intensity colors are independent of the origin indicator's theme colors. */
export function skillUsageColor(count, theme) {
  if (count >= 3) return "#86EFAC";
  if (count === 2) return "#4CAF50";
  if (count === 1) return "#228B22";
  return theme.text.muted;
}

/** Use the invocable ID, not a potentially different frontmatter display name. */
export function skillPromptText(skill) {
  if (typeof skill.id !== "string" || !skill.id || /[\s@#]/.test(skill.id)) {
    throw new Error("Skill ID cannot be completed as a mention");
  }
  return `@${skill.id} `;
}

/** Let native completion own both the visible mention and the draft's skill part. */
export async function insertSkillMention(context, skill, location) {
  const mention = skillPromptText(skill).trimEnd();
  // Named references take priority over skills in OpenCode's @ completion.
  const references = context.data.location.reference.list(location) ?? [];
  if (references.some((reference) => !reference.hidden && reference.name === skill.id.split("/")[0])) {
    throw new Error("A named reference shadows this skill in autocomplete");
  }
  await context.keymap.dispatch("pane.focus.left");
  const editor = context.renderer.currentFocusedEditor;
  if (!editor || editor.isDestroyed || editor.traits?.mode === "shell") {
    throw new Error("Prompt editor is unavailable");
  }
  if (editor.hasSelection()) throw new Error("Clear the text selection before inserting a skill");
  // Reset an existing completion without clearing the draft or its attachments.
  if (context.keymap.commands().some((command) => command.id === "prompt.autocomplete.hide")) {
    await context.keymap.dispatch("prompt.autocomplete.hide");
  }
  const offset = editor.cursorOffset;
  const start = { ...editor.logicalCursor };
  const before = editor.getTextRange(0, offset);
  const after = editor.plainText.slice(before.length);
  const prefix = before && !/\s$/.test(before) ? " " : "";
  const previousMarks = new Set(editor.extmarks.getAll().map((mark) => mark.id));
  const query = prefix + mention;
  editor.insertText(query);
  const queryText = editor.plainText;
  const queryEnd = editor.cursorOffset;
  try {
    // Give reactive input/completion layers a chance to observe the new query.
    await Promise.resolve();
    if (editor.isDestroyed || context.renderer.currentFocusedEditor !== editor
      || editor.plainText !== queryText || editor.cursorOffset !== queryEnd) {
      throw new Error("Prompt changed while selecting the skill");
    }
    const complete = context.keymap.commands().find((command) => command.id === "prompt.autocomplete.complete");
    if (!complete || complete.enabled === false || (typeof complete.enabled === "function" && !complete.enabled())) {
      throw new Error("Skill autocomplete is unavailable");
    }
    await context.keymap.dispatch(complete.id);
    const attached = editor.extmarks.getAtOffset(offset + prefix.length).some((mark) =>
      !previousMarks.has(mark.id) && mark.virtual && editor.getTextRange(mark.start, mark.end) === mention);
    if (!attached) throw new Error("Skill is already selected or native completion could not attach it");
    editor.focus();
  } catch (error) {
    // Remove only our insertion, not the whole draft (which would lose parts).
    // Leave concurrent user edits alone.
    if (!editor.isDestroyed && editor.getTextRange(0, offset) === before
      && editor.plainText.slice(editor.getTextRange(0, editor.cursorOffset).length) === after
      && [query, query + " "].includes(editor.getTextRange(offset, editor.cursorOffset))) {
      const end = editor.logicalCursor;
      editor.deleteRange(start.row, start.col, end.row, end.col);
    }
    throw error;
  }
}

/** Classify registry paths without reading skill contents or the filesystem. */
export function skillScope(path, directory, home) {
  if (!path || /^[a-z][a-z\d+.-]*:/i.test(path)) return path?.startsWith("skill:") ? "Built-in" : "Other";
  const inside = (parent) => parent && (path === parent || path.startsWith(`${parent.replace(/\/$/, "")}/`));
  if ([`${home}/.config/opencode`, `${home}/.claude/skills`, `${home}/.agents/skills`].some(inside)) return "Global";
  // Project skills can live above the session directory in a monorepo.
  for (const marker of ["/.opencode/skills/", "/.claude/skills/", "/.agents/skills/"]) {
    const index = path.indexOf(marker);
    if (index >= 0) {
      const root = path.slice(0, index);
      if (directory === root || directory?.startsWith(`${root}/`)) return "Repo";
    }
  }
  if (inside(directory)) return "Repo";
  return "Other";
}

/** Use theme colors so source distinctions work in both light and dark modes. */
export function skillScopeColor(scope, theme) {
  switch (scope) {
    case "Global": return theme.text.muted;
    case "Built-in": return theme.hue.accent[500];
    case "Repo": return theme.text.feedback.info.base;
    default: return theme.text.muted;
  }
}

/** Place the card beside the sidebar row, clamped to the render region. */
export function tooltipPlacement(x, y, columns, rows) {
  const width = Math.max(1, Math.min(52, columns - 2));
  const height = Math.max(1, Math.min(12, rows - 2));
  const left = x >= width + 1 ? x - width - 1 : x + 2;
  return {
    width,
    height,
    left: Math.max(0, Math.min(left, columns - width)),
    top: Math.max(0, Math.min(y, rows - height)),
  };
}
