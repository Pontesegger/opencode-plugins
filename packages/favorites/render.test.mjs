import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure";

ensureRuntimePluginSupport({
  additional: { "@opencode/plugin/tui": { Plugin: { define: (plugin) => plugin } } },
});

await import("./render.fixture.tsx");
