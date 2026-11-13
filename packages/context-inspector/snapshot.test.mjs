import assert from "node:assert/strict";
import { test } from "node:test";
import { captureSnapshot, estimateTokens, isMcpTool, segmentWidths, SnapshotCache, sourceCategory, splitMcpCatalog, summarize } from "./snapshot.mjs";

const base = () => ({ sessionID: "ses_test", model: { providerID: "test", id: "model" }, system: [], tools: {}, messages: [] });

test("separates instruction sources, preserves exact text, excludes conversation", () => {
  const event = base();
  const sources = [
    { key: "core/date", text: "date" }, { key: "file:/project/AGENTS.md", text: "project rules" },
    { key: "core/skills", text: "skill catalog" }, { key: "core/tools", text: "tool catalog" },
  ];
  event.system = [{ text: sources.map((source) => source.text).join("\n"), metadata: { experimental: { instructions: sources } } }];
  event.messages = [{ role: "user", content: [{ type: "text", text: "CONVERSATION SHOULD NOT APPEAR" }] }];
  const before = JSON.stringify(event);
  const snapshot = captureSnapshot(event);
  assert.equal(JSON.stringify(event), before);
  assert.equal(snapshot.sections.find((section) => section.id === "rules").entries[0].text, "project rules");
  assert.equal(snapshot.sections.find((section) => section.id === "skills").entries[0].text, "skill catalog");
  assert.equal(snapshot.sections.find((section) => section.id === "tools").entries[0].text, "tool catalog");
  assert.ok(!JSON.stringify(snapshot).includes("CONVERSATION SHOULD NOT APPEAR"));
});

test("stale source metadata never substitutes old file contents", () => {
  const event = base();
  event.system = [{ text: "actual changed text", metadata: { experimental: { instructions: [{ key: "AGENTS.md", text: "obsolete text" }] } } }];
  const snapshot = captureSnapshot(event);
  assert.equal(snapshot.sections[0].entries[0].text, "actual changed text");
  assert.equal(snapshot.sections[1].tokens, 0);
  assert.ok(snapshot.warnings.length);
  assert.ok(!JSON.stringify(snapshot.sections).includes("obsolete text"));
});

test("handles duplicate sources without counting overlapping text twice", () => {
  const event = base();
  event.system = [{ text: "abcdef", metadata: { experimental: { instructions: [{ key: "core/date", text: "abc" }, { key: "rules", text: "abc" }] } } }];
  const all = captureSnapshot(event).sections.flatMap((section) => section.entries).map((entry) => entry.text);
  assert.equal(all.join(""), "abcdef");
});

test("tools include descriptions/schemas, not executors; MCP only when included", () => {
  const event = base();
  event.tools = { read: { description: "read file", input: { type: "object" }, execute: "SECRET" }, docs_search: { description: "search", input: {} } };
  const snapshot = captureSnapshot(event, ["docs", "unused"]);
  assert.equal(snapshot.sections.find((section) => section.id === "mcp").entries.length, 1);
  assert.ok(!JSON.stringify(snapshot).includes("SECRET"));
  assert.ok(isMcpTool("mcp_docs_search"));
  assert.ok(isMcpTool("docs_search", ["docs"]));
  assert.ok(!isMcpTool("read", ["docs"]));
});

test("only loaded skills and catalogs count, not unrelated tool results", () => {
  const event = base();
  event.messages = [
    { role: "tool", content: [{ type: "tool-result", name: "skill", id: "skill1", result: { type: "text", value: "LOADED SKILL" } }] },
    { role: "tool", content: [{ type: "tool-result", name: "read", result: { type: "text", value: "UNRELATED FILE" } }] },
    { role: "user", content: [{ type: "text", text: 'normal message <skill_content name="extra">SKILL</skill_content> more conversation' }] },
  ];
  const snapshot = captureSnapshot(event);
  const skill = snapshot.sections.find((section) => section.id === "skills");
  assert.equal(skill.entries.length, 2);
  assert.ok(!JSON.stringify(snapshot).includes("UNRELATED FILE"));
  assert.ok(!JSON.stringify(snapshot).includes("more conversation"));
});

test("MCP Code Mode namespaces get their own section without inventing installed content", () => {
  const text = 'Code Mode instructions\n- opencode (2 tools) // built in\n  - tools.opencode.list({})\n- docs (1 tool) // MCP\n  - tools.docs.search({query})\n- other (1 tool) // built in\n  - tools.other.run({})\n';
  const parts = splitMcpCatalog(text, ["docs", "absent"]);
  assert.equal(parts.map((part) => part.text).join(""), text);
  assert.equal(parts.filter((part) => part.id === "mcp").length, 1);
  assert.ok(parts.find((part) => part.id === "mcp").text.includes("tools.docs.search"));
  assert.ok(!parts.find((part) => part.id === "mcp").text.includes("tools.other.run"));
  const event = base();
  event.system = [{ text, metadata: { experimental: { instructions: [{ key: "core/codemode", text }] } } }];
  const snapshot = captureSnapshot(event, ["docs"]);
  assert.ok(snapshot.sections.find((section) => section.id === "mcp").tokens > 0);
  assert.deepEqual(splitMcpCatalog(text, ["absent"]), [{ id: "tools", name: "", text }]);
});

test("summary has counts and estimates but never exposes captured text", () => {
  const event = base(); event.system = [{ text: "PRIVATE INSTRUCTIONS" }];
  const summary = summarize(captureSnapshot(event));
  assert.equal(summary.sections[0].count, 1);
  assert.ok(!JSON.stringify(summary).includes("PRIVATE INSTRUCTIONS"));
  assert.equal(summarize(undefined), null);
});

test("wide segments fit their width including gaps and keep small categories clickable", () => {
  const sections = [100000, 1, 100, 50, 30].map((tokens, id) => ({ id, tokens }));
  for (const width of [13, 30, 70, 150]) {
    const segments = segmentWidths(sections, width);
    assert.equal(segments.reduce((sum, section) => sum + section.width, 0) + 8, width);
    assert.ok(segments.every((section) => section.width >= 1));
  }
  assert.deepEqual(segmentWidths([{ tokens: 0 }], 70), []);
});

test("cache keeps two revisions, isolates sessions, evicts and clears", () => {
  const cache = new SnapshotCache(2);
  for (const revision of ["1", "2", "3"]) cache.put({ ...captureSnapshot(base()), revision });
  assert.equal(cache.get("ses_test").revision, "3");
  assert.equal(cache.get("ses_test", "2").revision, "2");
  assert.equal(cache.get("ses_test", "1"), undefined);
  assert.equal(cache.get("ses_other"), undefined);
  cache.put({ ...captureSnapshot(base()), sessionID: "ses_2" });
  cache.put({ ...captureSnapshot(base()), sessionID: "ses_3" });
  assert.equal(cache.get("ses_test"), undefined);
  cache.clear(); assert.equal(cache.get("ses_3"), undefined);
});

test("oversized captures are rejected, not silently truncated", () => {
  const cache = new SnapshotCache(2, 10);
  assert.equal(cache.put(captureSnapshot(base())), false);
  assert.equal(cache.get("ses_test"), undefined);
});

test("token estimates and key classification are explicitly heuristic", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcdefgh"), 2);
  assert.equal(sourceCategory("core/environment"), "prompt");
  assert.equal(sourceCategory("rules/team"), "rules");
  assert.equal(sourceCategory("core/codemode"), "tools");
});
