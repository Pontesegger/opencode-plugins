import assert from "node:assert/strict";
import { test } from "node:test";
import { lastSkillUses, recentSkillUseCount, recordSkillUse, skillPromptText, skillScope, skillScopeColor, skillUsageColor, sortedSkills, tooltipPlacement } from "./skills.mjs";

test("counts only the last three valid uses within the previous seven days", () => {
  const now = 1_800_000_000_000;
  const week = 7 * 24 * 60 * 60 * 1000;
  assert.equal(recentSkillUseCount([now, now - week + 1, now - week], now), 2);
  assert.equal(recentSkillUseCount([now + 1, now - week - 1], now), 0);
  assert.equal(recentSkillUseCount([now, now - 1, now - 2, now - 3], now), 3);
  for (const invalid of [undefined, null, "yesterday", Infinity, NaN, -1]) {
    assert.equal(recentSkillUseCount(invalid, now), 0);
  }
  const history = [now, now - 1, now - 2];
  assert.equal(recentSkillUseCount(history, now + week - 1), 1);
  assert.equal(recentSkillUseCount(history, now + week), 0);
  assert.deepEqual(history, [now, now - 1, now - 2], "Aging does not delete stored timestamps");
});

test("reads legacy timestamps as one use and upgrades them on the next click", () => {
  assert.deepEqual(lastSkillUses(100), [100]);
  assert.equal(recentSkillUseCount(100, 101), 1);
  assert.deepEqual(recordSkillUse(100, 101), [101, 100]);
  assert.deepEqual(recordSkillUse(undefined, 101), [101]);
});

test("retains only the three latest uses without mutating input or deduplicating clicks", () => {
  const history = [100, 300, 200];
  assert.deepEqual(recordSkillUse(history, 400), [400, 300, 200]);
  assert.deepEqual(history, [100, 300, 200]);
  assert.deepEqual(recordSkillUse([100, 100], 100), [100, 100, 100]);
  assert.deepEqual(lastSkillUses([null, "bad", Infinity, -1, 200, 100]), [200, 100]);
  assert.deepEqual(recordSkillUse([500, 300, 200], 400), [400, 300, 200]);
});

test("uses gray for no weekly uses and progressively lighter greens for one to three", () => {
  const theme = { text: { muted: "gray" } };
  assert.equal(skillUsageColor(0, theme), "gray");
  assert.equal(skillUsageColor(1, theme), "#228B22");
  assert.equal(skillUsageColor(2, theme), "#4CAF50");
  assert.equal(skillUsageColor(3, theme), "#86EFAC");
  assert.equal(skillUsageColor(4, theme), "#86EFAC");
});

test("sorts skill display names alphabetically, ignoring case", () => {
  const skills = [
    { id: "report", name: "Report" },
    { id: "alpha", name: "alpha" },
    { id: "opencode", name: "OpenCode" },
  ];
  assert.deepEqual(sortedSkills(skills).map((skill) => skill.id), ["alpha", "opencode", "report"]);
  assert.deepEqual(skills.map((skill) => skill.id), ["report", "alpha", "opencode"]);
});

test("breaks equal-name ties by skill ID", () => {
  assert.deepEqual(sortedSkills([
    { id: "z", name: "Review" }, { id: "a", name: "review" },
  ]).map((skill) => skill.id), ["a", "z"]);
});

test("handles an empty skill list", () => {
  assert.deepEqual(sortedSkills([]), []);
});

test("prompt insertion uses the skill ID with an at sign and exactly one trailing space", () => {
  assert.equal(skillPromptText({ id: "alpha", name: "Alpha Display Name" }), "@alpha ");
  assert.throws(() => skillPromptText({ id: "bad\nname" }));
  assert.throws(() => skillPromptText({ id: "bad\rname" }));
});

test("distinguishes global, repo, ancestor-repo, built-in, and other skill sources", () => {
  const scope = (path, directory = "/home/test/project/packages/app") => skillScope(path, directory, "/home/test");
  assert.equal(scope("/home/test/.config/opencode/skills/review/SKILL.md"), "Global");
  assert.equal(scope("/home/test/.claude/skills/review/SKILL.md"), "Global");
  assert.equal(scope("/home/test/.agents/skills/review/SKILL.md"), "Global");
  assert.equal(scope("/home/test/project/.opencode/skills/review/SKILL.md"), "Repo");
  assert.equal(scope("/home/test/project/packages/app/custom-skills/review.md"), "Repo");
  assert.equal(scope("skill://opencode"), "Built-in");
  assert.equal(scope("/shared/skills/review.md"), "Other");
  assert.equal(scope("/home/test/project-other/.opencode/skills/review.md"), "Other");
  assert.equal(scope(undefined), "Other");
});

test("assigns distinct theme colors to skill sources and keeps unknown sources muted", () => {
  const theme = {
    text: { muted: "gray", feedback: { info: { base: "blue" }, success: { base: "green" } } },
    hue: { accent: { 500: "purple" } },
  };
  assert.equal(skillScopeColor("Global", theme), "gray");
  assert.equal(skillScopeColor("Built-in", theme), "purple");
  assert.equal(skillScopeColor("Repo", theme), "blue");
  assert.equal(skillScopeColor("Other", theme), "gray");
  assert.equal(skillScopeColor(undefined, theme), "gray");
});

test("places hover cards left of sidebar rows and inside terminal bounds", () => {
  assert.deepEqual(tooltipPlacement(100, 10, 140, 40), { width: 52, height: 12, left: 47, top: 10 });
  assert.deepEqual(tooltipPlacement(100, 39, 140, 40), { width: 52, height: 12, left: 47, top: 28 });
  for (const [columns, rows] of [[30, 8], [1, 1], [80, 24]]) {
    const card = tooltipPlacement(columns - 1, rows - 1, columns, rows);
    assert.ok(card.left >= 0 && card.top >= 0);
    assert.ok(card.left + card.width <= columns);
    assert.ok(card.top + card.height <= rows);
  }
});
