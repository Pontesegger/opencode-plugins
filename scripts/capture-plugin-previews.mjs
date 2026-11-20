import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure";

let currentContext;
ensureRuntimePluginSupport({
  additional: { "@opencode/plugin/tui": {
    Plugin: { define: (plugin) => plugin },
    usePlugin: () => currentContext,
  } },
});

const { capturePluginPreviews } = await import("./capture-plugin-previews.tsx");
const captures = await capturePluginPreviews((context) => { currentContext = context; });
const writer = fileURLToPath(new URL("./write-plugin-previews.py", import.meta.url));
const destination = fileURLToPath(new URL("../docs/images", import.meta.url));
const result = spawnSync(process.env.PYTHON ?? "python3", [writer, destination], {
  input: JSON.stringify(captures), encoding: "utf8", stdio: ["pipe", "inherit", "inherit"],
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
