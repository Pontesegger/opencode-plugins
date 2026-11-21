/** User preferences apply to invocable IDs across locations without reading files. */
export function visibleSkills(skills, hiddenIDs = {}) {
  return skills.filter((skill) => hiddenIDs[skill.id] !== true);
}
