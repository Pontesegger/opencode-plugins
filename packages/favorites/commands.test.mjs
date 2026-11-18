import assert from "node:assert/strict";
import { test } from "node:test";
import { favorites, showAllCommands, submitFavorite } from "./commands.mjs";

test("show all commands dispatches the native palette action without touching the prompt", async () => {
  for (const enabled of [undefined, true, () => true]) {
    const calls = [];
    await showAllCommands({ keymap: {
      commands: () => [{ id: "command.palette.show", enabled }],
      dispatch: (id) => { calls.push(id); },
    } });
    assert.deepEqual(calls, ["command.palette.show"]);
  }
});

test("an unavailable or disabled palette does not dispatch anything", async () => {
  for (const actions of [[], ...[false, () => false].map((enabled) => [
    { id: "command.palette.show", enabled },
  ])]) {
    const calls = [];
    await assert.rejects(showAllCommands({ keymap: {
      commands: () => actions,
      dispatch: (id) => { calls.push(id); },
    } }), /unavailable/);
    assert.deepEqual(calls, []);
  }
});

test("Favorites contains clear and compact in that order", () => {
  assert.deepEqual(favorites, ["clear", "compact"]);
});

test("/compact invokes its registered slash action instead of sending a chat message", async () => {
  const calls = [];
  const editor = { setText() {}, focus() {} };
  await submitFavorite({
    renderer: { currentFocusedEditor: editor },
    keymap: {
      commands: () => [{ id: "host.compaction", slash: { name: "compact" }, run() {} }],
      dispatch(id) { calls.push(id); },
    },
  }, "compact");
  assert.ok(!calls.includes("prompt.submit"), "A favorite must not submit literal /compact as a chat message");
  assert.ok(calls.includes("host.compaction"), "Run the action registered for slash completion");
});

for (const command of favorites) {
  test(`/${command} clears the draft and dispatches its slash action exactly once after focusing`, async () => {
    const calls = [];
    const context = {
      keymap: { commands() {
        assert.deepEqual(calls, [["pane.focus.left"]], "Resolve commands after focusing the prompt");
        return [{ id: `host.${command}`, slash: { name: command }, run() {} }];
      }, async dispatch(id) {
        calls.push([id]);
      } },
    };
    await submitFavorite(context, command);
    assert.deepEqual(calls, [["pane.focus.left"], ["prompt.clear"], [`host.${command}`]]);
  });
}

test("slash aliases resolve to the registered action", async () => {
  const calls = [];
  await submitFavorite({ keymap: {
    commands: () => [{ id: "host.new", slash: { name: "new", aliases: ["clear"] }, run() {} }],
    dispatch: (id) => { calls.push(id); },
  } }, "clear");
  assert.deepEqual(calls, ["pane.focus.left", "prompt.clear", "host.new"]);
});

test("unavailable or disabled commands never clear or submit the draft", async () => {
  for (const actions of [[], ...[false, () => false].map((enabled) => [
    { id: "host.compaction", slash: { name: "compact" }, enabled, run() {} },
  ])]) {
    const calls = [];
    await assert.rejects(submitFavorite({ keymap: {
      commands: () => actions,
      dispatch: (id) => { calls.push(id); },
    } }, "compact"), /unavailable/);
    assert.deepEqual(calls, ["pane.focus.left"]);
  }
});

test("commands accepting arguments populate the prompt without running or submitting", async () => {
  const calls = [];
  const editor = {
    setText(text) { calls.push(["text", text]); },
    focus() { calls.push(["focus"]); },
  };
  await submitFavorite({
    renderer: { currentFocusedEditor: editor },
    keymap: {
      commands: () => [{ id: "host.compaction", slash: { name: "compact", arguments: true }, run() {} }],
      dispatch: (id) => { calls.push([id]); },
    },
  }, "compact");
  assert.deepEqual(calls, [["pane.focus.left"], ["prompt.clear"], ["text", "/compact "], ["focus"]]);
});

test("an unavailable or destroyed editor never clears argument-taking commands", async () => {
  for (const editor of [undefined, { isDestroyed: true }]) {
    const calls = [];
    await assert.rejects(submitFavorite({
      renderer: { currentFocusedEditor: editor },
      keymap: {
        commands: () => [{ id: "host.new", slash: { name: "clear", arguments: true }, run() {} }],
        dispatch: (id) => { calls.push(id); },
      },
    }, "clear"), /unavailable/);
    assert.deepEqual(calls, ["pane.focus.left"]);
  }
});

test("unknown commands never touch the prompt", async () => {
  await assert.rejects(submitFavorite({}, "other"), /Unknown/);
});
