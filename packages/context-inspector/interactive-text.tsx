import type { Context } from "@opencode/plugin/tui/context";
import { useRenderer } from "@opentui/solid";
import { createSignal, onCleanup, type JSX } from "solid-js";

/** Common hover/click feedback for neutral controls and semantic category labels. */
export function InteractiveText(props: { context: Context; color?: string; onClick: () => void; children: JSX.Element }) {
  const [hovered, setHovered] = createSignal(false);
  const renderer = useRenderer();
  let pressed = false;
  const reset = () => { setHovered(false); pressed = false; };
  renderer.on("blur", reset);
  renderer.on("resize", reset);
  onCleanup(() => {
    renderer.off("blur", reset);
    renderer.off("resize", reset);
  });
  return (
    <text height={1} flexShrink={0} wrapMode="none" selectable={false}
      fg={hovered() ? props.context.theme.text.base : props.color ?? props.context.theme.text.muted}
      onMouseOver={() => setHovered(true)} onMouseOut={reset}
      onMouseDown={(event) => {
        pressed = event.button === 0;
        event.preventDefault(); event.stopPropagation();
      }}
      onMouseUp={(event) => {
        const activate = pressed && event.button === 0 && !event.isDragging;
        pressed = false;
        event.preventDefault(); event.stopPropagation();
        if (activate) props.onClick();
      }}>{props.children}</text>
  );
}
