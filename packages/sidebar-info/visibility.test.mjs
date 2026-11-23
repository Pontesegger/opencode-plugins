import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleSkills } from "./visibility.mjs";

test("filters by saved skill ID regardless of name, path or origin", () => {
  const skills = [
    { id: "global", name: "Global", path: "/home/test/.config/opencode/skills/global/SKILL.md" },
    { id: "builtin", name: "Builtin", path: "skill://builtin" },
    { id: "repo", name: "Global", path: "/repo/.opencode/skills/repo/SKILL.md" },
  ];
  const original = structuredClone(skills);
  const hidden = { global: true, builtin: true };
  assert.deepEqual(visibleSkills(skills, hidden), [skills[2]]);
  assert.deepEqual(skills, original, "The registry is not mutated");
  assert.deepEqual(hidden, { global: true, builtin: true }, "Saved preferences are not mutated");
  assert.equal(visibleSkills(skills, hidden)[0], skills[2]);
});

test("only an explicit saved true hides a skill; metadata has no effect", () => {
  const skill = { id: "example", metadata: { "hide-in-opencode": true } };
  for (const value of [false, "true", null, undefined]) {
    assert.deepEqual(visibleSkills([skill], { example: value }), [skill]);
  }
  assert.deepEqual(visibleSkills([skill], { example: true }), []);
  assert.deepEqual(visibleSkills([skill]), [skill]);
});

test("retains preferences for temporarily absent skills and handles empty lists", () => {
  const hidden = { absent: true };
  assert.deepEqual(visibleSkills([], hidden), []);
  assert.deepEqual(visibleSkills([{ id: "absent" }], hidden), []);
  assert.deepEqual(visibleSkills([{ id: "toString" }, { id: "constructor" }], {}),
    [{ id: "toString" }, { id: "constructor" }]);
});

test("show all temporarily bypasses hiding without changing saved preferences", () => {
  const skills = [{ id: "hidden" }, { id: "visible" }];
  const hidden = { hidden: true, absent: true };
  assert.deepEqual(visibleSkills(skills, hidden, true), skills);
  assert.deepEqual(visibleSkills(skills, hidden, false), [skills[1]]);
  assert.deepEqual(hidden, { hidden: true, absent: true });
  assert.deepEqual(visibleSkills([], hidden, true), []);
});
