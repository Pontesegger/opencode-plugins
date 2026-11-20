import { Plugin } from "@opencode/plugin/tui";
import { Portal } from "@opentui/solid";
import type { MouseEvent } from "@opentui/core";
import { homedir } from "node:os";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { insertSkillMention, recentSkillUseCount, recordSkillUse, skillScope, skillScopeColor, skillUsageColor, sortedSkills, tooltipPlacement } from "./skills.mjs";
import { visibleSkills } from "./visibility.mjs";

export default Plugin.define({
  id: "local.sidebar-info",
  setup(context) {
    const [expanded, setExpanded] = createSignal(true);
    const title = typeof context.options.title === "string"
      ? context.options.title
      : "Skills";
    const [usage, updateUsage] = context.storage.store<{ lastClicked: Record<string, number | number[]> }>("skill-usage", {
      initial: { lastClicked: {} },
    });

    return context.ui.slot({
      append: "sidebar.content",
      render: (props) => {
        const location = createMemo(() => context.data.session.get(props.sessionID)?.location
          ?? context.location ?? context.data.location.default());
        const [skills, setSkills] = createSignal<ReturnType<typeof sortedSkills>>([]);
        const [loadingVisibility, setLoadingVisibility] = createSignal(true);
        const [now, setNow] = createSignal(Date.now());
        // Let usage colors age out even when no skill is clicked or session changed.
        const clock = setInterval(() => setNow(Date.now()), 60_000);
        onCleanup(() => clearInterval(clock));
        const usageColor = (skill) => skillUsageColor(recentSkillUseCount(usage.lastClicked[skill.id], now()), context.theme);
        const scope = (skill) => skillScope(skill.path, location()?.directory, homedir());
        const sourceColor = (skill) => skillScopeColor(scope(skill), context.theme);
        const [status, setStatus] = createSignal("Loading skills…");
        const [hoveredID, setHoveredID] = createSignal<string>();
        const [pointedID, setPointedID] = createSignal<string>();
        const [toggleHovered, setToggleHovered] = createSignal(false);
        const [anchor, setAnchor] = createSignal({ x: 0, y: 0 });
        const [size, setSize] = createSignal({ width: context.renderer.width, height: context.renderer.height });
        const hovered = createMemo(() => skills().find((skill) => skill.id === hoveredID()));
        const placement = createMemo(() => tooltipPlacement(anchor().x, anchor().y, size().width, size().height));
        let hoverTimer: ReturnType<typeof setTimeout> | undefined;
        let hideTimer: ReturnType<typeof setTimeout> | undefined;
        let pressedID: string | undefined;
        let togglePressed = false;
        let inserting = false;
        const keepOpen = () => {
          clearTimeout(hideTimer);
          hideTimer = undefined;
        };
        const dismiss = () => {
          keepOpen();
          clearTimeout(hoverTimer);
          hoverTimer = undefined;
          setHoveredID(undefined);
        };
        const leaveHover = () => {
          setPointedID(undefined);
          pressedID = undefined;
          clearTimeout(hoverTimer);
          keepOpen();
          // Allow the pointer to cross the one-cell gap into a scrollable card.
          hideTimer = setTimeout(dismiss, 150);
        };
        const beginHover = (id: string, event: MouseEvent) => {
          dismiss();
          setPointedID(id);
          const target = event.currentTarget;
          setAnchor({
            x: (target?.x ?? event.x) - context.renderer.root.x,
            y: (target?.y ?? event.y) - context.renderer.root.y,
          });
          hoverTimer = setTimeout(() => { setHoveredID(id); }, 250);
        };
        const insertSkill = async (skill, event: MouseEvent) => {
          if (event.button !== 0 || event.isDragging || pressedID !== skill.id || inserting) return;
          pressedID = undefined;
          event.preventDefault();
          event.stopPropagation();
          dismiss();
          inserting = true;
          try {
            await insertSkillMention(context, skill, location());
          } catch (error) {
            context.ui.toast.show({ message: error instanceof Error ? error.message : "Unable to select the skill.", variant: "warning" });
            return;
          } finally {
            inserting = false;
          }
          const clickedAt = Date.now();
          setNow(clickedAt);
          try {
            await updateUsage((draft) => {
              draft.lastClicked[skill.id] = recordSkillUse(draft.lastClicked[skill.id], clickedAt);
            });
          } catch {
            context.ui.toast.show({ message: "Skill inserted, but its usage could not be saved.", variant: "warning" });
          }
        };
        // Geometry changes invalidate the old row anchor; do not leave a stale card.
        const resize = (width: number, height: number) => {
          setPointedID(undefined);
          dismiss();
          setSize({ width, height });
        };
        context.renderer.on("resize", resize);
        const clearHover = () => {
          setPointedID(undefined);
          dismiss();
        };
        context.renderer.on("blur", clearHover);
        onCleanup(() => {
          dismiss();
          context.renderer.off("resize", resize);
          context.renderer.off("blur", clearHover);
        });

        createEffect(() => {
          props.sessionID;
          const currentLocation = location();
          clearHover();
          let cancelled = false;
          onCleanup(() => { cancelled = true; });
          setStatus("Loading skills…");
          void context.data.location.skill.sync(currentLocation).then(() => {
            if (!cancelled) setStatus("No skills available");
          }).catch(() => {
            if (!cancelled) setStatus("Unable to load skills");
          });
        });

        createEffect(() => {
          const currentLocation = location();
          const registered = context.data.location.skill.list(currentLocation) ?? [];
          const abort = new AbortController();
          onCleanup(() => abort.abort());
          clearHover();
          setSkills([]);
          setLoadingVisibility(true);
          void visibleSkills(registered, async (path) => {
            const bytes = await context.client.file.read({ path, location: currentLocation }, { signal: abort.signal });
            return new TextDecoder().decode(bytes);
          }).then((visible) => {
            if (abort.signal.aborted) return;
            setSkills(sortedSkills(visible));
            setLoadingVisibility(false);
          });
        });

        const SkillRows = (rows) => (
          <For each={rows.skills}>{(skill) => (
            <box flexDirection="row" width="100%" flexShrink={0} gap={1} paddingRight={2}
              onMouseOver={(event) => beginHover(skill.id, event)}
              onMouseOut={leaveHover}
              onMouseDown={(event) => {
                dismiss();
                pressedID = event.button === 0 ? skill.id : undefined;
                event.preventDefault();
                event.stopPropagation();
              }}
              onMouseUp={(event) => { void insertSkill(skill, event); }}
              onMouseScroll={dismiss}>
              <text fg={pointedID() === skill.id ? context.theme.text.base : usageColor(skill)}
                flexGrow={1} flexShrink={1} minWidth={0} wrapMode="word" selectable={false}>{skill.name}</text>
              <text fg={sourceColor(skill)} flexShrink={0} selectable={false}>
                {scope(skill) === "Repo" || scope(skill) === "Built-in" ? "●" : " "}
              </text>
            </box>
          )}</For>
        );

        return (
          <box width="100%" flexDirection="column" flexShrink={0} marginTop={1}>
            <box width="100%" height={1} flexDirection="row" flexShrink={0} paddingRight={1}>
              <text fg={context.theme.text.base} flexGrow={1} flexShrink={1} minWidth={0} height={1}><b>@ {title}</b></text>
              <text fg={toggleHovered() ? context.theme.text.base : context.theme.text.muted} width={3} flexShrink={0} selectable={false}
                onMouseOver={() => setToggleHovered(true)}
                onMouseOut={() => { setToggleHovered(false); togglePressed = false; }}
                onMouseDown={(event) => {
                  togglePressed = event.button === 0;
                  event.preventDefault(); event.stopPropagation();
                }}
                onMouseUp={(event) => {
                  const activate = togglePressed && event.button === 0 && !event.isDragging;
                  togglePressed = false;
                  event.preventDefault(); event.stopPropagation();
                  if (!activate) return;
                  pressedID = undefined;
                  clearHover();
                  setExpanded((value) => !value);
                }}><b>{expanded() ? "[-]" : "[+]"}</b></text>
            </box>
            <Show when={expanded()}>
              <Show when={skills().length > 0} fallback={<text fg={context.theme.text.base}>{loadingVisibility() ? "Loading skills…" : status()}</text>}>
                <box flexDirection="column" paddingLeft={2} flexShrink={0}>
                  <SkillRows skills={skills()} />
                </box>
              </Show>
            </Show>
            <Show when={expanded() && hovered()}>{(skill) => (
              <Portal mount={context.renderer.root} ref={(container) => {
                // Portal adds a real box to the root. Keep it out of flex flow,
                // above the app, and zero-sized so it cannot steal row hover hits.
                container.position = "absolute";
                container.left = 0;
                container.top = 0;
                container.width = 0;
                container.height = 0;
                container.zIndex = 1000;
              }}>
                <box position="absolute" left={placement().left} top={placement().top}
                  width={placement().width} height={placement().height} zIndex={1000}
                  border borderColor={context.theme.border.base}
                  backgroundColor={context.theme.background.raised.base}
                  paddingLeft={1} paddingRight={1} flexDirection="column"
                  onMouseOver={keepOpen} onMouseOut={leaveHover}>
                  <scrollbox flexGrow={1} minHeight={0} scrollX={false} scrollY={true}
                    contentOptions={{ flexDirection: "column", gap: 1 }}>
                    <text fg={context.theme.text.base} wrapMode="word" flexShrink={0}><b>@{skill().name}</b></text>
                    <text fg={context.theme.text.muted} wrapMode="word" flexShrink={0}>
                      Location: <span style={{ fg: sourceColor(skill()) }}>{scope(skill())}</span>
                    </text>
                    <text fg={context.theme.text.muted} wrapMode="word" flexShrink={0}>
                      {skill().description?.trim() || "No description available."}
                    </text>
                  </scrollbox>
                </box>
              </Portal>
            )}</Show>
          </box>
        );
      },
    });
  },
});
