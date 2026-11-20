import { Plugin } from "@opencode/plugin/tui";
import { createRenderEffect, createRoot, createSignal, For, onCleanup, Show, untrack } from "solid-js";
import { colors, trackBackground, width, frames, startScanner } from "./scanner.mjs";

const cells = Array.from({ length: width }, (_, index) => index);

function BusyIndicator() {
  const [frame, setFrame] = createSignal(frames[0]);
  onCleanup(startScanner(setFrame));
  return (
    <box flexDirection="row" backgroundColor={trackBackground} paddingLeft={1} paddingRight={1} flexShrink={0}>
      <For each={cells}>{(index) => (
        <text fg={colors[frame()[index]] ?? colors["█"]} bg={trackBackground} width={1} flexShrink={0} selectable={false}>
          {frame()[index] === " " ? " " : "▄"}
        </text>
      )}</For>
    </box>
  );
}

export default Plugin.define({
  id: "local.busy-status",
  setup(context) {
    const [settings, updateSettings] = context.storage.store("status-bar", {
      initial: { hidden: true },
    });
    // Keep the scanner mounted independently of standard footer visibility.
    const removeIndicator = context.ui.slot({
      before: "prompt.footer",
      render: (input) => (
        <Show when={input.sessionID && context.data.session.status(input.sessionID) === "running"}>
          <BusyIndicator />
        </Show>
      ),
    });
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "local.busy-status.statusbar",
        title: settings.hidden ? "Show standard status bar" : "Hide standard status bar",
        palette: true,
        slash: { name: "statusbar" },
        async run() {
          try {
            await updateSettings((draft) => { draft.hidden = !draft.hidden; });
          } catch {
            context.ui.toast.show({ message: "Unable to save status bar preference", variant: "error" });
          }
        },
      }],
    }));
    return createRoot((dispose) => {
      onCleanup(removeIndicator);
      // Durable stores synchronize across clients, so react to external edits
      // as well as this client's command. Slot registration stays untracked.
      createRenderEffect(() => {
        if (!settings.hidden) return;
        const removeFooter = untrack(() => context.ui.slot({
          replace: "prompt.footer", render: () => null,
        }));
        onCleanup(removeFooter);
      });
      return dispose;
    });
  },
});
