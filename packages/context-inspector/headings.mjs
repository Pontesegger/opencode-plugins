/** Source-line anchors only; the captured text is never rewritten. */
export function headingLines(text) {
  const lines = text.split(/\r?\n/);
  const headings = [];
  let fence;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (marker) { fence = marker[1]; continue; }
    if (/^ {0,3}#{1,6}(?:[ \t]+\S|[ \t]*$)/.test(line)) headings.push(index);
    else if (line.trim() && !/^ {4}|^\t/.test(line) && /^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[index + 1] ?? "")) {
      headings.push(index);
      index++;
    }
  }
  return headings;
}

/** Use the renderer's actual wrapped lines, not estimated terminal widths. */
export function headingOffsets(sourceLines, visualSources, top) {
  const wanted = new Set(sourceLines);
  const offsets = [];
  for (let row = 0; row < visualSources.length; row++) {
    const source = visualSources[row];
    if (wanted.delete(source)) offsets.push(top + row);
  }
  return offsets;
}

export function adjacentHeading(offsets, top, direction) {
  const ordered = [...new Set(offsets)].sort((a, b) => a - b);
  // Half a cell avoids reselecting an anchor due to fractional wheel offsets.
  return direction > 0 ? ordered.find((offset) => offset > top + 0.5)
    : ordered.reverse().find((offset) => offset < top - 0.5);
}
