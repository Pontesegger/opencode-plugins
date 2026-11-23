/** User preferences apply to invocable IDs across locations without reading files. */
export function visibleSkills(skills, hiddenIDs = {}, showAll = false) {
  return skills.filter((skill) => showAll || hiddenIDs[skill.id] !== true);
}
