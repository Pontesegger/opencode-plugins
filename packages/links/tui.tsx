import { Plugin } from "@opencode/plugin/tui";
import { Portal } from "@opentui/solid";
import { TextAttributes, type MouseEvent } from "@opentui/core";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Links } from "./rpc.ts";
import { tooltipPlacement } from "./links.mjs";

type Link = { url: string; label: string; description?: string };
const hoverColor = "#7dd3fc";

export default Plugin.define({
  id: "local.links.tui",
  setup(context) {
    const rpc = context.client.rpc(Links);
    return context.ui.slot({
      // Skills contributes inside sidebar.content. Render after that whole slot,
      // independent of whether server or CLI plugins are loaded first.
      after: "sidebar.content",
      render: (props) => {
        const [links, setLinks] = createSignal<Link[]>([]);
        const [hoveredURL, setHoveredURL] = createSignal<string>();
        const [pointedURL, setPointedURL] = createSignal<string>();
        const [anchor, setAnchor] = createSignal({ x: 0, y: 0 });
        const [size, setSize] = createSignal({ width: context.renderer.width, height: context.renderer.height });
        const hovered = createMemo(() => links().find((link) => link.url === hoveredURL()));
        const placement = createMemo(() => tooltipPlacement(anchor().x, anchor().y, size().width, size().height));
        let hoverTimer: ReturnType<typeof setTimeout> | undefined;
        let hideTimer: ReturnType<typeof setTimeout> | undefined;
        const keepOpen = () => { clearTimeout(hideTimer); hideTimer = undefined; };
        const dismiss = () => {
          keepOpen();
          clearTimeout(hoverTimer);
          hoverTimer = undefined;
          setHoveredURL(undefined);
        };
        const leaveHover = () => {
          setPointedURL(undefined);
          clearTimeout(hoverTimer);
          keepOpen();
          // Allow the pointer to cross the one-cell gap into the scrollable card.
          hideTimer = setTimeout(dismiss, 150);
        };
        const beginHover = (url: string, event: MouseEvent) => {
          dismiss();
          setPointedURL(url);
          const target = event.currentTarget;
          setAnchor({
            x: (target?.x ?? event.x) - context.renderer.root.x,
            y: (target?.y ?? event.y) - context.renderer.root.y,
          });
          hoverTimer = setTimeout(() => setHoveredURL(url), 250);
        };
        const clearHover = () => { setPointedURL(undefined); dismiss(); };
        const resize = (width: number, height: number) => { clearHover(); setSize({ width, height }); };
        context.renderer.on("resize", resize);
        context.renderer.on("blur", clearHover);
        onCleanup(() => {
          clearHover();
          context.renderer.off("resize", resize);
          context.renderer.off("blur", clearHover);
        });
        const abort = new AbortController();
        let generation = 0;
        async function refresh() {
          const sessionID = props.sessionID;
          const request = ++generation;
          try {
            const value = await rpc.list({ sessionID }, {
              location: context.data.session.get(sessionID)?.location ?? context.location,
              signal: abort.signal,
            });
            if (abort.signal.aborted || request !== generation) return;
            clearHover();
            setLinks(value as Link[]);
          } catch {
            // Preserve any known links on transient failures; an empty section
            // stays invisible rather than showing loading/error placeholders.
          }
        }
        const stopUpdates = rpc.events.on("updated", (event) => {
          if ((event.data as { sessionID: string }).sessionID === props.sessionID) void refresh();
        }, { signal: abort.signal });
        const stopReconnect = context.data.listen(({ details }) => {
          if (details.type === "server.connected" || details.type === "location.shutdown") void refresh();
        });
        createEffect(() => {
          props.sessionID;
          clearHover();
          setLinks([]);
          void refresh();
        });
        onCleanup(() => { abort.abort(); generation++; stopUpdates(); stopReconnect(); });
        return (
          <Show when={links().length > 0}>
            <box flexDirection="column" flexShrink={0} marginTop={1}>
              <text fg={context.theme.text.base}><b>Links</b></text>
              <box flexDirection="column" paddingLeft={2} flexShrink={0}>
                <For each={links()}>{(link) => (
                  <box width="100%" flexShrink={0}
                    onMouseOver={(event) => beginHover(link.url, event)}
                    onMouseOut={leaveHover} onMouseDown={dismiss} onMouseScroll={dismiss}>
                    <text fg={pointedURL() === link.url ? hoverColor : context.theme.text.muted}
                      attributes={pointedURL() === link.url ? TextAttributes.UNDERLINE : 0}
                      wrapMode="word" flexShrink={0}>
                      <a href={link.url}>{link.label}</a>
                    </text>
                  </box>
                )}</For>
              </box>
              <Show when={hovered()}>{(link) => (
                <Portal mount={context.renderer.root} ref={(container) => {
                  // Keep the portal out of layout and above the app without stealing row hover hits.
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
                      <text fg={context.theme.text.base} wrapMode="word" flexShrink={0}><b>{link().label}</b></text>
                      <Show when={link().description}>
                        <text fg={context.theme.text.muted} wrapMode="word" flexShrink={0}>{link().description}</text>
                      </Show>
                      <text fg={hoverColor} wrapMode="word" flexShrink={0}>
                        <a href={link().url}>{link().url}</a>
                      </text>
                    </scrollbox>
                  </box>
                </Portal>
              )}</Show>
            </box>
          </Show>
        );
      },
    });
  },
});
