import { Plugin } from "@opencode/plugin/tui";
import { Portal } from "@opentui/solid";
import type { MouseEvent } from "@opentui/core";
import { homedir } from "node:os";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { skillPromptText, skillScope, skillScopeColor, sortedSkills, tooltipPlacement } from "./skills.mjs";

export default Plugin.define({
  id: "local.sidebar-info",
  setup(context) {
    const title = typeof context.options.title === "string"
      ? context.options.title
      : "Skills";

    return context.ui.slot({
      append: "sidebar.content",
      render: (props) => {
        const location = createMemo(() => context.data.session.get(props.sessionID)?.location
          ?? context.location ?? context.data.location.default());
        const skills = createMemo(() => sortedSkills(context.data.location.skill.list(location()) ?? []));
        const scope = (skill) => skillScope(skill.path, location()?.directory, homedir());
        const sourceColor = (skill) => skillScopeColor(scope(skill), context.theme);
        const [status, setStatus] = createSignal("Loading skills…");
        const [hoveredID, setHoveredID] = createSignal<string>();
        const [pointedID, setPointedID] = createSignal<string>();
        const [anchor, setAnchor] = createSignal({ x: 0, y: 0 });
        const [size, setSize] = createSignal({ width: context.renderer.width, height: context.renderer.height });
        const hovered = createMemo(() => skills().find((skill) => skill.id === hoveredID()));
        const placement = createMemo(() => tooltipPlacement(anchor().x, anchor().y, size().width, size().height));
        let hoverTimer: ReturnType<typeof setTimeout> | undefined;
        let hideTimer: ReturnType<typeof setTimeout> | undefined;
        let pressedID: string | undefined;
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
          if (event.button !== 0 || event.isDragging || pressedID !== skill.id) return;
          pressedID = undefined;
          event.preventDefault();
          event.stopPropagation();
          dismiss();
          try {
            // Focus the prompt through the host command, not a render-tree lookup.
            await context.keymap.dispatch("pane.focus.left");
            const editor = context.renderer.currentFocusedEditor;
            if (!editor || editor.isDestroyed) throw new Error("Prompt editor is unavailable");
            editor.insertText(skillPromptText(skill));
            editor.focus();
          } catch {
            context.ui.toast.show({ message: "Unable to insert the skill. Focus the prompt and try again.", variant: "warning" });
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

        return (
          <box flexDirection="column" flexShrink={0} marginTop={1}>
            <text fg={context.theme.text.base}><b>@ {title}</b></text>
            <Show when={skills().length > 0} fallback={<text fg={context.theme.text.base}>{status()}</text>}>
              <box flexDirection="column" paddingLeft={2} flexShrink={0}>
                <For each={skills()}>{(skill) => (
                  <text fg={pointedID() === skill.id ? context.theme.text.base : sourceColor(skill)}
                    wrapMode="word" selectable={false}
                    onMouseOver={(event) => beginHover(skill.id, event)}
                    onMouseOut={leaveHover}
                    onMouseDown={(event) => {
                      dismiss();
                      pressedID = event.button === 0 ? skill.id : undefined;
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onMouseUp={(event) => { void insertSkill(skill, event); }}
                    onMouseScroll={dismiss}>{skill.name}</text>
                )}</For>
              </box>
            </Show>
            <Show when={hovered()}>{(skill) => (
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
