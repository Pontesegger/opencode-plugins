import assert from "node:assert/strict";
import { test } from "node:test";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { copySkillToRepo } from "./copy.mjs";
import { parse } from "jsonc-parser";

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "sidebar-skill-copy-"));
  const home = join(root, "home");
  const directory = join(root, "repo 'quoted'");
  const global = join(home, ".config", "opencode", "skills");
  await mkdir(global, { recursive: true });
  await mkdir(directory);
  const location = { directory };
  let output = "";
  const calls = [];
  const client = { shell: {
    create: async (input) => {
      calls.push(input);
      assert.deepEqual(input.location, location);
      assert.equal(input.cwd, directory);
      try {
        const result = await promisify(exec)(input.command, { cwd: directory });
        output = result.stdout + result.stderr;
        return { data: { id: "copy", status: "exited", exit: 0 } };
      } catch (error) {
        output = error.stdout + error.stderr;
        return { data: { id: "copy", status: "exited", exit: error.code } };
      }
    },
    output: async () => ({ data: { output } }),
  } };
  client.file = { read: async ({ path, location: requested }) => {
    assert.deepEqual(requested, location);
    try { return new Uint8Array(await readFile(join(directory, path))); }
    catch (error) { if (error.code === "ENOENT") throw { _tag: "FileNotFoundError" }; throw error; }
  } };
  client.skill = { list: async () => {
    let config;
    try { config = parse(await readFile(join(directory, ".opencode", "opencode.jsonc"), "utf8")); }
    catch { try { config = parse(await readFile(join(directory, ".opencode", "opencode.json"), "utf8")); } catch {} }
    const local = config?.skills?.at(-1) === "./.agents/skills";
    const ids = await readdir(join(directory, ".agents", "skills")).catch(() => []);
    return { data: ids.map((id) => ({ id, path: local
      ? join(directory, ".agents", "skills", id, "SKILL.md") : join(global, id, "SKILL.md") })) };
  } };
  try { await run({ root, home, global, location, client, calls }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("copies the entire global skill with binary assets, hidden files and executable modes", async () => fixture(async ({ global, home, location, client }) => {
  const source = join(global, "example");
  await mkdir(join(source, "scripts"), { recursive: true });
  await mkdir(join(source, "empty"));
  await writeFile(join(source, "SKILL.md"), "---\nname: Example\n---\nInstructions");
  await writeFile(join(source, "scripts", "run.sh"), "#!/bin/sh\necho hello\n");
  await chmod(join(source, "scripts", "run.sh"), 0o755);
  await writeFile(join(source, ".asset"), new Uint8Array([0, 255, 128]));
  const destination = await copySkillToRepo(client, { id: "example", path: join(source, "SKILL.md") }, location, home);
  assert.equal(destination, join(location.directory, ".agents", "skills", "example"));
  assert.equal(await readFile(join(destination, "SKILL.md"), "utf8"), await readFile(join(source, "SKILL.md"), "utf8"));
  assert.deepEqual(await readFile(join(destination, ".asset")), Buffer.from([0, 255, 128]));
  assert.equal((await stat(join(destination, "scripts", "run.sh"))).mode & 0o777, 0o755);
  assert.deepEqual(await readdir(join(destination, "empty")), []);
  assert.ok(await stat(join(source, "SKILL.md")), "Source is retained");
}));

test("flat Markdown skills become SKILL.md without copying neighboring global skills", async () => fixture(async ({ global, home, location, client }) => {
  const source = join(global, "Read'me.md");
  await writeFile(source, "Flat skill");
  await writeFile(join(global, "other.md"), "Unrelated");
  const destination = await copySkillToRepo(client, { id: "Read'me", path: source }, location, home);
  assert.deepEqual(await readdir(destination), ["SKILL.md"]);
  assert.equal(await readFile(join(destination, "SKILL.md"), "utf8"), "Flat skill");
}));

test("refuses existing copies, including empty directories and symlinks", async () => fixture(async ({ global, home, location, client }) => {
  const source = join(global, "example.md");
  await writeFile(source, "Global");
  const destination = join(location.directory, ".agents", "skills", "example");
  await mkdir(destination, { recursive: true });
  await assert.rejects(copySkillToRepo(client, { id: "example", path: source }, location, home), /already exists/);
  assert.deepEqual(await readdir(destination), []);
  await writeFile(join(destination, "user.md"), "User work");
  await assert.rejects(copySkillToRepo(client, { id: "example", path: source }, location, home), /already exists/);
  assert.equal(await readFile(join(destination, "user.md"), "utf8"), "User work");
  await symlink(global, join(location.directory, ".agents", "skills", "link"));
  await assert.rejects(copySkillToRepo(client, { id: "link", path: source }, location, home), /already exists/);
}));

test("concurrent copies cannot overwrite each other", async () => fixture(async ({ global, home, location, client }) => {
  const source = join(global, "example.md");
  await writeFile(source, "Global");
  const results = await Promise.allSettled(Array.from({ length: 2 }, () =>
    copySkillToRepo(client, { id: "example", path: source }, location, home)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
}));

test("refuses repo/virtual sources and unsafe IDs before starting any shell", async () => fixture(async ({ home, global, location, client, calls }) => {
  for (const skill of [
    { id: "example", path: "skill://example" },
    { id: "example", path: join(location.directory, ".agents", "skills", "example", "SKILL.md") },
    ...["../escape", ".hidden", "bad/name", "bad\\name", "bad\nname", ""].map((id) => ({ id, path: join(global, "source.md") })),
  ]) await assert.rejects(copySkillToRepo(client, skill, location, home));
  await assert.rejects(copySkillToRepo(client, { id: "example", path: join(global, "source.md") }, {}, home));
  assert.equal(calls.length, 0);
}));

test("refuses destination parent symlinks and does not write outside the repo", async () => fixture(async ({ global, home, location, client }) => {
  const source = join(global, "example.md");
  await writeFile(source, "Global");
  await symlink(global, join(location.directory, ".agents"));
  await assert.rejects(copySkillToRepo(client, { id: "example", path: source }, location, home), /regular directory/);
  assert.deepEqual(await readdir(global), ["example.md"]);
}));

test("dereferences source directory symlinks into an independent repo copy", async () => fixture(async ({ global, home, location, client }) => {
  const source = join(global, "real");
  await mkdir(source);
  await writeFile(join(source, "SKILL.md"), "Instructions");
  await symlink(source, join(global, "linked"));
  const destination = await copySkillToRepo(client, { id: "linked", path: join(global, "linked", "SKILL.md") }, location, home);
  assert.ok(!(await lstat(destination)).isSymbolicLink());
  assert.equal(await readFile(join(destination, "SKILL.md"), "utf8"), "Instructions");
}));

test("waits for a running server copy before reporting success", async () => fixture(async ({ global, home, location, client }) => {
  const source = join(global, "example.md");
  await writeFile(source, "Instructions");
  const create = client.shell.create;
  client.shell.create = async (input) => {
    await create(input);
    return { data: { id: "copy", status: "running" } };
  };
  let gets = 0;
  client.shell.get = async (input) => {
    assert.equal(input.id, "copy");
    assert.deepEqual(input.location, location);
    gets++;
    return { data: { id: "copy", status: "exited", exit: 0 } };
  };
  await copySkillToRepo(client, { id: "example", path: source }, location, home);
  assert.equal(gets, 1);
}));

test("missing sources fail without creating a repo destination", async () => fixture(async ({ global, home, location, client }) => {
  await assert.rejects(copySkillToRepo(client, { id: "missing", path: join(global, "missing.md") }, location, home));
  assert.deepEqual(await readdir(location.directory), []);
}));

test("shell metacharacters in a skill ID stay literal folder names", async () => fixture(async ({ global, home, location, client }) => {
  const source = join(global, "example.md");
  await writeFile(source, "Instructions");
  const id = "example; touch PWNED $(echo injected)";
  const destination = await copySkillToRepo(client, { id, path: source }, location, home);
  assert.equal(await readFile(join(destination, "SKILL.md"), "utf8"), "Instructions");
  assert.deepEqual(await readdir(location.directory), [".agents", ".opencode"]);
}));

test("registers the repo source and verifies that it supersedes the global skill", async () => fixture(async ({ global, home, location, client }) => {
  const source = join(global, "example.md");
  await writeFile(source, "Instructions");
  const destination = await copySkillToRepo(client, { id: "example", path: source }, location, home);
  const selected = (await client.skill.list({ location })).data.find((skill) => skill.id === "example");
  assert.equal(selected.path, join(destination, "SKILL.md"), "OpenCode must select the repo definition, not just copy files");
}));

test("preserves JSONC comments and unrelated config without logging config contents", async () => fixture(async ({ global, home, location, client, calls }) => {
  const source = join(global, "example.md");
  await writeFile(source, "Instructions");
  const config = '{ // keep this comment\n "providers": {"custom": {"settings": {"apiKey": "FAKE_TEST_SECRET"}}},\n "skills": ["./other-skills",],\n}\n';
  await mkdir(join(location.directory, ".opencode"));
  const configPath = join(location.directory, ".opencode", "opencode.jsonc");
  await writeFile(configPath, config);
  await copySkillToRepo(client, { id: "example", path: source }, location, home);
  const updated = await readFile(configPath, "utf8");
  assert.ok(updated.includes("// keep this comment"));
  assert.equal(parse(updated).providers.custom.settings.apiKey, "FAKE_TEST_SECRET");
  assert.deepEqual(parse(updated).skills, ["./other-skills", "./.agents/skills"]);
  assert.ok(!calls[0].command.includes("FAKE_TEST_SECRET"), "Existing config is not exposed in shell logs");
  assert.ok(!calls[0].command.includes("./other-skills"), "Existing skill sources are not copied into the command");
}));

test("supports existing JSON config and does not duplicate the last repo source", async () => fixture(async ({ global, home, location, client }) => {
  await mkdir(join(location.directory, ".opencode"));
  const configPath = join(location.directory, ".opencode", "opencode.json");
  const original = JSON.stringify({ skills: ["./.agents/skills"], default_agent: "build" });
  await writeFile(configPath, original);
  const source = join(global, "example.md");
  await writeFile(source, "Instructions");
  await copySkillToRepo(client, { id: "example", path: source }, location, home);
  assert.equal(await readFile(configPath, "utf8"), original);
}));

test("rejects invalid config before copying files", async () => fixture(async ({ global, home, location, client, calls }) => {
  await mkdir(join(location.directory, ".opencode"));
  const configPath = join(location.directory, ".opencode", "opencode.jsonc");
  await writeFile(configPath, "{ invalid JSONC }");
  const source = join(global, "example.md");
  await writeFile(source, "Instructions");
  await assert.rejects(copySkillToRepo(client, { id: "example", path: source }, location, home), /invalid project config/);
  assert.equal(calls.length, 0);
  assert.deepEqual(await readdir(location.directory), [".opencode"]);
}));

test("does not overwrite config edited while the copy is running", async () => fixture(async ({ global, home, location, client }) => {
  await mkdir(join(location.directory, ".opencode"));
  const configPath = join(location.directory, ".opencode", "opencode.jsonc");
  await writeFile(configPath, '{"skills": []}');
  const create = client.shell.create;
  client.shell.create = async (input) => {
    await writeFile(configPath, '{"skills": [], "user_edit": true}');
    return create(input);
  };
  const source = join(global, "example.md");
  await writeFile(source, "Instructions");
  await assert.rejects(copySkillToRepo(client, { id: "example", path: source }, location, home), /config changed/);
  assert.equal(parse(await readFile(configPath, "utf8")).user_edit, true);
}));

test("waits for server rediscovery instead of immediately claiming repo precedence", async () => fixture(async ({ global, home, location, client }) => {
  const list = client.skill.list;
  let reads = 0;
  client.skill.list = async (input) => ++reads <= 2
    ? { data: [{ id: "example", path: join(global, "example.md") }] } : list(input);
  const source = join(global, "example.md");
  await writeFile(source, "Instructions");
  await copySkillToRepo(client, { id: "example", path: source }, location, home);
  assert.equal(reads, 3);
}));

test("preserves BOMs and non-ASCII text when applying config edit offsets", async () => fixture(async ({ global, home, location, client }) => {
  await mkdir(join(location.directory, ".opencode"));
  const configPath = join(location.directory, ".opencode", "opencode.jsonc");
  await writeFile(configPath, '\uFEFF{ "instructions": ["docs/überblick.md"], "skills": [] }');
  const source = join(global, "example.md");
  await writeFile(source, "Instructions");
  await copySkillToRepo(client, { id: "example", path: source }, location, home);
  const updated = await readFile(configPath, "utf8");
  assert.ok(updated.startsWith("\uFEFF"));
  assert.equal(parse(updated.slice(1)).instructions[0], "docs/überblick.md");
  assert.deepEqual(parse(updated.slice(1)).skills, ["./.agents/skills"]);
}));

test("retries a temporarily unavailable skill registry during server rediscovery", async () => fixture(async ({ global, home, location, client }) => {
  const list = client.skill.list;
  let reads = 0;
  client.skill.list = async (input) => {
    if (++reads === 1) throw { _tag: "ServiceUnavailableError" };
    return list(input);
  };
  const source = join(global, "example.md");
  await writeFile(source, "Instructions");
  await copySkillToRepo(client, { id: "example", path: source }, location, home);
  assert.equal(reads, 2);
}));
