export const outputLimit = 65_536;

// Output is displayed as text, never interpreted as terminal control sequences.
export function plainOutput(text) {
  return text.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[ -/]*[@-~]/g, "")
    .replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

export function watchOutput(client, shell, location, update, schedule = setTimeout, cancel = clearTimeout) {
  const abort = new AbortController();
  let timer;
  let cursor;
  let output = "";
  let truncated = false;
  let current = shell;
  async function poll() {
    let delay = 1000;
    let again = true;
    try {
      if (current.status === "running") {
        const response = await client.shell.get({ id: shell.id, location }, { signal: abort.signal });
        if (abort.signal.aborted) return;
        current = response.data;
      }
      if (cursor === undefined) {
        const probe = await client.shell.output({ id: shell.id, location, cursor: Number.MAX_SAFE_INTEGER }, { signal: abort.signal });
        if (abort.signal.aborted) return;
        cursor = Math.max(0, probe.data.size - outputLimit);
        truncated = cursor > 0;
      }
      const response = await client.shell.output({ id: shell.id, location, cursor, limit: outputLimit }, { signal: abort.signal });
      if (abort.signal.aborted) return;
      const previous = cursor;
      cursor = response.data.cursor;
      output += response.data.output;
      if (output.length > outputLimit) {
        output = output.slice(-outputLimit);
        truncated = true;
      }
      update({ shell: current, output: plainOutput(output), truncated, error: "" });
      const more = cursor > previous && cursor < response.data.size;
      delay = more ? 0 : 1000;
      again = more || current.status === "running";
    } catch {
      if (!abort.signal.aborted) update({ shell: current, output: plainOutput(output), truncated, error: "Unable to read shell output. Retrying…" });
    }
    if (!abort.signal.aborted && again) timer = schedule(poll, delay);
  }
  void poll();
  return () => { abort.abort(); cancel(timer); };
}
