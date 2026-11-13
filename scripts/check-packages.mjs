import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "opencode-plugin-packages-"));
const run = (command, args, cwd) => execFileSync(command, args, {
  cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"],
});

try {
  for (const directory of ["context-inspector", "sidebar-info"]) {
    const source = join(root, "packages", directory);
    const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
    const [packed] = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary], source));
    const paths = new Set(packed.files.map((file) => file.path));
    const allowed = new Set(["package.json", "README.md", "LICENSE", "LICENSE.md", ...manifest.files]);
    for (const path of paths) assert.ok(allowed.has(path), `Unexpected shipped file: ${path}`);
    for (const path of manifest.files) assert.ok(paths.has(path), `Missing runtime file: ${path}`);
    for (const entry of Object.values(manifest.exports)) {
      assert.ok(paths.has(entry.replace(/^\.\//, "")), `Missing exported entrypoint: ${entry}`);
    }
    assert.equal(manifest.dependencies["@opencode/plugin"], "2.2.7");
    assert.ok(manifest.peerDependencies["solid-js"]);
    assert.ok(manifest.peerDependencies["@opentui/core"]);
    assert.ok(manifest.peerDependencies["@opentui/solid"]);

    const destination = join(temporary, directory);
    mkdirSync(destination);
    run("tar", ["-xzf", join(temporary, packed.filename), "-C", destination], root);
    const extracted = join(destination, "package");
    assert.equal(manifest.license, "MIT");
    assert.ok(paths.has("LICENSE"), "Missing packaged MIT license");
    assert.equal(readFileSync(join(extracted, "LICENSE"), "utf8"),
      readFileSync(join(root, "LICENSE"), "utf8"), "Package license differs from repository license");
    for (const path of paths) {
      const text = readFileSync(join(extracted, path), "utf8");
      assert.ok(!/\/(?:home|Users)\/[^/\s"']+\//.test(text)
        && !/\/(?:tmp|var\/tmp)\/opencode\//.test(text), `Machine-specific path in ${path}`);
      if (!/\.(?:ts|tsx|mjs)$/.test(path)) continue;
      for (const match of text.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)) {
        const base = resolve(extracted, dirname(path), match[1]);
        assert.ok(["", ".ts", ".tsx", ".mjs", ".js"].some((extension) => existsSync(base + extension)),
          `Missing relative import ${match[1]} in ${path}`);
      }
    }

    // Run helper regressions against extracted runtime files, not the originals.
    // The Bun renderer test is separate and is not included in the tarball.
    const tests = readdirSync(source).filter((path) => path.endsWith(".test.mjs") && path !== "hover.test.mjs");
    for (const test of tests) copyFileSync(join(source, test), join(extracted, test));
    console.log(run(process.execPath, ["--test", ...tests], extracted));
    console.log(`PASS: ${manifest.name} tarball (${paths.size} files), exports, relative imports, and packaged helper tests`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
