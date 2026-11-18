import { parse } from "yaml";

/** Only an explicit YAML boolean hides a skill; body text is not metadata. */
export function hiddenInOpenCode(source) {
  const frontmatter = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/)?.[1];
  if (!frontmatter) return false;
  try {
    return parse(frontmatter, { maxAliasCount: 100, logLevel: "silent" })?.metadata?.["hide-in-opencode"] === true;
  } catch {
    return false;
  }
}

/** Read only registered files through the connected server, not the TUI's disk. */
export async function visibleSkills(skills, read) {
  const hidden = await Promise.all(skills.map(async (skill) => {
    // Built-in and other virtual skills have no frontmatter file to read.
    if (!skill.path || (/^[a-z][a-z\d+.-]*:/i.test(skill.path) && !/^[a-z]:[\\/]/i.test(skill.path))) return false;
    try {
      return hiddenInOpenCode(await read(skill.path));
    } catch {
      // Unreadable/invalid metadata must not remove otherwise usable skills.
      return false;
    }
  }));
  return skills.filter((_skill, index) => !hidden[index]);
}
