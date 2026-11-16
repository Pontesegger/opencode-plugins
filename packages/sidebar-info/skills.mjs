/** Sort a copy: the reactive host cache must not be mutated. */
export function sortedSkills(skills) {
  return [...skills].sort((left, right) =>
    left.name.localeCompare(right.name, "en", { sensitivity: "base", numeric: true })
    || left.id.localeCompare(right.id, "en"));
}

/** Keep used skills above the remaining registry entries, alphabetically in each group. */
export function skillGroups(skills, usedIDs) {
  const used = new Set(usedIDs);
  const sorted = sortedSkills(skills);
  return {
    used: sorted.filter((skill) => used.has(skill.id)),
    available: sorted.filter((skill) => !used.has(skill.id)),
  };
}

/** Persist all history, but prefer only valid clicks from the previous seven days. */
export function recentSkillIDs(lastClicked, now = Date.now()) {
  const week = 7 * 24 * 60 * 60 * 1000;
  return Object.entries(lastClicked).filter(([, timestamp]) =>
    Number.isFinite(timestamp) && timestamp <= now && now - timestamp < week
  ).map(([id]) => id);
}

/** Use the invocable ID, not a potentially different frontmatter display name. */
export function skillPromptText(skill) {
  if (!skill.id || /[\r\n]/.test(skill.id)) throw new Error("Skill ID must be a non-empty single line");
  return `@${skill.id} `;
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
