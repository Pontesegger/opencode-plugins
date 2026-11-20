import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure";

ensureRuntimePluginSupport({
  additional: { "@opencode/plugin/tui": { Plugin: { define: (plugin) => plugin } } },
});

const { captureBusyPreview } = await import("./capture-busy-preview.tsx");
const capture = await captureBusyPreview();
const writer = fileURLToPath(new URL("./write-busy-preview.py", import.meta.url));
const destination = fileURLToPath(new URL("../docs/images", import.meta.url));
const result = spawnSync(process.env.PYTHON ?? "python3", [writer, destination], {
  input: JSON.stringify(capture), encoding: "utf8", stdio: ["pipe", "inherit", "inherit"],
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
