import { Plugin } from "@opencode/plugin/tui";
import { createSignal, For, onCleanup, Show } from "solid-js";
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
    return context.ui.slot({
      prepend: "prompt.footer.status",
      render: (input) => (
        <Show when={input.sessionID && context.data.session.status(input.sessionID) === "running"}>
          <BusyIndicator />
        </Show>
      ),
    });
  },
});
