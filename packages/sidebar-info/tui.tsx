import { Plugin } from "@opencode/plugin/tui";
import { Portal } from "@opentui/solid";
import type { MouseEvent } from "@opentui/core";
import { homedir } from "node:os";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { contextMenuPlacement, insertSkillMention, recentSkillUseCount, recordSkillUse, skillScope, skillScopeColor, skillUsageColor, sortedSkills, tooltipPlacement } from "./skills.mjs";
import { visibleSkills } from "./visibility.mjs";
import { copySkillToRepo } from "./copy.mjs";

export default Plugin.define({
  id: "local.sidebar-info",
  setup(context) {
    const [expanded, setExpanded] = createSignal(true);
    const [showAll, setShowAll] = createSignal(false);
    const title = typeof context.options.title === "string"
      ? context.options.title
      : "Skills";
    const [usage, updateUsage] = context.storage.store<{ lastClicked: Record<string, number | number[]> }>("skill-usage", {
      initial: { lastClicked: {} },
    });
    const [visibility, updateVisibility] = context.storage.store<{ hiddenIDs: Record<string, boolean> }>("skill-visibility", {
      initial: { hiddenIDs: {} },
    });

    return context.ui.slot({
      append: "sidebar.content",
      render: (props) => {
        const location = createMemo(() => context.data.session.get(props.sessionID)?.location
          ?? context.location ?? context.data.location.default());
        const skills = createMemo(() => sortedSkills(visibleSkills(
          // The server registry already resolves same-ID source precedence.
          // Use its selected definition for the row, hover and copy action.
          context.data.location.skill.list(location()) ?? [], visibility.hiddenIDs, showAll(),
        )));
        const [now, setNow] = createSignal(Date.now());
        // Let usage colors age out even when no skill is clicked or session changed.
        const clock = setInterval(() => setNow(Date.now()), 60_000);
        onCleanup(() => clearInterval(clock));
        const usageColor = (skill) => skillUsageColor(recentSkillUseCount(usage.lastClicked[skill.id], now()), context.theme);
        const isHidden = (skill) => visibility.hiddenIDs[skill.id] === true;
        const scope = (skill) => skillScope(skill.path, location()?.directory, homedir());
        const sourceColor = (skill) => skillScopeColor(scope(skill), context.theme);
        const [status, setStatus] = createSignal("Loading skills…");
        const [hoveredID, setHoveredID] = createSignal<string>();
        const [pointedID, setPointedID] = createSignal<string>();
        const [toggleHovered, setToggleHovered] = createSignal(false);
        const [allHovered, setAllHovered] = createSignal(false);
        const [hideHovered, setHideHovered] = createSignal(false);
        const [copyHovered, setCopyHovered] = createSignal(false);
        const [menu, setMenu] = createSignal<{ id: string; x: number; y: number }>();
        const [anchor, setAnchor] = createSignal({ x: 0, y: 0 });
        const [size, setSize] = createSignal({ width: context.renderer.width, height: context.renderer.height });
        const hovered = createMemo(() => skills().find((skill) => skill.id === hoveredID()));
        const placement = createMemo(() => tooltipPlacement(anchor().x, anchor().y, size().width, size().height));
        const menuSkill = createMemo(() => skills().find((skill) => skill.id === menu()?.id));
        const menuPlacement = createMemo(() => contextMenuPlacement(
          menu()?.x ?? 0, menu()?.y ?? 0, size().width, size().height,
          menuSkill() && scope(menuSkill()) === "Global" ? 2 : 1,
        ));
        let hoverTimer: ReturnType<typeof setTimeout> | undefined;
        let hideTimer: ReturnType<typeof setTimeout> | undefined;
        let pressedID: string | undefined;
        let contextPressedID: string | undefined;
        let togglePressed = false;
        let allPressed = false;
        let inserting = false;
        let hidePressedID: string | undefined;
        let hiding = false;
        let copyPressedID: string | undefined;
        let copying = false;
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
        const closeMenu = () => {
          setMenu(undefined);
          setHideHovered(false);
          setCopyHovered(false);
          hidePressedID = undefined;
          copyPressedID = undefined;
          contextPressedID = undefined;
        };
        context.keymap.layer(() => ({
          mode: "global",
          priority: 100,
          commands: menu() ? [{ bind: "escape", run: closeMenu }] : [],
        }));
        const leaveHover = () => {
          setPointedID(undefined);
          pressedID = undefined;
          contextPressedID = undefined;
          clearTimeout(hoverTimer);
          keepOpen();
          // Allow the pointer to cross the one-cell gap into a scrollable card.
          hideTimer = setTimeout(dismiss, 150);
        };
        const beginHover = (id: string, event: MouseEvent) => {
          if (menu()) return;
          dismiss();
          setPointedID(id);
          const target = event.currentTarget;
          setAnchor({
            x: (target?.x ?? event.x) - context.renderer.root.x,
            y: (target?.y ?? event.y) - context.renderer.root.y,
          });
          hoverTimer = setTimeout(() => { setHoveredID(id); }, 250);
        };
        const openMenu = (skill, event: MouseEvent) => {
          const activate = contextPressedID === skill.id && event.button === 2 && !event.isDragging;
          contextPressedID = undefined;
          event.preventDefault();
          event.stopPropagation();
          if (!activate) return;
          dismiss();
          setPointedID(undefined);
          setHideHovered(false);
          setCopyHovered(false);
          setMenu({ id: skill.id, x: event.x - context.renderer.root.x, y: event.y - context.renderer.root.y });
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
        const toggleSkillVisibility = async (skill, event: MouseEvent) => {
          const activate = hidePressedID === skill.id && event.button === 0 && !event.isDragging && !hiding && !copying;
          hidePressedID = undefined;
          event.preventDefault();
          event.stopPropagation();
          if (!activate) return;
          const unhide = isHidden(skill);
          hiding = true;
          try {
            await updateVisibility((draft) => {
              if (unhide) delete draft.hiddenIDs[skill.id];
              else draft.hiddenIDs[skill.id] = true;
            });
            setPointedID(undefined);
            dismiss();
            closeMenu();
          } catch {
            context.ui.toast.show({ message: `Unable to save the hidden skill preference. ${unhide ? "The skill remains hidden." : "Its visibility is unchanged."}`, variant: "warning" });
          } finally {
            hiding = false;
          }
        };
        const copySkill = async (skill, event: MouseEvent) => {
          const activate = copyPressedID === skill.id && event.button === 0 && !event.isDragging
            && !copying && !hiding && scope(skill) === "Global";
          copyPressedID = undefined;
          event.preventDefault();
          event.stopPropagation();
          if (!activate) return;
          const targetLocation = location();
          copying = true;
          closeMenu();
          try {
            const destination = await copySkillToRepo(context.client, skill, targetLocation, homedir());
            context.ui.toast.show({ message: `Skill copied to ${destination}`, variant: "success" });
            context.data.location.skill.invalidate(targetLocation);
            await context.data.location.skill.sync(targetLocation).catch(() => {
              context.ui.toast.show({ message: "Skill copied, but the skill list could not be refreshed. Use /reload.", variant: "warning" });
            });
          } catch (error) {
            context.ui.toast.show({ message: error instanceof Error ? error.message : "Unable to copy the skill to the repo.", variant: "warning" });
          } finally {
            copying = false;
          }
        };
        // Geometry changes invalidate the old row anchor; do not leave a stale card.
        const resize = (width: number, height: number) => {
          setPointedID(undefined);
          dismiss();
          closeMenu();
          setSize({ width, height });
        };
        context.renderer.on("resize", resize);
        const clearHover = () => {
          setPointedID(undefined);
          dismiss();
          closeMenu();
        };
        context.renderer.on("blur", clearHover);
        onCleanup(() => {
          dismiss();
          closeMenu();
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
          skills();
          clearHover();
        });

        const SkillRows = (rows) => (
          <For each={rows.skills}>{(skill) => (
            <box flexDirection="row" width="100%" flexShrink={0} gap={1} paddingRight={2}
              onMouseOver={(event) => beginHover(skill.id, event)}
              onMouseOut={leaveHover}
              onMouseDown={(event) => {
                dismiss();
                pressedID = event.button === 0 ? skill.id : undefined;
                contextPressedID = event.button === 2 ? skill.id : undefined;
                event.preventDefault();
                event.stopPropagation();
              }}
              onMouseUp={(event) => {
                if (event.button === 2) openMenu(skill, event);
                else void insertSkill(skill, event);
              }}
              onMouseScroll={dismiss}>
              <text fg={isHidden(skill) ? "#243B6B" : pointedID() === skill.id ? context.theme.text.base : usageColor(skill)}
                flexGrow={1} flexShrink={1} minWidth={0} wrapMode="word" selectable={false}>{skill.name}</text>
              <text fg={sourceColor(skill)} flexShrink={0} selectable={false}>
                {scope(skill) === "Repo" || scope(skill) === "Built-in" ? "●" : " "}
              </text>
            </box>
          )}</For>
        );

        return (
          <box width="100%" flexDirection="column" flexShrink={0} marginTop={1}>
            <box width="100%" height={1} flexDirection="row" flexShrink={0} paddingRight={1}
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
              }}>
              <text fg={context.theme.text.base} flexGrow={1} flexShrink={1} minWidth={0} height={1} selectable={false}><b>@ {title}</b></text>
              <text fg={allHovered() ? context.theme.text.base : context.theme.text.muted}
                width={showAll() ? 6 : 5} marginRight={1} flexShrink={0} selectable={false}
                onMouseOver={(event) => {
                  event.stopPropagation();
                  setAllHovered(true);
                  setToggleHovered(false);
                  togglePressed = false;
                }}
                onMouseOut={(event) => {
                  event.stopPropagation();
                  setAllHovered(false);
                  allPressed = false;
                }}
                onMouseDown={(event) => {
                  allPressed = event.button === 0;
                  togglePressed = false;
                  event.preventDefault(); event.stopPropagation();
                }}
                onMouseUp={(event) => {
                  const activate = allPressed && event.button === 0 && !event.isDragging;
                  allPressed = false;
                  event.preventDefault(); event.stopPropagation();
                  if (!activate) return;
                  clearHover();
                  setShowAll((value) => !value);
                  if (showAll()) setExpanded(true);
                }}><b>{showAll() ? "[mine]" : "[all]"}</b></text>
              <text fg={toggleHovered() ? context.theme.text.base : context.theme.text.muted} width={3} flexShrink={0} selectable={false}><b>{expanded() ? "[-]" : "[+]"}</b></text>
            </box>
            <Show when={expanded()}>
              <Show when={skills().length > 0} fallback={<text fg={context.theme.text.base}>{status()}</text>}>
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
                  <box flexDirection="row" flexShrink={0} gap={1}>
                    <text fg={context.theme.text.base} flexGrow={1} flexShrink={1} minWidth={0} wrapMode="word"><b>@{skill().name}</b></text>
                  </box>
                   <text fg={context.theme.text.muted} wrapMode="word" flexShrink={0}>
                     Location: <span style={{ fg: sourceColor(skill()) }}>{scope(skill())}</span>
                    </text>
                    <text fg={context.theme.text.muted} wrapMode="word" flexShrink={0}>
                      {skill().path}
                    </text>
                    <box height={1} flexShrink={0} />
                   <scrollbox flexGrow={1} minHeight={0} scrollX={false} scrollY={true}
                     contentOptions={{ flexDirection: "column" }}>
                    <text fg={context.theme.text.muted} wrapMode="word" flexShrink={0}>
                      {skill().description?.trim() || "No description available."}
                    </text>
                  </scrollbox>
                </box>
              </Portal>
            )}</Show>
            <Show when={expanded() && menuSkill()}>{(skill) => (
              <Portal mount={context.renderer.root} ref={(container) => {
                container.position = "absolute";
                container.left = 0;
                container.top = 0;
                container.width = 0;
                container.height = 0;
                container.zIndex = 1001;
              }}>
                <box position="absolute" left={0} top={0} width={size().width} height={size().height} zIndex={1001}
                  onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); closeMenu(); }}
                  onMouseUp={(event) => { event.preventDefault(); event.stopPropagation(); }}>
                  <box position="absolute" left={menuPlacement().left} top={menuPlacement().top}
                    width={menuPlacement().width} height={menuPlacement().height}
                    border borderColor={context.theme.border.base} backgroundColor={context.theme.background.raised.base}
                    paddingLeft={1} paddingRight={1} flexDirection="column">
                    <text fg={hideHovered() ? context.theme.text.base : context.theme.text.muted}
                      width="100%" height={1} selectable={false}
                      onMouseOver={() => setHideHovered(true)}
                      onMouseOut={() => { setHideHovered(false); hidePressedID = undefined; }}
                      onMouseDown={(event) => {
                        hidePressedID = event.button === 0 ? skill().id : undefined;
                        event.preventDefault(); event.stopPropagation();
                      }}
                      onMouseUp={(event) => { void toggleSkillVisibility(skill(), event); }}>{isHidden(skill()) ? "unhide" : "hide"}</text>
                    <Show when={scope(skill()) === "Global"}>
                      <text fg={copyHovered() ? context.theme.text.base : context.theme.text.muted}
                        width="100%" height={1} selectable={false}
                        onMouseOver={() => setCopyHovered(true)}
                        onMouseOut={() => { setCopyHovered(false); copyPressedID = undefined; }}
                        onMouseDown={(event) => {
                          copyPressedID = event.button === 0 ? skill().id : undefined;
                          event.preventDefault(); event.stopPropagation();
                        }}
                        onMouseUp={(event) => { void copySkill(skill(), event); }}>copy to repo</text>
                    </Show>
                  </box>
                </box>
              </Portal>
            )}</Show>
          </box>
        );
      },
    });
  },
});
