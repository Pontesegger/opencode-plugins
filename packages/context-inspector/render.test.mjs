import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure";

const context = {
  options: {},
  location: { directory: "/fixture" },
  theme: { text: { base: "#ffffff", muted: "#888888" } },
  data: {
    session: {
      message: { list: () => [] },
      get: () => ({ location: { directory: "/fixture" } }),
      cost: () => 1.23,
    },
    location: { model: { list: () => [] } },
  },
  ui: { model: { current: () => undefined } },
};

ensureRuntimePluginSupport({
  additional: { "@opencode/plugin/tui": { usePlugin: () => context } },
});

await import("./render.fixture.tsx");
