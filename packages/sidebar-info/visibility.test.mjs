import assert from "node:assert/strict";
import { test } from "node:test";
import { hiddenInOpenCode, visibleSkills } from "./visibility.mjs";

const skillFile = (value) => `---\nname: Example\nmetadata:\n  hide-in-opencode: ${value}\n---\nSkill instructions`;

test("only metadata.hide-in-opencode set to boolean true hides a skill", () => {
  assert.equal(hiddenInOpenCode(skillFile("true")), true);
  for (const value of ["false", '"true"', '"false"', "null", "1", "", "yes"]) {
    assert.equal(hiddenInOpenCode(skillFile(value)), false, value);
  }
  for (const source of ["", "Skill instructions", "---\nname: Example\n---\nBody",
    "---\nhide-in-opencode: true\n---\nBody",
    "---\nmetadata: null\n---\nBody",
    "---\nname: Example\n---\nmetadata:\n  hide-in-opencode: true",
    "Text before frontmatter\n" + skillFile("true")]) {
    assert.equal(hiddenInOpenCode(source), false);
  }
});

test("parses YAML rather than matching strings in descriptions or body text", () => {
  assert.equal(hiddenInOpenCode('---\nmetadata: {hide-in-opencode: true}\n---\nBody'), true);
  assert.equal(hiddenInOpenCode(skillFile("true # sidebar only")), true);
  assert.equal(hiddenInOpenCode("\uFEFF" + skillFile("true").replaceAll("\n", "\r\n")), true);
  assert.equal(hiddenInOpenCode("---\ndescription: |\n  metadata:\n    hide-in-opencode: true\n---\nBody"), false);
  assert.equal(hiddenInOpenCode("---\nmetadata: [invalid\n---\nBody"), false);
  assert.equal(hiddenInOpenCode("---\nmetadata:\n  hide-in-opencode: true\n"), false);
});

test("filters registered files, preserving virtual/unreadable skills and the input list", async () => {
  const skills = [
    { id: "hidden", path: "/skills/hidden/SKILL.md" },
    { id: "false", path: "/skills/false/SKILL.md" },
    { id: "missing", path: "/skills/missing.md" },
    { id: "unreadable", path: "/skills/unreadable.md" },
    { id: "builtin", path: "skill://builtin" },
    { id: "no-path" },
    { id: "windows", path: "C:\\skills\\hidden.md" },
  ];
  const original = structuredClone(skills);
  const reads = [];
  const visible = await visibleSkills(skills, async (path) => {
    reads.push(path);
    if (path.includes("unreadable")) throw new Error("Unavailable");
    if (path.includes("missing")) return "---\nname: Missing flag\n---\nBody";
    return skillFile(path.includes("hidden") ? "true" : "false");
  });
  assert.deepEqual(visible.map((skill) => skill.id), ["false", "missing", "unreadable", "builtin", "no-path"]);
  assert.equal(reads.length, 5);
  assert.deepEqual(skills, original, "The host registry is not mutated");
  assert.equal(visible[0], skills[1], "Existing skill objects are preserved");
});

test("re-reading reflects metadata edits and handles all-hidden or empty lists", async () => {
  const skills = [{ id: "example", path: "/skills/example.md" }];
  assert.deepEqual(await visibleSkills(skills, async () => skillFile("true")), []);
  assert.deepEqual(await visibleSkills(skills, async () => skillFile("false")), skills);
  assert.deepEqual(await visibleSkills([], async () => { throw new Error("Must not read"); }), []);
});
