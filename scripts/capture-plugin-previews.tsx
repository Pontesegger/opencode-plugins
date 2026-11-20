import assert from "node:assert/strict";
import { testRender, useRenderer } from "@opentui/solid";
import { onCleanup } from "solid-js";
import { createStore, produce } from "solid-js/store";
import favorites from "../packages/favorites/tui";
import skills from "../packages/sidebar-info/tui";
import links from "../packages/links/tui";
import activity from "../packages/activity-status/tui";
import contextInspector from "../packages/context-inspector/tui";
import { categories } from "../packages/context-inspector/snapshot.mjs";

const location = { directory: "/preview/project" };
const theme = {
  text: { base: "#ffffff", muted: "#888888", feedback: { info: { base: "#60a5fa" } } },
  hue: { accent: { 500: "#c084fc" } }, border: { base: "#555555" },
  background: { raised: { base: "#161616" } },
};
const sampleSkills = [
  { id: "code-review", name: "code-review", path: "skill://code-review" },
  { id: "diagnosing-bugs", name: "diagnosing-bugs", path: "/preview/project/.opencode/skills/diagnosing-bugs/SKILL.md" },
  { id: "domain-modeling", name: "domain-modeling", path: "skill://domain-modeling" },
  { id: "research", name: "research", path: "skill://research" },
  { id: "tdd", name: "tdd", path: "/preview/project/.opencode/skills/tdd/SKILL.md" },
];
const sampleLinks = [
  { url: "https://opencode.ai/docs/", label: "OpenCode documentation", description: "Guides and references for OpenCode." },
  { url: "https://github.com/Pontesegger/opencode-plugins", label: "Plugin repository", description: "Source and documentation for these plugins." },
  { url: "https://opencode.ai/docs/build/plugins/cli", label: "Build a TUI plugin", description: "Commands, slots, dialogs, and local state." },
];
const sampleGoal = {
  id: "preview-goal", objective: "Keep plugin look and feel consistent",
  status: "active", rounds: 2, maxRounds: 50, boot: "preview", updatedAt: 1,
};
const previewDefinitions = [
  { name: "favorites", plugin: favorites, columns: 34, rows: 9, expected: ["Favorites", "/clear", "/compact", "Show all commands"] },
  { name: "sidebar-info", plugin: skills, columns: 38, rows: 10, expected: ["@ Skills", "code-review", "diagnosing-bugs", "tdd"] },
  { name: "links", plugin: links, columns: 38, rows: 8, expected: ["Links", "OpenCode documentation", "Plugin repository"] },
  { name: "activity-status", plugin: activity, columns: 66, rows: 16, expected: ["2 ⧉ · 1 ❯_ · ⚑", "Goal", "Status: Active", sampleGoal.objective] },
  { name: "context-inspector", plugin: contextInspector, columns: 96, rows: 10, expected: ["Included", "System prompt", "AGENTS.md / rules", "Context", "25%", "($1.23)"] },
];

function previewContext(name, renderer, slots) {
  // Context has eleven interactive labels; each intentionally subscribes to blur/resize.
  renderer.setMaxListeners(32);
  const now = Date.now();
  const usage = { lastClicked: { "code-review": [now - 3000, now - 2000, now - 1000], "diagnosing-bugs": [now - 2000, now - 1000], tdd: now - 1000 } };
  const sessions = {
    preview: { id: "preview", location, model: { providerID: "preview", id: "preview-model" } },
    review: { id: "review", parentID: "preview", title: "Review plugin behavior", location },
    tests: { id: "tests", parentID: "preview", title: "Verify renderer tests", location },
  };
  const summary = {
    sessionID: "preview", revision: "sample", model: "preview-model", warnings: [],
    capturedAt: Date.UTC(2026, 0, 1, 12),
    sections: categories.map(([id, label], index) => ({ id, label, tokens: [6000, 3500, 5000, 2500, 1000][index], count: index + 1 })),
  };
  const context = {
    renderer, theme, options: {}, location,
    storage: {
      store: (_key, { initial }) => {
        const [state, update] = createStore(name === "sidebar-info" ? usage : initial);
        return [state, async (change) => update(produce(change))];
      },
      memory: (_key, { initial }) => {
        const [state, update] = createStore({ ...initial, visible: true });
        return [state, (change) => update(produce(change))];
      },
    },
    client: {
      file: { read: async () => new TextEncoder().encode("---\nmetadata: {}\n---\nSample skill") },
      rpc: () => ({
        list: async () => sampleLinks, get: async () => sampleGoal, summary: async () => summary,
        events: { on: () => () => {} },
      }),
    },
    data: {
      on: () => () => {}, listen: () => () => {},
      session: {
        get: (id) => sessions[id], family: () => Object.keys(sessions),
        status: (id) => id === "preview" ? "idle" : "running", cost: () => 1.23,
        message: { list: () => [{ type: "assistant", tokens: { input: 48000, output: 2000 } }] },
      },
      shell: {
        sync: async () => {},
        list: () => [{ id: "build", status: "running", command: "npm run check", cwd: location.directory, metadata: { sessionID: "preview" }, time: { started: 1 } }],
      },
      location: {
        default: () => location, reference: { list: () => [] },
        skill: { list: () => sampleSkills, sync: async () => {} },
        model: { list: () => [{ providerID: "preview", id: "preview-model", limit: { context: 200000 } }] },
      },
    },
    keymap: { layer: () => {}, commands: () => [], dispatch: () => { throw Error("Previews must not execute commands"); } },
    ui: {
      slot: (definition) => { slots.push(definition); return () => {}; },
      router: { current: () => ({ type: "session", sessionID: "preview" }), register: () => () => {} },
      model: { current: () => ({ providerID: "preview", modelID: "preview-model" }) },
      toast: { show: (toast) => { throw Error(toast.message); } },
    },
  };
  return context;
}

/** Each screenshot mounts the real plugin and captures its rendered text/colors. */
export async function capturePluginPreviews(setContext) {
  const captures = [];
  for (const definition of previewDefinitions) {
    function Preview() {
      const slots = [];
      const context = previewContext(definition.name, useRenderer(), slots);
      setContext(context);
      const stop = definition.plugin.setup(context);
      if (typeof stop === "function") onCleanup(stop);
      const props = { sessionID: "preview", mode: "normal", showDetails: true };
      if (definition.name === "context-inspector") {
        return <>
          {slots.find((slot) => slot.append === "session.composer.top").render(props)}
          <box flexGrow={1} />
          <box height={1}>{slots.find((slot) => slot.after === "prompt.footer").render(props)}</box>
        </>;
      }
      const content = slots.find((slot) => !slot.replace).render(props);
      return definition.name === "activity-status" ? <><box flexGrow={1} /><box height={1}>{content}</box></> : content;
    }
    const setup = await testRender(() => (
      <box width="100%" height="100%" flexDirection="column" backgroundColor="#0a0a0a" padding={1}><Preview /></box>
    ), { width: definition.columns, height: definition.rows });
    try {
      await setup.renderOnce();
      await setup.flush();
      if (definition.name === "activity-status") {
        const lines = setup.captureCharFrame().split("\n");
        const y = lines.findIndex((line) => line.includes("⚑"));
        await setup.mockMouse.moveTo(lines[y].indexOf("⚑"), y);
        await new Promise((resolve) => setTimeout(resolve, 320));
        await setup.renderOnce();
      }
      const text = setup.captureCharFrame();
      for (const expected of definition.expected) assert.ok(text.includes(expected), `${definition.name} screenshot includes ${expected}\n${text}`);
      const frame = setup.captureSpans();
      captures.push({
        name: definition.name, columns: frame.cols, rows: frame.rows, fontSize: 20,
        frames: [frame.lines.map((line) => line.spans.map((span) => ({
          text: span.text, width: span.width, attributes: span.attributes, fg: span.fg.toInts(), bg: span.bg.toInts(),
        })))],
      });
      console.log(`PASS: ${definition.name}: real plugin renderer, ${frame.cols}×${frame.rows} terminal cells, sample content verified`);
    } finally {
      setup.renderer.destroy();
    }
  }
  return captures;
}
