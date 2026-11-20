export function isDescendant(id, parentID, getSession) {
  const seen = new Set();
  while (id && !seen.has(id)) {
    if (id === parentID) return true;
    seen.add(id);
    id = getSession(id)?.parentID;
  }
  return false;
}

export function subagents(sessionID, family, getSession, status) {
  if (!sessionID) return [];
  return [...new Set(family)].filter((id) => id !== sessionID && isDescendant(id, sessionID, getSession))
    .map((id) => getSession(id)).filter((session) => session && !session.time?.archived)
    .map((session) => ({ id: session.id, title: session.title || session.agent || "Subagent", status: status(session.id) }))
    .sort((a, b) => Number(b.status === "running") - Number(a.status === "running") || a.title.localeCompare(b.title));
}

export function shells(sessionID, list) {
  if (!sessionID) return [];
  return list.filter((shell) => shell.metadata?.sessionID === sessionID && shell.status === "running")
    .sort((a, b) => (a.time?.started ?? 0) - (b.time?.started ?? 0));
}

export function cardPlacement(anchor, width, height, count) {
  const cardWidth = Math.min(56, Math.max(1, width));
  const cardHeight = Math.min(Math.max(1, height), Math.max(5, Math.min(12, count + 4)));
  return {
    width: cardWidth, height: cardHeight,
    left: Math.max(0, Math.min(anchor.x, width - cardWidth)),
    top: Math.max(0, Math.min(anchor.y - cardHeight, height - cardHeight)),
  };
}
