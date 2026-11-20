import type { ShellInfo } from "@opencode/client";
import type { Context } from "@opencode/plugin/tui/context";
import type { ScrollBoxRenderable } from "@opentui/core";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { watchOutput } from "./output.mjs";

export function ShellView(props: { context: Context; shell: ShellInfo; location: { directory: string }; close: () => void }) {
  const context = props.context;
  const [state, setState] = createSignal({ shell: props.shell, output: "", truncated: false, error: "" });
  const [follow, setFollow] = createSignal(true);
  let scroll: ScrollBoxRenderable | undefined;
  onCleanup(watchOutput(context.client, props.shell, props.location, setState));
  const move = (amount: number, unit?: "viewport") => { setFollow(false); scroll?.scrollBy(amount, unit); };
  context.keymap.layer(() => ({
    priority: 20,
    commands: [
      { bind: "escape", title: "Return to main agent", run: props.close },
      { bind: "up", run: () => move(-1) }, { bind: "down", run: () => move(1) },
      { bind: "pageup", run: () => move(-1, "viewport") }, { bind: "pagedown", run: () => move(1, "viewport") },
      { bind: "home", run: () => { setFollow(false); scroll?.scrollTo(0); } },
      { bind: "end", run: () => { setFollow(true); scroll?.scrollTo(Infinity); } },
    ],
  }));
  createEffect(() => { state().output; if (follow()) scroll?.afterLayout(() => { if (follow()) scroll?.scrollTo(Infinity); }); });
  return (
    <box width="100%" height="100%" flexDirection="column" paddingLeft={1} paddingRight={1}>
      <text height={1} flexShrink={0} wrapMode="none" truncate fg={context.theme.text.base}>Shell · {state().shell.status}{state().shell.exit !== undefined ? ` · exit ${state().shell.exit}` : ""}</text>
      <text height={1} flexShrink={0} wrapMode="none" truncate fg={context.theme.text.base}>{props.shell.command}</text>
      <text height={1} flexShrink={0} wrapMode="none" truncate fg={context.theme.text.muted}>{props.shell.cwd}</text>
      <Show when={state().truncated}><text height={1} flexShrink={0} fg={context.theme.text.muted}>Earlier output omitted; showing recent output.</text></Show>
      <Show when={state().error}><text height={1} flexShrink={0} fg={context.theme.text.muted}>{state().error}</text></Show>
      <scrollbox ref={(value) => { scroll = value; }} flexGrow={1} minHeight={0} scrollX={false} scrollY={true}
        onMouseScroll={() => setFollow(false)} contentOptions={{ flexDirection: "column" }}>
        <text wrapMode="word" flexShrink={0} fg={context.theme.text.base} selectable>{state().output || "Awaiting captured stdout/stderr…"}</text>
      </scrollbox>
      <text height={1} flexShrink={0} wrapMode="none" truncate fg={context.theme.text.muted}>Read-only · Esc return · ↑/↓/wheel scroll · PgUp/PgDn · Home · End follow</text>
    </box>
  );
}
