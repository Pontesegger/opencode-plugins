export const categories = [
  ["prompt", "System prompt", "#60a5fa"],
  ["rules", "AGENTS.md / rules", "#c084fc"],
  ["tools", "System tools", "#4ade80"],
  ["skills", "Skills", "#facc15"],
  ["mcp", "MCP tools", "#fb923c"],
];

// Intentionally a heuristic: provider tokenization and message framing vary.
export function estimateTokens(text) {
  return text.length ? Math.ceil(new TextEncoder().encode(text).length / 4) : 0;
}

export function sourceCategory(key) {
  if (/(?:^|[/:._-])skills?(?:$|[/:._-])/i.test(key)) return "skills";
  if (/(?:agents|claude)\.md|(?:^|[/:._-])(?:instructions?|rules)(?:$|[/:._-])/i.test(key)) return "rules";
  if (/(?:^|[/:._-])(?:tools?|codemode|code-mode)(?:$|[/:._-])/i.test(key)) return "tools";
  return "prompt";
}

export function isMcpTool(name, servers = []) {
  if (/^mcp[._]/i.test(name)) return true;
  return servers.some((server) => {
    const prefix = server.replace(/[^a-zA-Z0-9_-]/g, "_");
    return name.startsWith(`${prefix}_`) || name.startsWith(`${server}.`);
  });
}

/** Split only identifiable namespace groups in the outgoing Code Mode catalog. */
export function splitMcpCatalog(text, servers = []) {
  const headings = [...text.matchAll(/^- ([\w.-]+) \(\d+ tools?\)[^\n]*/gm)];
  const spans = headings.map((match, index) => ({
    start: match.index, end: headings[index + 1]?.index ?? text.length, name: match[1],
  })).filter((span) => servers.some((server) =>
    span.name === server || span.name === server.replace(/[^a-zA-Z0-9_-]/g, "_")
      || span.name === `mcp_${server.replace(/[^a-zA-Z0-9_-]/g, "_")}`));
  if (!spans.length) return [{ id: "tools", name: "", text }];
  const parts = [];
  let cursor = 0;
  for (const span of spans) {
    if (cursor < span.start) parts.push({ id: "tools", name: "", text: text.slice(cursor, span.start) });
    parts.push({ id: "mcp", name: span.name, text: text.slice(span.start, span.end) });
    cursor = span.end;
  }
  if (cursor < text.length) parts.push({ id: "tools", name: "", text: text.slice(cursor) });
  return parts;
}

function resultText(result) {
  if (result?.type === "content") return result.value
    .filter((part) => part.type === "text").map((part) => part.text).join("\n");
  return typeof result?.value === "string" ? result.value : "";
}

/** Copy only the included instructions/tools/skill text, never conversation. */
export function captureSnapshot(event, servers = [], revision = String(Date.now())) {
  const sections = categories.map(([id, label]) => ({ id, label, tokens: 0, entries: [] }));
  const warnings = [];
  const add = (id, title, text) => {
    if (!text) return;
    const section = sections.find((section) => section.id === id);
    const tokens = estimateTokens(text);
    section.entries.push({ title, text, tokens });
    section.tokens += tokens;
  };

  for (const [index, part] of (event.system ?? []).entries()) {
    const sources = part.metadata?.experimental?.instructions;
    const text = part.text ?? "";
    if (!Array.isArray(sources)) {
      add("prompt", `System part ${index + 1}`, text);
      continue;
    }
    // Metadata is a copy and can be stale after another plugin edits the text.
    // Attribute only substrings actually present; keep all remaining text too.
    const spans = [];
    for (const source of sources) {
      if (typeof source.key !== "string" || typeof source.text !== "string" || !source.text) continue;
      let start = text.indexOf(source.text);
      while (start >= 0 && spans.some((span) => start < span.end && start + source.text.length > span.start)) {
        start = text.indexOf(source.text, start + 1);
      }
      if (start < 0) {
        warnings.push(`Source attribution unavailable for ${source.key}; assembled text remains in System prompt.`);
        continue;
      }
      spans.push({ start, end: start + source.text.length, key: source.key });
    }
    spans.sort((a, b) => a.start - b.start);
    let cursor = 0;
    for (const span of spans) {
      add("prompt", `System part ${index + 1} (framing)`, text.slice(cursor, span.start));
      const id = sourceCategory(span.key);
      const sourceText = text.slice(span.start, span.end);
      if (id === "tools" && /codemode|code-mode/i.test(span.key)) {
        for (const part of splitMcpCatalog(sourceText, servers)) {
          add(part.id, part.name ? `${span.key}: ${part.name}` : span.key, part.text);
        }
      } else {
        add(id, span.key, sourceText);
      }
      cursor = span.end;
    }
    add("prompt", `System part ${index + 1} (remaining text)`, text.slice(cursor));
  }

  for (const [name, tool] of Object.entries(event.tools ?? {})) {
    // Copy only model-visible fields. Never serialize executors or credentials.
    const text = JSON.stringify({ name, description: tool.description, input: tool.input }, null, 2);
    add(isMcpTool(name, servers) ? "mcp" : "tools", name, text);
  }

  for (const message of event.messages ?? []) {
    for (const part of Array.isArray(message.content) ? message.content : []) {
      if (part.type === "tool-result" && /(?:^|[._])skill$/.test(part.name ?? "")) {
        add("skills", `Loaded skill (${part.id ?? "tool result"})`, resultText(part.result));
      } else if (part.type === "text") {
        // Explicit skill blocks also occur in resolved prompt attachments.
        for (const match of (part.text ?? "").matchAll(/<skill_content\b[^>]*>[\s\S]*?<\/skill_content>/g)) {
          const name = match[0].match(/\bname="([^"]+)"/)?.[1] ?? "skill";
          add("skills", `Loaded skill: ${name}`, match[0]);
        }
      }
    }
  }

  if (servers.length && !sections.find((section) => section.id === "mcp").tokens) {
    warnings.push("No separately identifiable MCP definitions in this snapshot. Code Mode catalogs may be grouped with System tools.");
  }
  return {
    sessionID: event.sessionID, revision, capturedAt: Date.now(),
    model: `${event.model?.providerID ?? "unknown"}/${event.model?.id ?? "unknown"}`,
    warnings: [...new Set(warnings)], sections,
  };
}

export function summarize(snapshot) {
  if (!snapshot) return null;
  return {
    ...snapshot,
    sections: snapshot.sections.map(({ entries, ...section }) => ({ ...section, count: entries.length })),
  };
}

/** Proportional blocks, at least one cell for every nonempty category. */
export function segmentWidths(sections, width, gap = 2) {
  const used = sections.filter((section) => section.tokens > 0);
  if (!used.length) return [];
  const cells = Math.max(used.length, Math.floor(width) - gap * (used.length - 1));
  const total = used.reduce((sum, section) => sum + section.tokens, 0);
  const remaining = cells - used.length;
  const raw = used.map((section) => section.tokens / total * remaining);
  const widths = raw.map((value) => 1 + Math.floor(value));
  const remainder = cells - widths.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value % 1 }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < remainder; i++) widths[order[i].index]++;
  return used.map((section, index) => ({ ...section, width: widths[index] }));
}

/** Bounded, ephemeral, two snapshots/session to make click-time revisions safe. */
export class SnapshotCache {
  constructor(maxSessions = 8, maxBytes = 32 * 1024 * 1024) {
    this.maxSessions = maxSessions;
    this.maxBytes = maxBytes;
    this.sessions = new Map();
  }
  put(snapshot) {
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
    if (bytes > this.maxBytes) {
      this.sessions.delete(snapshot.sessionID);
      return false;
    }
    const previous = this.sessions.get(snapshot.sessionID)?.[0];
    this.sessions.delete(snapshot.sessionID);
    this.sessions.set(snapshot.sessionID, [{ snapshot, bytes }, ...(previous ? [previous] : [])]);
    const size = () => [...this.sessions.values()].flat().reduce((sum, item) => sum + item.bytes, 0);
    while (this.sessions.size > this.maxSessions || size() > this.maxBytes) {
      if (this.sessions.size === 1) { this.sessions.set(snapshot.sessionID, [{ snapshot, bytes }]); break; }
      this.sessions.delete(this.sessions.keys().next().value);
    }
    return true;
  }
  get(sessionID, revision) {
    return this.sessions.get(sessionID)?.find((item) => !revision || item.snapshot.revision === revision)?.snapshot;
  }
  clear() { this.sessions.clear(); }
}
