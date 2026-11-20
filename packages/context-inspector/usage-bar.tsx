import { usePlugin } from "@opencode/plugin/tui";
import { createMemo, createSignal, Show } from "solid-js";
import { barState, formatCost, formatTokens, latestContextUsage } from "./usage.mjs";

const colors = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
};

export function UsageBar(props: { sessionID?: string; mode: string; onToggle: () => void }) {
  const context = usePlugin();
  const [hovered, setHovered] = createSignal(false);
  const measurement = createMemo(() => latestContextUsage(props.sessionID
    ? context.data.session.message.list(props.sessionID)
    : []));
  const usage = () => measurement().used;
  const limit = createMemo(() => {
    const session = props.sessionID ? context.data.session.get(props.sessionID) : undefined;
    const selected = context.ui.model.current();
    const providerID = selected?.providerID ?? session?.model?.providerID;
    const modelID = selected?.modelID ?? session?.model?.id;
    const models = context.data.location.model.list(session?.location ?? context.location) ?? [];
    const model = models.find((item) => item.providerID === providerID && item.id === modelID)
      ?? models.find((item) => item.providerID === providerID && item.modelID === modelID);
    return model?.limit.context;
  });
  const state = createMemo(() => barState(usage(), limit(), context.options));
  const cost = createMemo(() => props.sessionID ? context.data.session.cost(props.sessionID) : 0);
  const color = () => state().level === "unknown"
    ? context.theme.text.base
    : colors[state().level as keyof typeof colors];

  return (
    <Show when={props.sessionID && props.mode === "normal"}>
      <box flexDirection="row" paddingLeft={1} flexShrink={0} flexGrow={1} justifyContent="flex-end">
        <text fg={hovered() ? context.theme.text.base : context.theme.text.muted} selectable={false}
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => setHovered(false)}
          onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
          onMouseUp={(event) => {
            if (event.button !== 0) return;
            event.preventDefault(); event.stopPropagation(); props.onToggle();
          }}>Context</text>
        <text fg={context.theme.text.base}> [</text>
        <text fg={color()}>{state().filled}</text>
        <text fg={context.theme.text.base}>{state().empty}] </text>
        <text fg={color()}>
          {state().known
            ? `${state().percent}% · ${formatTokens(usage()!)}/${formatTokens(limit()!)}`
            : usage() !== undefined
              ? `${formatTokens(usage()!)} tokens · window unknown`
              : measurement().status === "compacted"
                ? "? · compacted"
                : measurement().status === "compacting"
                  ? "? · compacting"
                  : "awaiting usage"}
        </text>
        <text fg="#7dd3fc">{` (${formatCost(cost())})`}</text>
      </box>
    </Show>
  );
}
