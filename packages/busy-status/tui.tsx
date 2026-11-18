import { Plugin } from "@opencode/plugin/tui";
import { createSignal, onCleanup, Show } from "solid-js";
import { background, foreground, frames, startSpinner } from "./spinner.mjs";

function BusyIndicator() {
  const [frame, setFrame] = createSignal(frames[0]);
  onCleanup(startSpinner(setFrame));
  return (
    <text fg={foreground} bg={background} flexShrink={0} selectable={false}>
      <b>{` ${frame()}  BUSY `}</b>
    </text>
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
