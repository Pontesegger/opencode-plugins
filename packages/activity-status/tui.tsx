import { Plugin } from "@opencode/plugin/tui";
import type { ShellInfo } from "@opencode/client";
import type { BoxRenderable, MouseEvent } from "@opentui/core";
import { Portal } from "@opentui/solid";
import { Goal } from "@opencode/schema/goal";
import { batch, createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { cardPlacement, formatCount, isDescendant, shells, subagents } from "./activity.mjs";
import { ShellView } from "./shell-view";
import { GoalDetails } from "./goal-details";
import { watchGoal } from "./goals.mjs";

// Match the Skills sidebar's dark and light usage-intensity greens.
const indicatorColors = { normal: "#228B22", hover: "#86EFAC" };
const pausedColors = { normal: "#EAB308", hover: "#FDE047" };
const inactiveColor = "#333333";
type Indicator = "sub" | "shell" | "goal";
type GoalAction = "pause" | "resume" | "clear";
const indicators: Indicator[] = ["sub", "shell", "goal"];
const indicatorWidths = { sub: 3, shell: 4, goal: 1 };

export default Plugin.define({
  id: "local.activity-status",
  setup(context) {
    const [returnTo, setReturnTo] = createSignal<{ origin: string; target: string }>();
    const [shellView, setShellView] = createSignal<{ shell: ShellInfo; origin: string; location: { directory: string } }>();
    const getSession = (id: string) => context.data.session.get(id);
    const closeShell = () => {
      const origin = shellView()?.origin;
      setShellView(undefined);
      if (origin) context.ui.router.navigate({ type: "session", sessionID: origin });
    };
    const removeRoute = context.ui.router.register({ name: "shell-output", render: () => (
      <Show when={shellView()}>{(view) => <ShellView context={context} shell={view().shell} location={view().location} close={closeShell} />}</Show>
    ) });
    // Only claim Esc for subagents opened by this plugin, never for the main
    // session or unrelated tabs. Modal/composer shortcuts retain their priority.
    context.keymap.layer(() => ({
      priority: 10,
      enabled: () => {
        const route = context.ui.router.current();
        const visit = returnTo();
        return !!visit && route.type === "session" && isDescendant(route.sessionID, visit.target, getSession);
      },
      commands: [{ bind: "escape", title: "Return to main agent", run: () => {
        const visit = returnTo();
        setReturnTo(undefined);
        if (visit) context.ui.router.navigate({ type: "session", sessionID: visit.origin });
      } }],
    }));
    const removeSlot = context.ui.slot({
      // An outside contribution survives standard-footer replacement and stays
      // mounted across /statusbar toggles, preserving hover and goal state.
      before: "prompt.footer",
      render: (props) => {
        const location = () => getSession(props.sessionID ?? "")?.location ?? context.location ?? context.data.location.default();
        const agents = createMemo(() => subagents(props.sessionID, props.sessionID ? context.data.session.family(props.sessionID) : [], getSession, (id) => context.data.session.status(id)));
        const commands = createMemo(() => shells(props.sessionID, context.data.shell.list(location())));
        const running = () => agents().filter((agent) => agent.status === "running").length;
        const [goal, setGoal] = createSignal<Goal.State | null>(null);
        const [pendingAction, setPendingAction] = createSignal<GoalAction>();
        let runGoalAction: (action: GoalAction) => Promise<void> = async () => {};
        createEffect(() => {
          const sessionID = props.sessionID;
          const directory = location().directory;
          const client = context.client;
          setGoal(null);
          setPendingAction(undefined);
          if (!sessionID) return;
          try {
            const stop = watchGoal(client.rpc(Goal.Definition), sessionID, { directory }, setGoal,
              (refresh) => context.data.on("server.connected", refresh));
            let disposed = false;
            let request: AbortController | undefined;
            runGoalAction = async (action) => {
              const current = goal();
              if (disposed || request || !current
                || (action === "pause" && current.status !== "active")
                || (action === "resume" && current.status !== "paused")) return;
              const abort = new AbortController();
              request = abort;
              setPendingAction(action);
              try {
                await client.session.command({ sessionID, name: "goal", text: action }, { signal: abort.signal });
                if (!disposed) await stop.refresh();
              } catch {
                if (!disposed) context.ui.toast.show({ title: "Goal", message: `Could not ${action} the goal.`, variant: "error" });
              } finally {
                if (!disposed) { request = undefined; setPendingAction(undefined); }
              }
            };
            onCleanup(() => { disposed = true; request?.abort(); stop(); });
          } catch {
            // Goal availability must never prevent shell/subagent rendering.
            setGoal(null);
          }
        });
        const count = (kind: Indicator) => kind === "goal" ? Number(!!goal()) : kind === "sub" ? running() : commands().length;
        const visible = createMemo(() => indicators.filter((kind) => count(kind) > 0));
        const visibility = createMemo(() => visible().join(","));
        const [hover, setHover] = createSignal<Indicator>();
        const [pointed, setPointed] = createSignal<Indicator>();
        const [anchor, setAnchor] = createSignal({ x: 0, y: 0 });
        const [size, setSize] = createSignal({ width: context.renderer.width, height: context.renderer.height });
        const rows = createMemo(() => hover() === "sub" ? agents().map((agent) => ({ ...agent, label: agent.title }))
          : commands().map((shell) => ({ id: shell.id, label: shell.command.split("\n", 1)[0], status: shell.status })));
        const placement = createMemo(() => cardPlacement(anchor(), size().width, size().height, hover() === "goal" ? 8 : rows().length));
        let hoverTimer: ReturnType<typeof setTimeout> | undefined;
        let hideTimer: ReturnType<typeof setTimeout> | undefined;
        let pressed: string | undefined;
        const keepOpen = () => { clearTimeout(hideTimer); hideTimer = undefined; };
        const dismiss = () => { keepOpen(); clearTimeout(hoverTimer); hoverTimer = undefined; pressed = undefined; setHover(undefined); };
        const leave = () => { setPointed(undefined); clearTimeout(hoverTimer); keepOpen(); hideTimer = setTimeout(dismiss, 150); };
        const GoalHeading = () => {
          const [pointedAction, setPointedAction] = createSignal<GoalAction>();
          let pressedAction: GoalAction | undefined;
          const Action = (actionProps: { action: GoalAction }) => (
            <text height={1} flexShrink={0} wrapMode="none" selectable={false}
              fg={pendingAction() ? context.theme.text.muted : pointedAction() === actionProps.action ? indicatorColors.hover : indicatorColors.normal}
              onMouseOver={() => { keepOpen(); setPointedAction(actionProps.action); }}
              onMouseOut={() => { setPointedAction(undefined); pressedAction = undefined; }}
              onMouseDown={(event) => {
                pressedAction = event.button === 0 ? actionProps.action : undefined;
                event.preventDefault(); event.stopPropagation();
              }}
              onMouseUp={(event) => {
                event.preventDefault(); event.stopPropagation();
                if (event.button === 0 && !event.isDragging && pressedAction === actionProps.action) void runGoalAction(actionProps.action);
                pressedAction = undefined;
              }}>
              {pendingAction() === actionProps.action ? "Working…" : actionProps.action === "pause" ? "Pause" : actionProps.action === "resume" ? "Resume" : "Clear"}
            </text>
          );
          return (
            <box flexDirection="row" height={1} flexShrink={0}>
              <text width={7} flexShrink={0} fg={context.theme.text.base}>Goal · </text>
              <Show when={goal()?.status === "active"}><Action action="pause" /><text width={3} flexShrink={0} fg={context.theme.text.base}> · </text></Show>
              <Show when={goal()?.status === "paused"}><Action action="resume" /><text width={3} flexShrink={0} fg={context.theme.text.base}> · </text></Show>
              <Action action="clear" />
              <text wrapMode="none" truncate fg={context.theme.text.muted}> · Esc close</text>
            </box>
          );
        };
        let goalDialogOpen = false;
        const showGoal = () => {
          if (!goal()) return;
          dismiss();
          goalDialogOpen = true;
          context.ui.dialog.show(() => (
            <box flexDirection="column" paddingLeft={1} paddingRight={1}>
              <text height={1} flexShrink={0} fg={context.theme.text.base}>⚑ Goal · read-only · Esc close</text>
              <box height={1} flexShrink={0} />
              <scrollbox maxHeight={Math.max(1, context.renderer.height - 8)} scrollX={false} scrollY={true} focused
                contentOptions={{ flexDirection: "column" }}>
                <Show when={goal()} fallback={<text fg={context.theme.text.muted}>No goal is set for this session.</text>}>
                  {(current) => <GoalDetails goal={current()} context={context} />}
                </Show>
              </scrollbox>
            </box>
          ), () => { goalDialogOpen = false; });
          context.ui.dialog.set({ size: "large", centered: true });
        };
        const open = (kind: Indicator, event: MouseEvent, immediately = false) => {
          dismiss();
          setPointed(kind);
          const target = event.currentTarget;
          setAnchor({ x: (target?.x ?? event.x) - context.renderer.root.x, y: (target?.y ?? event.y) - context.renderer.root.y });
          if (immediately) setHover(kind);
          else hoverTimer = setTimeout(() => setHover(kind), 250);
        };
        const resize = (width: number, height: number) => { dismiss(); setPointed(undefined); setSize({ width, height }); };
        const blur = () => { dismiss(); setPointed(undefined); };
        context.renderer.on("resize", resize);
        context.renderer.on("blur", blur);
        onCleanup(() => {
          dismiss(); context.renderer.off("resize", resize); context.renderer.off("blur", blur);
          if (goalDialogOpen) context.ui.dialog.clear();
        });
        createEffect(() => {
          const sessionID = props.sessionID;
          const current = location();
          dismiss(); setPointed(undefined);
          if (goalDialogOpen) context.ui.dialog.clear();
          if (sessionID) void context.data.shell.sync(current).catch(() => {});
        });
        createEffect(() => {
           // A disappearing counter invalidates its card. Cancel pending hover
           // timers as well as already-open cards; fixed slots never shift.
          visibility(); props.mode;
          dismiss(); setPointed(undefined);
        });
        context.keymap.layer(() => ({
          priority: 15, enabled: () => !!hover(),
          commands: [{ bind: "escape", title: "Dismiss activity hover", run: dismiss }],
        }));
        const select = (id: string, event: MouseEvent) => {
          if (event.button !== 0 || event.isDragging || pressed !== id || !props.sessionID) return;
          event.preventDefault(); event.stopPropagation();
          const kind = hover();
          const origin = returnTo()?.origin ?? props.sessionID;
          if (kind === "sub") {
            const agent = agents().find((item) => item.id === id);
            if (!agent) return;
            batch(() => {
              setReturnTo({ origin, target: id });
              dismiss();
              context.ui.router.navigate({ type: "session", sessionID: id });
            });
          } else {
            const shell = commands().find((item) => item.id === id);
            if (!shell) return;
            // Shell output belongs to the session whose counter was clicked.
            setShellView({ shell, origin: props.sessionID, location: { directory: location().directory } });
            dismiss();
            context.ui.router.navigate({ type: "plugin", name: "shell-output" });
          }
        };
        return (
          <Show when={props.sessionID && props.mode === "normal"}>
            <box flexDirection="row" height={1} flexShrink={0} flexGrow={1} justifyContent="flex-end">
              <box id="local.activity-status.indicators" width={14} height={1} flexDirection="row" flexShrink={0}>
                <For each={indicators}>{(kind, index) => (<>
                  <Show when={count(kind) > 0} fallback={
                    <text width={indicatorWidths[kind]} wrapMode="none" height={1} flexShrink={0} selectable={false} fg={inactiveColor}>
                      {kind === "goal" ? "⚑" : `0 ${kind === "sub" ? "⧉" : "❯_"}`}
                    </text>
                  }>
                    <text width={indicatorWidths[kind]} wrapMode="none" height={1} flexShrink={0} selectable={false}
                      fg={kind === "goal" && goal()?.status === "paused"
                        ? pointed() === kind ? pausedColors.hover : pausedColors.normal
                        : pointed() === kind ? indicatorColors.hover : indicatorColors.normal}
                      onMouseOver={(event) => open(kind, event)} onMouseOut={leave}
                      onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                      onMouseUp={(event) => { if (event.button === 0 && !event.isDragging) {
                        event.preventDefault(); event.stopPropagation();
                        if (kind === "goal") showGoal(); else open(kind, event, true);
                      } }}>
                      {kind === "goal" ? "⚑" : `${formatCount(count(kind))} ${kind === "sub" ? "⧉" : "❯_"}`}
                    </text>
                  </Show>
                  <Show when={index() < indicators.length - 1}>
                    <Show when={count(kind) > 0 && count(indicators[index() + 1]) > 0}
                      fallback={<box width={3} height={1} flexShrink={0} />}>
                      <text width={3} height={1} flexShrink={0} selectable={false} fg={indicatorColors.normal}> · </text>
                    </Show>
                  </Show>
                </>)}</For>
              </box>
              <Show when={hover()}>
                <Portal mount={context.renderer.root} ref={(container) => {
                  // OpenTUI's Portal ref type is {}, but its root is a box.
                  const portal = container as BoxRenderable;
                  portal.position = "absolute"; portal.left = 0; portal.top = 0;
                  portal.width = 0; portal.height = 0; portal.zIndex = 1000;
                }}>
                  <box position="absolute" left={placement().left} top={placement().top} width={placement().width} height={placement().height}
                    zIndex={1000} border borderColor={context.theme.border.base} backgroundColor={context.theme.background.raised.base}
                    paddingLeft={1} paddingRight={1} flexDirection="column" onMouseOver={keepOpen} onMouseOut={leave}>
                    <Show when={hover() === "goal"} fallback={
                      <text height={1} flexShrink={0} wrapMode="none" truncate fg={context.theme.text.base}>
                        {hover() === "sub" ? "Subagents · click to open · Esc return" : "Shells · click for output · Esc return"}
                      </text>
                    }><GoalHeading /></Show>
                    <box height={1} flexShrink={0} />
                    <scrollbox flexGrow={1} minHeight={0} scrollX={false} scrollY={true} contentOptions={{ flexDirection: "column" }}>
                      <Show when={hover() === "goal"} fallback={
                        <Show when={rows().length} fallback={<text fg={context.theme.text.muted}>{hover() === "sub" ? "No subagents" : "No active shells"}</text>}>
                          <For each={rows()}>{(row) => (
                            <text height={1} flexShrink={0} wrapMode="none" truncate selectable={false}
                              fg={row.status === "running" ? context.theme.text.base : context.theme.text.muted}
                              onMouseDown={(event) => { pressed = event.button === 0 ? row.id : undefined; event.preventDefault(); event.stopPropagation(); }}
                              onMouseUp={(event) => select(row.id, event)}>{row.status === "running" ? "●" : "○"} {row.label}</text>
                          )}</For>
                        </Show>
                      }>
                        <Show when={goal()}>{(current) => <GoalDetails goal={current()} context={context} />}</Show>
                      </Show>
                    </scrollbox>
                  </box>
                </Portal>
              </Show>
            </box>
          </Show>
        );
      },
    });
    createEffect(() => {
      const route = context.ui.router.current();
      const visit = returnTo();
      if (visit && (route.type === "home" || (route.type === "session" && !isDescendant(route.sessionID, visit.target, getSession)))) setReturnTo(undefined);
    });
    return () => { removeSlot(); removeRoute(); setReturnTo(undefined); setShellView(undefined); };
  },
});
