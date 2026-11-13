import { Plugin } from "@opencode/plugin/tui";
import type { ScrollBoxRenderable, TextRenderable } from "@opentui/core";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { ContextInspector } from "./rpc";
import { categories, segmentWidths } from "./snapshot.mjs";
import { adjacentHeading, headingLines, headingOffsets } from "./headings.mjs";
import type { Category, Inspection, Section, Summary } from "./types";
import { UsageBar } from "./usage-bar";

const color = (id: string) => categories.find((category) => category[0] === id)?.[2] ?? "#60a5fa";
const tokens = (value: number) => value >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : String(value);

export default Plugin.define({
  id: "local.context-inspector.tui",
  setup(context) {
    const rpc = context.client.rpc(ContextInspector);
    const [preferences, updatePreferences] = context.storage.memory("display", { initial: { visible: false } });
    const [summary, setSummary] = createSignal<Summary | null>(null);
    const [inspection, setInspection] = createSignal<Inspection | null>(null);
    const [inspectionSummary, setInspectionSummary] = createSignal<Summary | null>(null);
    const [problem, setProblem] = createSignal("");
    const abort = new AbortController();
    let generation = 0;
    let inspectionGeneration = 0;
    const activeSession = () => {
      const route = context.ui.router.current();
      return route.type === "session" ? route.sessionID : undefined;
    };
    const location = (sessionID: string) => context.data.session.get(sessionID)?.location ?? context.location;

    function toggleDetails() {
      const sessionID = activeSession();
      if (!sessionID) {
        context.ui.toast.show({ message: "Open a session to view its context." });
        return;
      }
      updatePreferences((draft) => { draft.visible = !draft.visible; });
      if (preferences.visible) void refresh(sessionID);
    }

    async function refresh(sessionID: string) {
      const request = ++generation;
      try {
        const value = await rpc.summary({ sessionID }, { location: location(sessionID), signal: abort.signal });
        if (request !== generation || abort.signal.aborted) return;
        setSummary(value as Summary | null);
        setProblem("");
      } catch {
        if (request !== generation || abort.signal.aborted) return;
        setSummary(null);
        setProblem("Capture unavailable — use /reload to load the server plugin.");
      }
    }

    async function inspect(id: Category) {
      const route = context.ui.router.current();
      const snapshot = route.type === "plugin" && route.name === "inspector" ? inspectionSummary() : summary();
      if (!snapshot) return;
      const request = ++inspectionGeneration;
      try {
        const value = await rpc.details({
          sessionID: snapshot.sessionID, revision: snapshot.revision, category: id,
        }, { location: location(snapshot.sessionID), signal: abort.signal });
        if (abort.signal.aborted || request !== inspectionGeneration) return;
        if (!value) {
          context.ui.toast.show({ message: "That capture has expired. Select a section from the latest bar.", variant: "warning" });
          void refresh(snapshot.sessionID);
          return;
        }
        setInspection({ ...(value as Omit<Inspection, "sessionID">), sessionID: snapshot.sessionID });
        setInspectionSummary(snapshot);
        if (route.type !== "plugin" || route.name !== "inspector") context.ui.router.navigate({ type: "plugin", name: "inspector" });
      } catch {
        if (!abort.signal.aborted) context.ui.toast.show({ message: "Unable to read the capture. Try /reload.", variant: "warning" });
      }
    }

    function renderInspector() {
      let scroll: ScrollBoxRenderable | undefined;
      const anchors = new Set<{ title?: TextRenderable; body?: TextRenderable; lines: number[] }>();
      const jumpHeading = (direction: number) => {
        const box = scroll;
        const capture = inspection();
        if (!box) return;
        box.afterLayout(() => {
          if (inspection() !== capture) return;
          const offsets: number[] = [];
          for (const anchor of anchors) {
            if (anchor.title && !anchor.title.isDestroyed) offsets.push(anchor.title.y - box.content.y);
            if (anchor.body && !anchor.body.isDestroyed && anchor.lines.length) {
              offsets.push(...headingOffsets(anchor.lines,
                anchor.body.getLineSources(0, anchor.body.virtualLineCount), anchor.body.y - box.content.y));
            }
          }
          const target = adjacentHeading(offsets, box.scrollTop, direction);
          if (target !== undefined) box.scrollTo(target);
        });
      };
      const [size, setSize] = createSignal({ width: context.renderer.width, height: context.renderer.height - 2 });
      const width = () => Math.max(20, Math.floor(size().width * 0.8));
      const contentWidth = () => width() - 2;
      const choices = () => inspectionSummary()?.sections.filter((section) => section.tokens > 0 && (section.id !== "mcp" || context.options.showMcp !== false)) ?? [];
      const cycle = (direction: number) => {
        const sections = choices();
        const index = sections.findIndex((section) => section.id === inspection()?.section.id);
        const next = sections[(index + direction + sections.length) % sections.length];
        if (next) void inspect(next.id);
      };
      context.keymap.layer(() => ({
        mode: "global", priority: 20,
        commands: [
          { bind: "escape", run: () => {
            const sessionID = inspection()?.sessionID;
            inspectionGeneration++;
            if (sessionID) context.ui.router.navigate({ type: "session", sessionID });
            setInspection(null);
            setInspectionSummary(null);
          } },
          { bind: "left", run: () => cycle(-1) },
          { bind: "right", run: () => cycle(1) },
          { bind: "down", run: () => scroll?.scrollBy(3) },
          { bind: "up", run: () => scroll?.scrollBy(-3) },
          { bind: "shift+down", run: () => jumpHeading(1) },
          { bind: "shift+up", run: () => jumpHeading(-1) },
          { bind: "pagedown", run: () => scroll?.scrollBy(1, "viewport") },
          { bind: "pageup", run: () => scroll?.scrollBy(-1, "viewport") },
          { bind: "home", run: () => scroll?.scrollTo(0) },
          { bind: "end", run: () => scroll?.scrollTo(Infinity) },
        ],
      }));
      createEffect(() => { inspection()?.section.id; scroll?.scrollTo(0); });
      // Reserve explicit rows for controls. Intrinsic text height in a flexible
      // scrollbox must not squeeze the heading/footer out of the viewport.
      return (
        <box width="100%" height="100%" alignItems="center" flexDirection="column"
          onSizeChange={function () { setSize({ width: this.width, height: this.height }); }}>
          <box width={width()} height={size().height} paddingLeft={1} paddingRight={1} flexShrink={0} flexDirection="column">
            <text width={contentWidth()} height={1} flexShrink={0} fg={context.theme.text.base}>Context inspector</text>
            <box width={contentWidth()} height={2} flexShrink={0} flexDirection="row" flexWrap="wrap" gap={1}>
              <For each={choices()}>{(section) => (
                <text height={1} flexShrink={0} fg={color(section.id)} selectable={false}
                  onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                  onMouseUp={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault(); event.stopPropagation(); void inspect(section.id);
                  }}>{inspection()?.section.id === section.id ? `[${section.label}]` : section.label}</text>
              )}</For>
            </box>
            <text width={contentWidth()} height={1} flexShrink={0} fg={color(inspection()?.section.id ?? "prompt")}>{inspection()?.section.label} · ≈{tokens(inspection()?.section.tokens ?? 0)} tokens</text>
            <text width={contentWidth()} height={2} flexShrink={0} wrapMode="word" fg={context.theme.text.base}>
              {inspection()?.model} · snapshot {inspection()?.revision} · {new Date(inspection()?.capturedAt ?? 0).toLocaleString()}
            </text>
            <text width={contentWidth()} height={2} flexShrink={0} wrapMode="word" fg={context.theme.text.base}>Captured assembled context, not the provider HTTP payload. Token counts are estimates.</text>
            <text width={contentWidth()} height={1} flexShrink={0} fg={context.theme.border.base} selectable={false}>{"─".repeat(contentWidth())}</text>
            <scrollbox width={contentWidth()} height={Math.max(1, size().height - 12)} flexShrink={0}
              ref={(value) => { scroll = value; }} scrollX={false} scrollY={true} focused
              contentOptions={{ width: contentWidth(), flexDirection: "column", gap: 1 }}>
              <For each={inspection()?.section.entries}>{(entry) => {
                const anchor: { title?: TextRenderable; body?: TextRenderable; lines: number[] } = { lines: headingLines(entry.text) };
                anchors.add(anchor);
                onCleanup(() => anchors.delete(anchor));
                return (
                <box width={contentWidth() - 1} flexDirection="column" flexShrink={0}>
                  <text ref={(value) => { anchor.title = value; }} width={contentWidth() - 1} wrapMode="word" flexShrink={0} fg={color(inspection()?.section.id ?? "prompt")}>── {entry.title} · ≈{tokens(entry.tokens)} tokens ──</text>
                  <text ref={(value) => { anchor.body = value; }} width={contentWidth() - 1} wrapMode="word" flexShrink={0} fg={context.theme.text.base} selectable>{entry.text}</text>
                </box>
                );
              }}</For>
              <For each={inspection()?.warnings}>{(warning) => <text width={contentWidth() - 1} wrapMode="word" flexShrink={0} fg="#facc15">Note: {warning}</text>}</For>
            </scrollbox>
            <text width={contentWidth()} height={1} flexShrink={0} fg={context.theme.border.base} selectable={false}>{"─".repeat(contentWidth())}</text>
            <text width={contentWidth()} height={2} flexShrink={0} wrapMode="word" fg={context.theme.text.base}>Read-only · Esc close · ←/→ category · Shift+↑/↓ heading · ↑/↓/wheel/PgUp/PgDn scroll · Home/End</text>
          </box>
        </box>
      );
    }

    const removeRoute = context.ui.router.register({
      name: "inspector",
      render: renderInspector,
    });

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "local.context-inspector.toggle", title: "Toggle context component bar", group: "Context",
          palette: true, slash: { name: "context" },
          run: toggleDetails,
        },
        {
          id: "local.context-inspector.inspect", title: "Inspect context component", group: "Context",
          palette: true, slash: { name: "context-inspect" },
          run: async () => {
            const sessionID = activeSession();
            if (!sessionID) return;
            await refresh(sessionID);
            const current = summary();
            if (!current) {
              context.ui.toast.show({ message: problem() || "No capture yet. Send a normal prompt first." });
              return;
            }
            const selected = await context.ui.dialog.select({
              title: "Inspect captured context",
              options: current.sections.filter((section) => section.tokens > 0 && (section.id !== "mcp" || context.options.showMcp !== false))
                .map((section) => ({ title: section.label, value: section.id, description: `≈${tokens(section.tokens)} tokens · ${section.count} entries` })),
            });
            if (selected) await inspect(selected);
          },
        },
      ],
    }));

    const stopUpdates = rpc.events.on("updated", (event) => {
      const { sessionID } = event.data as { sessionID: string };
      if (sessionID === activeSession()) void refresh(sessionID);
    }, { signal: abort.signal });
    const stopReconnect = context.data.listen(({ details }) => {
      if (details.type === "server.connected" || details.type === "location.shutdown") {
        const sessionID = activeSession();
        if (sessionID) void refresh(sessionID);
      }
    });

    // Keep the usage row below the built-in footer, independent of detail visibility.
    const removeUsageSlot = context.ui.slot({
      after: "prompt.footer",
      render: (props) => <UsageBar sessionID={props.sessionID} mode={props.mode} onToggle={toggleDetails} />,
    });

    const removeSlot = context.ui.slot({
      append: "session.composer.top",
      render: (props) => {
        const [availableWidth, setAvailableWidth] = createSignal(context.renderer.width);
        createEffect(() => {
          const sessionID = props.sessionID;
          setSummary(null);
          if (sessionID) void refresh(sessionID);
        });
        const current = createMemo(() => summary()?.sessionID === props.sessionID ? summary() : null);
        const segments = createMemo<Array<Omit<Section, "entries"> & { width: number }>>(() => segmentWidths(
          current()?.sections.filter((section) => section.id !== "mcp" || context.options.showMcp !== false) ?? [],
          Math.max(13, Math.floor(availableWidth() * 0.7)), 2,
        ));
        const total = () => segments().reduce((sum, section) => sum + section.tokens, 0);
        return (
          <Show when={preferences.visible && props.sessionID}>
            <box width="100%" flexDirection="column" paddingLeft={1} marginTop={1} flexShrink={0}
              onSizeChange={function () { setAvailableWidth(this.width - 1); }}>
              <Show when={current()} fallback={
                <text fg={context.theme.text.base}>{problem() || "Context components: awaiting the next model request · click Context or /context to hide"}</text>
              }>
                <text fg={context.theme.text.base}>
                  Included ≈{tokens(total())} tokens · captured {new Date(current()!.capturedAt).toLocaleTimeString()} · click a color
                </text>
                <box flexDirection="row" gap={2} flexShrink={0}>
                  <For each={segments()}>{(section) => (
                    <text fg={color(section.id)} selectable={false}
                      onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                      onMouseUp={(event) => {
                        if (event.button !== 0) return;
                        event.preventDefault();
                        event.stopPropagation();
                        void inspect(section.id as Category);
                      }}>{"█".repeat(section.width)}</text>
                  )}</For>
                </box>
                <box flexDirection="row" flexWrap="wrap" gap={2}>
                  <For each={segments()}>{(section) => (
                    <text fg={color(section.id)} selectable={false}
                      onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                      onMouseUp={(event) => {
                        if (event.button !== 0) return;
                        event.preventDefault();
                        event.stopPropagation();
                        void inspect(section.id as Category);
                      }}>{section.label} ≈{tokens(section.tokens)}</text>
                  )}</For>
                </box>
                <text fg={context.theme.text.base}>No conversation or free space · click Context or /context to hide · /context-inspect for keyboard access</text>
              </Show>
            </box>
          </Show>
        );
      },
    });
    return () => {
      abort.abort();
      generation++;
      inspectionGeneration++;
      stopUpdates();
      stopReconnect();
      removeUsageSlot();
      removeSlot();
      removeRoute();
      setSummary(null);
      setInspection(null);
      setInspectionSummary(null);
    };
  },
});
