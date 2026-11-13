import { Plugin } from "@opencode/plugin";
import { ContextInspector } from "./rpc";
import { captureSnapshot, SnapshotCache, summarize } from "./snapshot.mjs";
import type { Category, Snapshot } from "./types";

export default Plugin.define({
  id: "local.context-inspector",
  async setup(context) {
    const cache = new SnapshotCache();
    let sequence = 0;
    const rpc = await context.rpc.register(ContextInspector, {
      summary: async (input) => {
        const { sessionID } = input as { sessionID: string };
        return summarize(cache.get(sessionID));
      },
      details: async (input) => {
        const { sessionID, revision, category } = input as { sessionID: string; revision: string; category: Category };
        const snapshot = cache.get(sessionID, revision) as Snapshot | undefined;
        const section = snapshot?.sections.find((section) => section.id === category);
        return snapshot && section ? {
          revision: snapshot.revision, capturedAt: snapshot.capturedAt,
          model: snapshot.model, warnings: snapshot.warnings, section,
        } : null;
      },
    });
    const hook = await context.session.hook("context", async (event) => {
      // Failure in optional diagnostics must never break or mutate generation.
      try {
        const servers = await context.mcp.list();
        const snapshot = captureSnapshot(event, servers.data.map((server) => server.name), `${Date.now()}-${++sequence}`);
        cache.put(snapshot);
        await rpc.events.emit("updated", { sessionID: event.sessionID });
      } catch {
        // Do not log: errors or request objects can contain prompt text.
      }
    });
    return async () => {
      await hook.dispose();
      await rpc.dispose();
      cache.clear();
    };
  },
});
