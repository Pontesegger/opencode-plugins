import { isAbsolute, join } from "node:path";
import { skillScope } from "./skills.mjs";
import { createHash } from "node:crypto";
import { modify, parse } from "jsonc-parser";

const repoSource = "./.agents/skills";

async function configEdits(client, location) {
  const plans = [];
  for (const path of [".opencode/opencode.json", ".opencode/opencode.jsonc"]) {
    let bytes;
    try { bytes = await client.file.read({ location, path }); }
    catch (error) { if (error?._tag === "FileNotFoundError") continue; throw error; }
    const decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    const prefix = decoded.startsWith("\uFEFF") ? 1 : 0;
    const text = decoded.slice(prefix);
    const errors = [];
    const config = parse(text, errors, { allowTrailingComma: true });
    if (errors.length || !config || Array.isArray(config) || typeof config !== "object"
      || (config.skills !== undefined && !Array.isArray(config.skills))) {
      throw new Error("Cannot register repo skills: invalid project config at " + path);
    }
    const edits = config.skills?.at(-1) === repoSource ? [] : modify(text,
      config.skills ? ["skills", -1] : ["skills"], config.skills ? repoSource : [repoSource], {
        isArrayInsertion: true,
      });
    // Only send edit offsets/new text and a digest to the shell. Existing config
    // may contain credentials and must never become part of a logged command.
    plans.push({ path, hash: createHash("sha256").update(bytes).digest("hex"),
      edits: edits.map((edit) => ({ ...edit, offset: edit.offset + prefix })) });
  }
  if (!plans.length) plans.push({ path: ".opencode/opencode.jsonc", hash: null,
    edits: [{ offset: 0, length: 0, content: JSON.stringify({
      $schema: "https://opencode.ai/config.json", skills: [repoSource],
    }, null, 2) + "\n" }] });
  return plans;
}

// Runs on the connected server, not on the TUI machine. Keep this self-contained
// so its exact implementation can be sent to the server's shell API.
async function copyFiles(source, directory, id, configJSON) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { constants } = await import("node:fs");
  const crypto = await import("node:crypto");
  const plans = JSON.parse(configJSON);
  const root = await fs.realpath(directory);
  const sourceFile = await fs.realpath(source);
  const sourceRoot = await fs.realpath(path.dirname(source));
  const folderSkill = path.basename(source) === "SKILL.md";
  const destination = path.join(root, ".agents", "skills", id);
  if (folderSkill && (destination === sourceRoot || destination.startsWith(sourceRoot + path.sep))) {
    throw new Error("Cannot copy a skill into its own directory");
  }
  if (!(await fs.stat(sourceFile)).isFile()) throw new Error("Skill source is not a file");
  // Never follow destination subfolder symlinks outside the selected repo.
  for (const folder of [path.join(root, ".agents"), path.join(root, ".agents", "skills")]) {
    try { await fs.mkdir(folder); } catch (error) { if (error.code !== "EEXIST") throw error; }
    const stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Destination subfolder is not a regular directory");
  }
  // Exclusive mkdir is the ownership boundary: an existing copy (even an empty
  // folder or symlink) is never merged, replaced, or removed.
  try { await fs.mkdir(destination); } catch (error) {
    if (error.code === "EEXIST") throw new Error("A repo copy already exists; nothing was overwritten");
    throw error;
  }
  try {
    if (folderSkill) {
      for (const name of await fs.readdir(sourceRoot)) {
        await fs.cp(path.join(sourceRoot, name), path.join(destination, name), {
          recursive: true, force: false, errorOnExist: true,
          dereference: true, preserveTimestamps: true,
        });
      }
      await fs.chmod(destination, (await fs.stat(sourceRoot)).mode);
    } else {
      const target = path.join(destination, "SKILL.md");
      await fs.copyFile(sourceFile, target, constants.COPYFILE_EXCL);
      await fs.chmod(target, (await fs.stat(sourceFile)).mode);
    }
  } catch {
    // Do not recursively delete a destination that a human could have edited.
    throw new Error("Copy failed; a partial copy may remain at " + destination);
  }
  const configDirectory = path.join(root, ".opencode");
  try { await fs.mkdir(configDirectory); } catch (error) { if (error.code !== "EEXIST") throw error; }
  if (!(await fs.lstat(configDirectory)).isDirectory()) {
    throw new Error("Skill copied, but .opencode is not a regular directory");
  }
  for (const plan of plans) {
    const target = path.join(root, plan.path);
    let original = "";
    let mode = 0o644;
    if (plan.hash !== null) {
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Skill copied, but config is not a regular file");
      mode = stat.mode;
      original = await fs.readFile(target, "utf8");
      if (crypto.createHash("sha256").update(original).digest("hex") !== plan.hash) {
        throw new Error("Skill copied, but project config changed during the copy; config was not overwritten");
      }
    }
    let updated = original;
    for (const edit of [...plan.edits].sort((left, right) => right.offset - left.offset)) {
      updated = updated.slice(0, edit.offset) + edit.content + updated.slice(edit.offset + edit.length);
    }
    if (plan.hash === null) {
      await fs.writeFile(target, updated, { flag: "wx", mode });
    } else {
      const temporary = path.join(configDirectory, ".skills-config-" + crypto.randomUUID() + ".tmp");
      try {
        await fs.writeFile(temporary, updated, { flag: "wx", mode });
        const current = await fs.readFile(target);
        if (crypto.createHash("sha256").update(current).digest("hex") !== plan.hash) {
          throw new Error("Skill copied, but project config changed; config was not overwritten");
        }
        await fs.rename(temporary, target);
      } finally { await fs.unlink(temporary).catch(() => {}); }
    }
  }
  return destination;
}

const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";

/** Copy a registered global skill on its server, retaining modes and assets. */
export async function copySkillToRepo(client, skill, location, home) {
  if (!location?.directory || !isAbsolute(location.directory)) throw new Error("Session working directory is unavailable");
  if (!skill.path || !isAbsolute(skill.path) || skillScope(skill.path, location.directory, home) !== "Global") {
    throw new Error("Only globally stored skills can be copied to the repo");
  }
  if (typeof skill.id !== "string" || !skill.id || skill.id.startsWith(".") || /[/\\:\x00-\x1f]/.test(skill.id)) {
    throw new Error("Skill ID is not a safe repo folder name");
  }
  const plans = await configEdits(client, location);
  const script = `(${copyFiles.toString()})(...process.argv.slice(1)).then(() => {}, (error) => {
    console.error("[skills-copy] " + error.message); process.exitCode = 1;
  });`;
  const command = `node --input-type=module -e ${quote(script)} ${quote(skill.path)} ${quote(location.directory)} ${quote(skill.id)} ${quote(JSON.stringify(plans))}`;
  const response = await client.shell.create({ location, cwd: location.directory, command, timeout: 30_000 });
  let job = response.data;
  const deadline = Date.now() + 35_000;
  while (job.status === "running" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    job = (await client.shell.get({ id: job.id, location })).data;
  }
  if (job.status !== "exited" || job.exit !== 0) {
    const output = await client.shell.output({ id: job.id, location }).catch(() => undefined);
    const message = output?.data.output.match(/\[skills-copy\] ([^\r\n]+)/)?.[1];
    throw new Error(message ?? "Copy did not finish successfully; a partial repo copy may remain");
  }
  const destination = join(location.directory, ".agents", "skills", skill.id);
  // Config saves trigger server rediscovery. Do not fake a Repo row or reload
  // every server location (which would cancel unrelated forms/permissions).
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const selected = (await client.skill.list({ location })).data.find((entry) => entry.id === skill.id);
      if (selected?.path === join(destination, "SKILL.md")) return destination;
    } catch (error) {
      if (!["ServiceUnavailableError", "LocationNotFoundError"].includes(error?._tag)) {
        throw new Error("Skill copied, but repo activation could not be verified. Use /reload.");
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Skill copied, but OpenCode has not selected the repo version. Use /reload and check project skill sources.");
}
