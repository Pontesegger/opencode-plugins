import type { Goal } from "@opencode/schema/goal";
import type { Context } from "@opencode/plugin/tui/context";
import { Show } from "solid-js";

const labels = { active: "Active", paused: "Paused", complete: "Met" };

/** Shared by the floating preview and the read-only details dialog. */
export function GoalDetails(props: { goal: Goal.State; context: Context }) {
  return (
    <box flexDirection="column" flexShrink={0}>
      <text height={1} flexShrink={0} wrapMode="none" fg={props.context.theme.text.base}>Status: {labels[props.goal.status]}</text>
      <text wrapMode="word" flexShrink={0} fg={props.context.theme.text.base}>{props.goal.objective}</text>
      <Show when={props.goal.reason}><text wrapMode="word" flexShrink={0} fg={props.context.theme.text.muted}>Reason: {props.goal.reason}</text></Show>
      <text wrapMode="word" flexShrink={0} fg={props.context.theme.text.muted}>Continuations: {props.goal.rounds} / {props.goal.maxRounds}</text>
    </box>
  );
}
