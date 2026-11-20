export const labelLimit = 30;

export function normalizeLink(input) {
  if (!input || typeof input.url !== "string" || typeof input.label !== "string") {
    throw new Error("Provide a URL and a short label.");
  }
  const label = input.label.trim().replace(/\s+/gu, " ");
  if (!label || Array.from(label).length > labelLimit || /[\p{Cc}\p{Cf}]/u.test(label)) {
    throw new Error("The label must contain 1–30 characters of plain text.");
  }
  if (/[\p{Cc}\p{Cf}]/u.test(input.url)) throw new Error("The URL must not contain control characters.");
  let url;
  try { url = new URL(input.url.trim()); } catch { throw new Error("Provide an absolute HTTP(S) URL."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Only HTTP(S) URLs without embedded credentials are supported.");
  }
  const link = { url: url.href, label };
  if (input.description !== undefined) {
    if (typeof input.description !== "string") throw new Error("The description must be plain text.");
    const description = input.description.trim().replace(/\s+/gu, " ");
    if (!description || Array.from(description).length > 1000 || /[\p{Cc}\p{Cf}]/u.test(description)) {
      throw new Error("The description must contain 1–1000 characters of plain text.");
    }
    link.description = description;
  }
  return link;
}

/** Keep the hover card beside the link and within the terminal's render region. */
export function tooltipPlacement(x, y, columns, rows) {
  const width = Math.max(1, Math.min(52, columns - 2));
  const height = Math.max(1, Math.min(12, rows - 2));
  const left = x >= width + 1 ? x - width - 1 : x + 2;
  return {
    width, height,
    left: Math.max(0, Math.min(left, columns - width)),
    top: Math.max(0, Math.min(y, rows - height)),
  };
}

// Serialize read/modify/write operations so parallel tool calls cannot lose links.
export function createLinks(storage) {
  const pending = new Map();
  const key = (sessionID) => {
    if (typeof sessionID !== "string" || !sessionID) throw new Error("A session ID is required.");
    return `sessions/${sessionID}/links`;
  };
  const list = async (sessionID) => {
    const storageKey = key(sessionID);
    await pending.get(sessionID);
    return (await storage.get(storageKey)) ?? [];
  };
  return {
    list,
    post(sessionID, input) {
      const storageKey = key(sessionID);
      const link = normalizeLink(input);
      const operation = (pending.get(sessionID) ?? Promise.resolve()).then(async () => {
        const links = (await storage.get(storageKey)) ?? [];
        const index = links.findIndex((entry) => entry.url === link.url);
        const updated = [...links];
        if (index < 0) updated.push(link);
        else updated[index] = { ...links[index], ...link };
        await storage.set(storageKey, updated);
        return link;
      });
      const settled = operation.then(() => {}, () => {});
      pending.set(sessionID, settled);
      void settled.then(() => { if (pending.get(sessionID) === settled) pending.delete(sessionID); });
      return operation;
    },
  };
}
