// Optional live regression: requires a running OpenCode service and a global skill.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { copySkillToRepo } from "./copy.mjs";
import { skillScope } from "./skills.mjs";

const exec = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), "skills-copy-live-"));
const location = { directory };
const query = `?location[directory]=${encodeURIComponent(directory)}`;
const api = async (method, path, data) => {
  const args = ["api", method, path];
  if (data !== undefined) args.push("--data", JSON.stringify(data));
  try { return (await exec("opencode", args)).stdout; }
  catch (error) {
    try { throw JSON.parse(error.stdout); } catch (decoded) {
      if (decoded?._tag) throw decoded;
      throw error;
    }
  }
};
const client = {
  file: { read: async ({ path }) => {
    const output = await api("get", `/api/fs/read/${path}${query}`);
    // Normalize the CLI's optional display newline using only our own fixture
    // file. Production uses the generated client's byte-exact file.read.
    const fixture = await readFile(join(directory, path), "utf8");
    assert.ok(output === fixture || output === fixture + "\n", "CLI read must match the fixture apart from its display newline");
    return new TextEncoder().encode(output === fixture ? output : output.slice(0, -1));
  } },
  skill: { list: async () => JSON.parse(await api("get", `/api/skill${query}`)) },
  shell: {
    create: async ({ command, cwd, timeout }) => JSON.parse(await api("post", `/api/shell${query}`, { command, cwd, timeout })),
    get: async ({ id }) => JSON.parse(await api("get", `/api/shell/${id}${query}`)),
    output: async ({ id }) => JSON.parse(await api("get", `/api/shell/${id}/output${query}`)),
  },
};
try {
  await exec("git", ["init", "-q", directory]);
  // Isolate the precedence conflict from any source configuration inherited by
  // the caller's real project: begin with just the global source registered.
  await mkdir(join(directory, ".opencode"));
  await writeFile(join(directory, ".opencode", "opencode.jsonc"), JSON.stringify({
    $schema: "https://opencode.ai/config.json", skills: [join(homedir(), ".config", "opencode", "skills")],
  }, null, 2));
  await api("get", `/api/config${query}`);
  let source;
  let candidates = [];
  for (let attempt = 0; attempt < 50 && !source; attempt++) {
    const registry = (await client.skill.list()).data;
    candidates = registry.filter((skill) => skillScope(skill.path, directory, homedir()) === "Global");
    source = candidates.find((skill) => !process.argv[2] || skill.id === process.argv[2]);
    if (!source) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(source, "A globally stored skill is required for this live regression");
  const destination = await copySkillToRepo(client, source, location, homedir());
  const selected = (await client.skill.list()).data.find((skill) => skill.id === source.id);
  assert.equal(selected.path, join(destination, "SKILL.md"), "Server must select the repo copy without a manual reload");
  console.log(`PASS: live OpenCode selected ${selected.path} instead of ${source.path}`);
  const second = candidates.find((skill) => skill.id !== source.id);
  if (second) {
    const copied = await copySkillToRepo(client, second, location, homedir());
    const selected = (await client.skill.list()).data.find((skill) => skill.id === second.id);
    assert.equal(selected.path, join(copied, "SKILL.md"), "A subsequent copy must activate with an already-registered repo source");
    console.log("PASS: a subsequent copy also activated without a manual reload");
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
