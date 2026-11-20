import assert from "node:assert/strict";
import { test } from "node:test";
import { createLinks, normalizeLink, tooltipPlacement } from "./links.mjs";

const memory = () => {
  const values = new Map();
  return {
    get: async (key) => structuredClone(values.get(key)),
    set: async (key, value) => { values.set(key, structuredClone(value)); },
  };
};

test("labels are short, nonempty, plain text, and counted as Unicode code points", () => {
  const link = (label) => normalizeLink({ url: "https://example.com", label });
  assert.equal(link("  API   docs  ").label, "API docs");
  assert.equal(link("a".repeat(30)).label.length, 30);
  assert.equal(link("😀".repeat(30)).label, "😀".repeat(30));
  for (const label of ["", "   ", "a".repeat(31), "😀".repeat(31), "bad\x1b[31m", "bad\u202etext"]) {
    assert.throws(() => link(label), /1–30 characters/);
  }
});

test("only absolute HTTP(S) URLs without credentials or control characters are accepted", () => {
  assert.equal(normalizeLink({ url: " HTTPS://EXAMPLE.COM ", label: "Docs" }).url, "https://example.com/");
  assert.equal(normalizeLink({ url: "http://localhost:3000/preview?q=1#test", label: "Preview" }).url,
    "http://localhost:3000/preview?q=1#test");
  for (const url of ["/relative", "not a URL", "javascript:alert(1)", "data:text/plain,test", "file:///etc/passwd", "ftp://example.com", "https://user:pass@example.com", "https://example.com/\npath", "https://example.com/\x1b"]) {
    assert.throws(() => normalizeLink({ url, label: "Bad" }));
  }
  for (const input of [null, {}, { url: 3, label: "Bad" }, { url: "https://example.com", label: false }]) {
    assert.throws(() => normalizeLink(input));
  }
});

test("optional hover descriptions are validated without changing the short label", () => {
  const link = (description) => normalizeLink({ url: "https://example.com", label: "Docs", description });
  assert.deepEqual(link("  Detailed\n API   reference  "), {
    url: "https://example.com/", label: "Docs", description: "Detailed API reference",
  });
  assert.equal(link(undefined).description, undefined, "Old calls still work without a description");
  assert.equal(link("😀".repeat(1000)).description, "😀".repeat(1000));
  for (const description of ["", "  ", 3, null, "a".repeat(1001), "bad\x1b[31m", "bad\u202etext"]) {
    assert.throws(() => link(description), /description/);
  }
});

test("hover cards sit beside the sidebar and stay within terminal bounds", () => {
  assert.deepEqual(tooltipPlacement(92, 4, 120, 30), { width: 52, height: 12, left: 39, top: 4 });
  for (const [columns, rows] of [[120, 30], [36, 15], [12, 4], [1, 1]]) {
    const card = tooltipPlacement(columns - 1, rows - 1, columns, rows);
    assert.ok(card.left >= 0 && card.top >= 0);
    assert.ok(card.left + card.width <= columns && card.top + card.height <= rows);
  }
});

test("reposting updates hover descriptions, preserving them when omitted", async () => {
  const storage = memory();
  const links = createLinks(storage);
  await links.post("one", { url: "https://example.com", label: "Docs", description: "Detailed API reference" });
  await links.post("one", { url: "https://example.com", label: "API docs" });
  assert.deepEqual(await createLinks(storage).list("one"), [{
    url: "https://example.com/", label: "API docs", description: "Detailed API reference",
  }]);
  await links.post("one", { url: "https://example.com", label: "API docs", description: "Updated reference" });
  assert.equal((await links.list("one"))[0].description, "Updated reference");
});

test("links are session-specific, durable across reloads, and deduplicated by normalized URL", async () => {
  const storage = memory();
  const links = createLinks(storage);
  assert.deepEqual(await links.list("one"), []);
  await links.post("one", { url: "https://example.com", label: "Docs" });
  await links.post("two", { url: "https://other.example", label: "Other" });
  await links.post("one", { url: "https://EXAMPLE.COM/", label: "Updated docs" });
  assert.deepEqual(await createLinks(storage).list("one"), [{ url: "https://example.com/", label: "Updated docs" }]);
  assert.deepEqual(await links.list("two"), [{ url: "https://other.example/", label: "Other" }]);
  assert.throws(() => links.post("", { url: "https://example.com", label: "Docs" }));
});

test("parallel posts preserve every link in posting order", async () => {
  const links = createLinks(memory());
  await Promise.all(Array.from({ length: 20 }, (_, i) => links.post("one", {
    url: `https://example.com/${i}`, label: `Link ${i}`,
  })));
  assert.deepEqual((await links.list("one")).map((link) => link.label),
    Array.from({ length: 20 }, (_, i) => `Link ${i}`));
});

test("a failed write does not block later posts", async () => {
  const storage = memory();
  const set = storage.set;
  let fail = true;
  storage.set = async (...args) => { if (fail) throw new Error("Unavailable"); await set(...args); };
  const links = createLinks(storage);
  await assert.rejects(links.post("one", { url: "https://example.com/1", label: "First" }));
  fail = false;
  await links.post("one", { url: "https://example.com/2", label: "Second" });
  assert.equal((await links.list("one"))[0].label, "Second");
});
