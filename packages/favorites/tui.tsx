import { Plugin } from "@opencode/plugin/tui";
import { createSignal, For, Show } from "solid-js";
import { favorites, showAllCommands, submitFavorite } from "./commands.mjs";

const allCommandsLabel = "Show all commands";
const items = [...favorites, allCommandsLabel];

export default Plugin.define({
  id: "local.favorites",
  setup(context) {
    const [expanded, setExpanded] = createSignal(true);
    return context.ui.slot({
      append: "sidebar.content",
      render: () => {
        const [hovered, setHovered] = createSignal<string>();
        const [toggleHovered, setToggleHovered] = createSignal(false);
        const [busy, setBusy] = createSignal(false);
        let pressed: string | undefined;
        let togglePressed = false;
        return (
          <box width="100%" flexDirection="column" flexShrink={0} marginTop={1}>
            <box width="100%" height={1} flexDirection="row" flexShrink={0} paddingRight={1}>
              <text fg={context.theme.text.base} flexGrow={1} flexShrink={1} minWidth={0} height={1}><b>Favorites</b></text>
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
                  pressed = undefined;
                  setHovered(undefined);
                  setExpanded((value) => !value);
                }}><b>{expanded() ? "[-]" : "[+]"}</b></text>
            </box>
            <Show when={expanded()}>
              <box flexDirection="column" paddingLeft={2} flexShrink={0}>
                <For each={items}>{(command) => (
                  <box width="100%" flexShrink={0} marginTop={command === allCommandsLabel ? 1 : 0}
                    onMouseOver={() => setHovered(command)}
                    onMouseOut={() => { setHovered(undefined); pressed = undefined; }}
                    onMouseDown={(event) => {
                      pressed = event.button === 0 && !busy() ? command : undefined;
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onMouseUp={async (event) => {
                      const activate = event.button === 0 && !event.isDragging && pressed === command && !busy();
                      pressed = undefined;
                      if (!activate) return;
                      event.preventDefault();
                      event.stopPropagation();
                      setBusy(true);
                      try {
                        if (command === allCommandsLabel) await showAllCommands(context);
                        else await submitFavorite(context, command);
                      } catch {
                        context.ui.toast.show({ message: command === allCommandsLabel
                          ? "Unable to open the command palette. It may be unavailable in the current view."
                          : `Unable to run /${command}. The command may be unavailable in the current view.`, variant: "warning" });
                      } finally {
                        setBusy(false);
                      }
                    }}>
                    <text fg={hovered() === command ? context.theme.text.base : context.theme.text.muted}
                      selectable={false}>{command === allCommandsLabel ? command : `/${command}`}</text>
                  </box>
                )}</For>
              </box>
            </Show>
          </box>
        );
      },
    });
  },
});
