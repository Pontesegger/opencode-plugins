import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure";

ensureRuntimePluginSupport({
  additional: { "@opencode/plugin/tui": {
    Plugin: { define: (plugin) => plugin },
    usePlugin: () => ({
      options: {}, location: { directory: "/test/project" },
      theme: { text: { base: "#ffffff", muted: "#888888" } },
      data: {
        session: { message: { list: () => [] }, get: () => undefined, cost: () => 1.23 },
        location: { model: { list: () => [] } },
      },
      ui: { model: { current: () => undefined } },
    }),
  } },
});

await import("./render.fixture.tsx");
