// Optional renderer regression test. Run after installing devDependencies.
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure";

ensureRuntimePluginSupport({
  additional: { "@opencode/plugin/tui": { Plugin: { define: (plugin) => plugin } } },
});

await import("./hover.fixture.tsx");
