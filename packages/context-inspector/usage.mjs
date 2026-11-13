/** Latest request only: session totals measure billing, not context occupancy. */
export function latestUsage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.type !== "assistant" || !message.tokens) continue;
    const tokens = message.tokens;
    // V2 TokenUsage normalizes reasoning separately from ordinary output.
    // Cached input still occupies context. Match TokenUsage.total in the SDK.
    const used = [tokens.input, tokens.output, tokens.reasoning, tokens.cache?.read, tokens.cache?.write]
      .reduce((sum, value) => sum + (Number.isFinite(value) ? Math.max(0, value) : 0), 0);
    if (used > 0) return used;
  }
  return undefined;
}

export function barState(used, limit, options = {}) {
  const width = Math.max(5, Math.min(40, Math.round(options.width ?? 20)));
  const known = Number.isFinite(used) && used >= 0 && Number.isFinite(limit) && limit > 0;
  const ratio = known ? used / limit : 0;
  const filled = Math.min(width, Math.max(0, Math.round(ratio * width)));
  const level = !known ? "unknown"
    : used < (options.greenBelow ?? 150000) ? "green"
    : ratio <= (options.yellowThrough ?? 0.5) ? "yellow" : "red";
  return {
    known,
    level,
    filled: "█".repeat(filled),
    empty: "░".repeat(width - filled),
    percent: known ? Math.round(ratio * 100) : undefined,
  };
}

export function formatTokens(value) {
  if (value >= 1000000) return `${Number((value / 1000000).toFixed(2))}M`;
  if (value >= 1000) return `${Number((value / 1000).toFixed(1))}k`;
  return String(Math.round(value));
}
