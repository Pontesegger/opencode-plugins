const statuses = new Set(["active", "paused", "complete"]);

/** RPC clients infer types but do not validate received goal values. */
export function normalizeGoal(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || typeof value.id !== "string" || typeof value.objective !== "string"
    || !statuses.has(value.status) || typeof value.boot !== "string"
    || !Number.isFinite(value.rounds) || !Number.isFinite(value.maxRounds)
    || !Number.isFinite(value.updatedAt)
    || (value.reason !== undefined && typeof value.reason !== "string")
    || (value.stalls !== undefined && !Number.isFinite(value.stalls))) return null;
  return {
    id: value.id, objective: value.objective, status: value.status,
    rounds: value.rounds, maxRounds: value.maxRounds, boot: value.boot,
    updatedAt: value.updatedAt,
    ...(value.reason !== undefined ? { reason: value.reason } : {}),
    ...(value.stalls !== undefined ? { stalls: value.stalls } : {}),
  };
}

/** A read-only, session/location-scoped subscription with stale-read protection. */
export function watchGoal(rpc, sessionID, location, update, onReconnect) {
  let disposed = false;
  let generation = 0;
  let lastEvent = -Infinity;
  let request;
  let stopChanged = () => {};
  let stopReconnect = () => {};
  update(null);

  async function refresh(clear = true) {
    if (disposed) return;
    const revision = ++generation;
    request?.abort();
    const abort = new AbortController();
    request = abort;
    // Reconnect is not evidence that the last displayed goal is still current.
    if (clear) update(null);
    try {
      const value = await rpc.get({ sessionID }, { location, signal: abort.signal });
      if (!disposed && revision === generation && !abort.signal.aborted) update(normalizeGoal(value));
    } catch {
      // Unsupported/disabled RPC and transport failures must not break counters.
      if (!disposed && revision === generation && !abort.signal.aborted) update(null);
    }
  }

  try {
    stopChanged = rpc.events.on("changed", (event) => {
      if (disposed || event.data?.sessionID !== sessionID || event.location?.directory !== location.directory) return;
      if (Number.isFinite(event.created)) {
        if (event.created < lastEvent) return;
        lastEvent = event.created;
      }
      generation++;
      request?.abort();
      update(normalizeGoal(event.data.goal));
    });
    stopReconnect = onReconnect(() => { lastEvent = -Infinity; void refresh(); });
    void refresh();
  } catch {
    update(null);
  }

  const stop = () => {
    disposed = true;
    generation++;
    request?.abort();
    stopChanged();
    stopReconnect();
  };
  stop.refresh = () => refresh(false);
  return stop;
}
