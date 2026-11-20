import assert from "node:assert/strict";
import { RGBA } from "@opentui/core";
import { Portal, testRender, useRenderer } from "@opentui/solid";
import { createSignal, onCleanup, Show } from "solid-js";
import { createStore, produce } from "solid-js/store";
import plugin from "./tui";
import { skillUsageColor } from "../sidebar-info/skills.mjs";
import { UsageBar } from "../context-inspector/usage-bar";

const location = { directory: "/test/project" };
const [route, setRoute] = createSignal<any>({ type: "session", sessionID: "main" });
const [mode, setMode] = createSignal("normal");
const [mounted, setMounted] = createSignal(true);
const [contextVisible, setContextVisible] = createSignal(true);
const [busyVisible, setBusyVisible] = createSignal(true);
const [statuses, setStatuses] = createStore({ child: "running", idle: "idle" });
const baseFamily = ["main", "child", "idle", "unrelated"];
const [family, setFamily] = createSignal(baseFamily);
const sessions: Record<string, any> = {
  main: { id: "main", location }, child: { id: "child", parentID: "main", title: "Research worker", location },
  idle: { id: "idle", parentID: "main", title: "Finished worker", location },
  unrelated: { id: "unrelated", location },
  ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`extra-${index}`, {
    id: `extra-${index}`, parentID: "main", title: `Extra worker ${index}`, location,
  }])),
};
const shell = { id: "shell", status: "running", command: "npm run build", cwd: location.directory, metadata: { sessionID: "main" }, time: { started: 1 } };
const [shells, setShells] = createSignal<any[]>([shell]);
let output = "Build output from selected shell";
let exited = false;
let slot;
let page;
let unregistered = 0;
let interrupted = 0;
const layers = new Set<() => any>();
const goalListeners = new Set<(event: any) => void>();
const reconnectListeners = new Set<() => void>();
const goals = new Map<string, any>();
const goalCommands: any[] = [];
const toasts: any[] = [];
let commandError = false;
let commandGate: Promise<void> | undefined;
const exampleGoal = { id: "goal", objective: "Consistent plugin appearance", status: "active", rounds: 1, maxRounds: 50, boot: "server", updatedAt: 10 };
const [dialog, setDialog] = createSignal<() => any>();
let onDialogClose: (() => void) | undefined;
const closeDialog = () => { setDialog(undefined); const close = onDialogClose; onDialogClose = undefined; close?.(); };
function goalChanged(value: any, sessionID = "main", directory = location.directory) {
  if (directory === location.directory) goals.set(sessionID, value);
  for (const callback of goalListeners) callback({ created: Date.now(), location: { directory }, data: { sessionID, goal: value } });
}

function Host() {
  const renderer = useRenderer();
  const handleKey = (event) => {
    if (dialog() && event.name === "escape") { event.preventDefault(); closeDialog(); return; }
    const command = [...layers].map((factory) => factory()).filter((layer) => !layer.enabled || layer.enabled())
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .flatMap((layer) => layer.commands ?? []).find((command) => command.bind === event.name);
    if (command) { event.preventDefault(); command.run(); }
    else if (event.name === "escape") interrupted++;
  };
  renderer.keyInput.on("keypress", handleKey);
  const stop = plugin.setup({
    renderer, location,
    storage: { memory: (_key, { initial }) => {
      const [state, setState] = createStore(initial);
      return [state, (mutation) => setState(produce(mutation))];
    } },
    theme: { text: { base: "#ffffff", muted: "#888888" }, border: { base: "#888888" }, background: { raised: { base: "#222222" } } },
    data: {
      on: (name, callback) => { assert.equal(name, "server.connected"); reconnectListeners.add(callback); return () => { reconnectListeners.delete(callback); }; },
       session: { get: (id) => sessions[id], family, status: (id) => id.startsWith("extra-") ? "running" : statuses[id] ?? "idle" },
      shell: { list: () => shells(), sync: async () => {} }, location: { default: () => location },
    },
    client: {
      rpc: (definition) => {
        assert.equal(definition.id, "opencode.goal", "Use the published first-party goal contract");
        return {
          get: async ({ sessionID }, options) => { assert.deepEqual(options.location, location); return goals.get(sessionID) ?? null; },
          events: { on: (name, callback) => { assert.equal(name, "changed"); goalListeners.add(callback); return () => { goalListeners.delete(callback); }; } },
        };
      },
      session: { command: async (input, options) => {
        goalCommands.push({ input, options });
        assert.equal(input.name, "goal");
        assert.ok(options.signal instanceof AbortSignal);
        if (commandGate) await commandGate;
        if (commandError) throw Error("Command unavailable");
        const current = goals.get(input.sessionID);
        goals.set(input.sessionID, input.text === "clear" ? null : { ...current, status: input.text === "pause" ? "paused" : "active" });
      } },
      shell: {
      get: async ({ id, location: at }) => { assert.equal(id, shell.id); assert.deepEqual(at, location); return { data: { ...shell, status: exited ? "exited" : "running", exit: exited ? 0 : undefined } }; },
      output: async ({ cursor, limit = 65536, location: at }) => {
        assert.deepEqual(at, location);
        return { data: { output: output.slice(cursor, cursor + limit), cursor: Math.min(output.length, cursor + limit), size: output.length } };
      },
    } },
    keymap: {
      layer: (factory) => { layers.add(factory); onCleanup(() => layers.delete(factory)); },
    },
    ui: {
      toast: { show: (toast) => toasts.push(toast) },
      router: { current: route, navigate: setRoute, register: (definition) => { page = definition; return () => { page = undefined; unregistered++; }; } },
      slot: (definition) => { assert.equal(definition.before, "prompt.footer"); assert.ok(!definition.replace); slot = definition; return () => { unregistered++; }; },
      dialog: {
        show: (render, onClose) => { closeDialog(); onDialogClose = onClose; setDialog(() => render); },
        set: (options) => { assert.deepEqual(options, { size: "large", centered: true }); },
        clear: closeDialog,
      },
    },
  });
  onCleanup(() => { stop(); renderer.keyInput.off("keypress", handleKey); });
  return <>
    <Show when={route().type === "session"} fallback={<Show when={page}>{() => page.render({})}</Show>}>
      <box width="100%" height="100%" flexDirection="column">
        <text>{route().sessionID === "child" ? "CHILD WORK AND TRANSCRIPT" : "MAIN TRANSCRIPT"}</text>
        <box flexGrow={1} />
        <box flexDirection="row" height={1} gap={2}>
           <Show when={busyVisible()}><text flexShrink={0}>BUSY</text></Show>
          {slot.render({ get sessionID() { return route().sessionID; }, get mode() { return mode(); }, showDetails: true })}
           <Show when={contextVisible()}><UsageBar sessionID={route().sessionID} mode={mode()} onToggle={() => {}} /></Show>
        </box>
      </box>
    </Show>
    <Show when={dialog()}>{(render) => (
      <Portal mount={renderer.root} ref={(container: any) => {
        container.position = "absolute"; container.width = 0; container.height = 0; container.zIndex = 1100;
      }}>
        <box position="absolute" left={5} top={2} width={80} height={20} zIndex={1100} backgroundColor="#222222">{render()()}</box>
      </Portal>
    )}</Show>
  </>;
}

const setup = await testRender(() => <Show when={mounted()}><Host /></Show>, { width: 100, height: 24 });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const find = (text: string) => {
  const lines = setup.captureCharFrame().split("\n");
  const y = lines.findIndex((line) => line.includes(text));
  assert.ok(y >= 0, `Expected visible text: ${text}`);
  return { x: lines[y].indexOf(text), y };
};
const hover = async (text: string) => {
  const at = find(text);
  await setup.mockMouse.moveTo(0, 0);
  await setup.mockMouse.moveTo(at.x + Math.min(1, text.length - 1), at.y);
  await wait(320); await setup.renderOnce();
};
const click = async (text: string, button = 0) => { const at = find(text); await setup.mockMouse.click(at.x + Math.min(2, text.length - 1), at.y, button); await setup.renderOnce(); };
const escape = async () => { setup.mockInput.pressEscape(); await wait(40); await setup.renderOnce(); };
let phase = "existing counters";

try {
  assert.equal(slot.before, "prompt.footer", "Activity always lives outside the replaceable standard footer");
  await setup.renderOnce();
  let frame = setup.captureCharFrame();
  const footer = frame.split("\n").find((line) => line.includes("Context"));
  assert.ok(footer.includes("BUSY") && footer.includes("1 ⧉ · 1 ❯_"));
  assert.ok(footer.indexOf("1 ❯_") < footer.indexOf("Context"), "Counters directly precede custom context on one row");
  const findNode = (node, text) => node.plainText === text ? node : node.getChildren().map((child) => findNode(child, text)).find(Boolean);
  const findGroup = (node) => node.id === "local.activity-status.indicators" ? node
    : node.getChildren().map(findGroup).find(Boolean);
  const assertRightAligned = (last = "1 ❯_") => {
    const group = findGroup(setup.renderer.root);
    assert.ok(group, "Activity always reserves its fixed slots");
    assert.equal(group.width, 14, "Three slots and their middle-dot separators always occupy fourteen columns");
    if (last) {
      const lastNode = findNode(setup.renderer.root, last);
      assert.ok(lastNode, "Expected indicator is visible");
      assert.equal(lastNode.x - group.x, last.includes("⧉") ? 0 : last.includes("❯_") ? 6 : 13,
        "Each indicator retains its assigned column");
    }
    if (contextVisible()) {
      const contextLabel = findNode(setup.renderer.root, "Context");
      assert.equal(contextLabel.x - (group.x + group.width), 3,
        "Activity ends immediately left of Context, with the row gap and Context padding only");
      const cost = findNode(setup.renderer.root, " ($1.23)");
      assert.equal(cost.x + cost.width, setup.renderer.width, "Context remains rightmost");
    } else {
      assert.equal(group.x + group.width, setup.renderer.width, "Without Context, Activity ends at the right edge");
    }
  };
  assertRightAligned();
  setContextVisible(false); await setup.renderOnce(); assertRightAligned();
  setBusyVisible(false); await setup.renderOnce(); assertRightAligned();
  setContextVisible(true); await setup.renderOnce(); assertRightAligned();
  setBusyVisible(true); await setup.renderOnce(); assertRightAligned();
  const originalGroupX = findGroup(setup.renderer.root).x;
  const originalContextX = find("Context").x;
  for (const hasSub of [false, true]) {
    for (const hasShell of [false, true]) {
      for (const hasGoal of [false, true]) {
        setStatuses("child", hasSub ? "running" : "idle");
        setShells(hasShell ? [shell] : []);
        goalChanged(hasGoal ? exampleGoal : null);
        await setup.renderOnce();
        assertRightAligned(hasGoal ? "⚑" : hasShell ? "1 ❯_" : hasSub ? "1 ⧉" : "");
        const group = findGroup(setup.renderer.root);
        assert.equal(group.x, originalGroupX, "Showing/hiding any indicator never moves the group");
        assert.equal(find("Context").x, originalContextX, "Showing/hiding any indicator never moves Context");
        const row = setup.captureCharFrame().split("\n")[group.y];
        assert.equal(row.slice(group.x, group.x + 14),
          `${hasSub ? "1 ⧉" : "0 ⧉"}${hasSub && hasShell ? " · " : "   "}${hasShell ? "1 ❯_" : "0 ❯_"}${hasShell && hasGoal ? " · " : "   "}⚑`,
          "Indicators keep their slots; each dot is visible only when both adjacent indicators are active");
        for (const [label, active] of [["0 ⧉", hasSub], ["0 ❯_", hasShell], ["⚑", hasGoal]] as const) {
          if (!active) assert.deepEqual(findNode(setup.renderer.root, label).fg, RGBA.fromHex("#333333"), "Inactive indicators use ghostly dark gray");
        }
        if (!hasSub && !hasShell && !hasGoal) {
          const commandsBefore = goalCommands.length;
          for (const label of ["0 ⧉", "0 ❯_", "⚑"]) {
            await hover(label);
            assert.deepEqual(findNode(setup.renderer.root, label).fg, RGBA.fromHex("#333333"), "Inactive indicators stay dark gray on hover");
            await click(label);
          }
          assert.ok(!setup.captureCharFrame().includes("Subagents ·") && !setup.captureCharFrame().includes("Shells ·") && !setup.captureCharFrame().includes("Goal ·"), "Ghost slots do not open hover cards");
          assert.equal(dialog(), undefined, "Ghost goal does not open details");
          assert.equal(goalCommands.length, commandsBefore, "Ghost goal does not run commands");
          assert.equal(route().sessionID, "main", "Ghost counters do not navigate");
        }
      }
    }
  }
  for (const count of [9, 10, 11]) {
    // Ten descendant workers are sufficient to test the subagent X threshold;
    // eleven shells separately verify that larger totals still use one cell.
    setFamily([...baseFamily, ...Array.from({ length: Math.min(count, 10) - 1 }, (_, index) => `extra-${index}`)]);
    setShells(Array.from({ length: count }, (_, index) => ({ ...shell, id: `shell-${index}` })));
    await setup.renderOnce();
    const label = count > 9 ? "X" : "9";
    assertRightAligned(`${label} ❯_`);
    const group = findGroup(setup.renderer.root);
    const row = setup.captureCharFrame().split("\n")[group.y];
    assert.equal(row.slice(group.x, group.x + 14), `${label} ⧉ · ${label} ❯_ · ⚑`);
    assert.equal(group.x, originalGroupX, "Multi-digit totals do not move any indicator");
  }
  setFamily(baseFamily); setStatuses("child", "running"); setShells([shell]); goalChanged(null);
  await setup.renderOnce();
  assert.deepEqual(findNode(setup.renderer.root, "1 ⧉").fg, RGBA.fromHex("#228B22"), "Subagent counter uses Skills sidebar dark green normally");
  assert.deepEqual(findNode(setup.renderer.root, "1 ❯_").fg, RGBA.fromHex("#228B22"), "Shell counter uses Skills sidebar dark green normally");
  assert.deepEqual(findNode(setup.renderer.root, "1 ⧉").fg, RGBA.fromHex(skillUsageColor(1, {})), "Normal palette matches the Skills plugin");
  await hover("1 ⧉");
  assert.deepEqual(findNode(setup.renderer.root, "1 ⧉").fg, RGBA.fromHex("#86EFAC"), "Subagent counter uses Skills sidebar light green on hover");
  assert.deepEqual(findNode(setup.renderer.root, "1 ⧉").fg, RGBA.fromHex(skillUsageColor(3, {})), "Hover palette matches the Skills plugin");
  assert.equal(find("Research worker").y, find("Subagents ·").y + 2, "Blank row separates subagent help from entries");
  assert.ok(setup.captureCharFrame().includes("Research worker"));
  assert.ok(setup.captureCharFrame().includes("Finished worker"), "Completed subagents remain inspectable");
  assert.ok(setup.captureCharFrame().includes("MAIN TRANSCRIPT"), "Hover floats, without moving the transcript");
  await click("Research worker", 2);
  assert.equal(route().sessionID, "main", "Right clicks do not navigate");
  await click("Research worker");
  assert.equal(route().sessionID, "child");
  assert.ok(setup.captureCharFrame().includes("CHILD WORK AND TRANSCRIPT"));
  assert.ok(setup.captureCharFrame().includes("Context"), "Native child route retains other plugins, including context");
  await escape(); assert.equal(route().sessionID, "main"); assert.equal(interrupted, 0, "Esc returns without interrupting work");
  await hover("1 ⧉");
  const card = find("Research worker");
  await setup.mockMouse.moveTo(card.x, card.y); await wait(200); await setup.renderOnce();
  assert.deepEqual(findNode(setup.renderer.root, "1 ⧉").fg, RGBA.fromHex("#228B22"), "Counter returns to normal green when pointer leaves it");
  assert.ok(setup.captureCharFrame().includes("Research worker"), "Card remains clickable while hovered");
  await escape();
  assert.ok(!setup.captureCharFrame().includes("Research worker"), "Esc dismisses hover without interrupting the main session");
  await hover("1 ❯_");
  assert.deepEqual(findNode(setup.renderer.root, "1 ❯_").fg, RGBA.fromHex("#86EFAC"), "Shell counter uses Skills sidebar light green on hover");
  assert.equal(find("npm run build").y, find("Shells ·").y + 2, "Blank row separates shell help from entries");
  await click("npm run build");
  assert.equal(route().type, "plugin");
  await wait(20); await setup.renderOnce();
  assert.ok(setup.captureCharFrame().includes(output));
  output += "\nBuild completed successfully"; exited = true;
  await wait(1100); await setup.renderOnce();
  assert.ok(setup.captureCharFrame().includes("Build completed successfully"));
  assert.ok(setup.captureCharFrame().includes("exit 0"), "Viewer stays open and updates through command exit");
  await escape(); assert.equal(route().sessionID, "main");
  setStatuses("child", "idle"); setShells([{ ...shell, status: "exited" }]);
  await setup.renderOnce();
  assert.ok(setup.captureCharFrame().includes("0 ⧉") && setup.captureCharFrame().includes("0 ❯_"), "Both zero counters become ghosts, even with completed subagents");
  assert.equal(findNode(setup.renderer.root, " ($1.23)").x + findNode(setup.renderer.root, " ($1.23)").width, 100, "Context stays right-aligned when every activity slot is inactive");
  setShells([shell]); await setup.renderOnce();
  assert.ok(setup.captureCharFrame().includes("1 ❯_") && setup.captureCharFrame().includes("0 ⧉"), "Shell-only activity keeps the subagent ghost");
  assertRightAligned();
  await hover("1 ❯_");
  assert.ok(setup.captureCharFrame().includes("npm run build"));
  setShells([]); await setup.renderOnce();
  assert.ok(!setup.captureCharFrame().includes("Shells ·"), "The last shell exiting dismisses its open hover");
  setShells([shell]); await setup.renderOnce();
  const pendingShell = find("1 ❯_");
  await setup.mockMouse.moveTo(pendingShell.x, pendingShell.y);
  setShells([]); await wait(320); await setup.renderOnce();
  assert.ok(!setup.captureCharFrame().includes("Shells ·"), "A disappearing counter also cancels a pending hover");
  setStatuses("child", "running"); await setup.renderOnce();
  assert.ok(setup.captureCharFrame().includes("1 ⧉") && setup.captureCharFrame().includes("0 ❯_"), "Subagent-only activity keeps the shell ghost");
  assertRightAligned("1 ⧉");
  await hover("1 ⧉");
  setStatuses("child", "idle"); await setup.renderOnce();
  assert.ok(!setup.captureCharFrame().includes("Research worker"), "The last worker becoming idle dismisses its open hover");
  setStatuses("child", "running"); setShells([shell]); await setup.renderOnce();
  assert.ok(setup.captureCharFrame().includes("1 ⧉ · 1 ❯_"), "Both indicators reappear when activity resumes");
  await hover("1 ⧉");
  setup.renderer.resize(80, 12); await wait(50); await setup.renderOnce();
  assertRightAligned();
  assert.ok(!setup.captureCharFrame().includes("Research worker"), "Resize dismisses stale hover anchors");
  await hover("1 ⧉");
  const narrowFrame = setup.captureCharFrame();
  assert.ok(narrowFrame.includes("Research worker"), "Hover is still accessible after resizing");
  assert.equal(narrowFrame.split("\n").filter((line) => line.includes("1 ⧉ · 1 ❯_")).length, 1, "Counters remain on one row");
  setup.renderer.emit("blur"); await setup.renderOnce();
  assert.ok(!setup.captureCharFrame().includes("Research worker"), "Blur dismisses the card");
  setup.renderer.resize(100, 24); await wait(50); await setup.renderOnce();
  setStatuses("child", "idle"); setShells([]); await setup.renderOnce();
  goalChanged(exampleGoal); await setup.renderOnce();
  phase = "goal-only preview";
  assert.ok(setup.captureCharFrame().includes("⚑") && setup.captureCharFrame().includes("0 ⧉") && setup.captureCharFrame().includes("0 ❯_"), "Goal-only activity keeps both counter ghosts");
  assertRightAligned("⚑");
  setStatuses("child", "running"); setShells([shell]); await setup.renderOnce();
  assertRightAligned("⚑");
  setContextVisible(false); await setup.renderOnce(); assertRightAligned("⚑");
  setContextVisible(true); setStatuses("child", "idle"); setShells([]); await setup.renderOnce();
  assertRightAligned("⚑");
  assert.deepEqual(findNode(setup.renderer.root, "⚑").fg, RGBA.fromHex("#228B22"), "Goal uses the same default green");
  await hover("⚑");
  assert.deepEqual(findNode(setup.renderer.root, "⚑").fg, RGBA.fromHex("#86EFAC"), "Goal uses the same hover green");
  assert.equal(find("Status: Active").y, find("Goal · Pause").y + 2, "Goal preview has the same blank row below help");
  assert.ok(setup.captureCharFrame().includes(exampleGoal.objective));
  assert.ok(setup.captureCharFrame().includes("Continuations: 1 / 50"));
  assert.equal(goalCommands.length, 0, "Viewing a goal does not issue commands");
  phase = "goal hover actions";
  await click("Pause", 2);
  assert.equal(goalCommands.length, 0, "Right clicking Pause does nothing");
  let releaseCommand: () => void;
  commandGate = new Promise<void>((resolve) => { releaseCommand = resolve; });
  await click("Pause");
  assert.deepEqual(goalCommands.at(-1).input, { sessionID: "main", name: "goal", text: "pause" });
  assert.ok(setup.captureCharFrame().includes("Working…"));
  assert.ok(setup.captureCharFrame().includes("Status: Active"), "Status is not changed optimistically");
  await click("Clear");
  assert.equal(goalCommands.length, 1, "Other actions cannot overlap a pending command");
  releaseCommand(); commandGate = undefined;
  await wait(20); await setup.renderOnce();
  assert.ok(setup.captureCharFrame().includes("Goal · Resume") && setup.captureCharFrame().includes("Status: Paused"), "Command success refreshes without requiring an event or dismissing the hover");
  assert.deepEqual(findNode(setup.renderer.root, "⚑").fg, RGBA.fromHex("#EAB308"), "Paused flag is yellow normally");
  await hover("⚑");
  assert.deepEqual(findNode(setup.renderer.root, "⚑").fg, RGBA.fromHex("#FDE047"), "Paused flag uses light yellow on hover");
  await click("Resume"); await wait(20); await setup.renderOnce();
  assert.deepEqual(goalCommands.at(-1).input, { sessionID: "main", name: "goal", text: "resume" });
  assert.ok(setup.captureCharFrame().includes("Status: Active") && setup.captureCharFrame().includes("Goal · Pause"));
  assert.deepEqual(findNode(setup.renderer.root, "⚑").fg, RGBA.fromHex("#228B22"), "Resume restores the normal green");
  commandError = true;
  await click("Clear"); await wait(20); await setup.renderOnce();
  assert.ok(setup.captureCharFrame().includes("Status: Active"), "Failed clear preserves the displayed goal");
  assert.equal(toasts.at(-1).variant, "error");
  assert.equal(toasts.at(-1).message, "Could not clear the goal.");
  commandError = false;
  await escape(); assert.equal(interrupted, 0);
  phase = "goal details dialog";
  await click("⚑", 2); assert.equal(dialog(), undefined, "Right click cannot open goal details");
  await click("⚑"); assert.ok(dialog(), "Goal click opens read-only details without navigating");
  assert.ok(setup.captureCharFrame().includes("⚑ Goal · read-only · Esc close"));
  assert.equal(route().sessionID, "main");
  goalChanged({ ...exampleGoal, status: "paused", reason: "Waiting for review" }); await setup.renderOnce();
  assert.ok(setup.captureCharFrame().includes("Status: Paused") && setup.captureCharFrame().includes("Waiting for review"), "Open details update live");
  await escape(); assert.equal(dialog(), undefined); assert.equal(interrupted, 0);
  goalChanged({ ...exampleGoal, status: "complete", reason: "Objective met" }); await setup.renderOnce();
  phase = "goal completion and clear";
  await hover("⚑"); assert.ok(setup.captureCharFrame().includes("Status: Met"));
  assert.ok(!setup.captureCharFrame().includes("Pause") && !setup.captureCharFrame().includes("Resume"), "Met goals only offer Clear");
  await click("Clear"); await wait(20); await setup.renderOnce();
  assert.deepEqual(goalCommands.at(-1).input, { sessionID: "main", name: "goal", text: "clear" });
  assert.deepEqual(findNode(setup.renderer.root, "⚑").fg, RGBA.fromHex("#333333"), "Clearing restores the ghost goal");
  assert.ok(!setup.captureCharFrame().includes("Goal ·"), "Clearing dismisses the goal hover");
  assert.equal(findNode(setup.renderer.root, " ($1.23)").x + findNode(setup.renderer.root, " ($1.23)").width, 100, "Context stays right-aligned when the goal disappears");
  goalChanged(exampleGoal); setStatuses("child", "running"); setShells([shell]); await setup.renderOnce();
  phase = "goal with counters and reconnect";
  assert.ok(setup.captureCharFrame().includes("1 ⧉ · 1 ❯_ · ⚑"), "All three indicators share one compact row");
  goals.set("main", null);
  for (const reconnect of reconnectListeners) reconnect();
  await wait(20); await setup.renderOnce();
  assert.deepEqual(findNode(setup.renderer.root, "⚑").fg, RGBA.fromHex("#333333"), "Reconnect rereads goal state and restores its ghost");
  goalChanged(exampleGoal); await setup.renderOnce(); await hover("⚑");
  commandGate = new Promise<void>((resolve) => { releaseCommand = resolve; });
  await click("Pause");
  const oldRequest = goalCommands.at(-1);
  setRoute({ type: "session", sessionID: "unrelated" }); await setup.renderOnce();
  assert.equal(oldRequest.options.signal.aborted, true, "Session navigation aborts the pending action");
  commandError = true;
  const toastCount = toasts.length;
  releaseCommand(); commandGate = undefined;
  await wait(20); await setup.renderOnce();
  commandError = false;
  assert.equal(toasts.length, toastCount, "Late errors from the old session do not leak into the new session");
  assert.deepEqual(findNode(setup.renderer.root, "⚑").fg, RGBA.fromHex("#333333"), "Late action completion cannot activate the selected session's ghost goal");
  await escape(); assert.equal(interrupted, 1, "Unrelated sessions retain normal Esc behavior");
  setMode("shell"); await setup.renderOnce(); assert.ok(!setup.captureCharFrame().includes("⧉") && !setup.captureCharFrame().includes("❯_"));
  setMounted(false); await setup.renderOnce();
  assert.equal(unregistered, 2); assert.equal(layers.size, 0, "Disable cleans up routes and keymaps");
  assert.equal(goalListeners.size, 0); assert.equal(reconnectListeners.size, 0);
  console.log("PASS: right-aligned fixed fourteen-column Activity with middle dots, noninteractive dark-gray ghost slots, X overflow counts and stable positions; goal hover controls and colors; subagent/Esc navigation; live shell output; reconnect and cleanup.");
} catch (error) {
  console.error(`Renderer test failed during: ${phase}\n${setup.captureCharFrame()}`);
  throw error;
} finally {
  setup.renderer.destroy();
}
