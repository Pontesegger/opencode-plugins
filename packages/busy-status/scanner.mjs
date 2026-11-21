// Shade symbols describe colors; the TUI draws all five as centered rectangles.
export const width = 14;
const travel = width - 1;
const positions = Array.from({ length: 2 * travel }, (_, index) =>
  index <= travel ? index : 2 * travel - index,
);
export const frames = positions.map((_, index) => {
  const cells = Array(width).fill(" ");
  // Paint oldest to newest so revisiting a trail cell never hides the bright head.
  // At a reversal the oldest trail briefly overlaps the head: do not teleport it.
  for (const age of [4, 3, 2, 1, 0]) {
    const position = positions[(index - age + positions.length) % positions.length];
    cells[position] = ["█", "▓", "▒", "░", "·"][age];
  }
  return cells.join("");
});
export const stepInterval = 90;
export const colors = { "█": "#ff0000", "▓": "#cc0000", "▒": "#880000", "░": "#500000", "·": "#300000" };
export const trackBackground = "#200508";
export const bracketColor = "#801010";

// Own a timer only while the busy component is mounted. Inject the clock for tests.
export function startScanner(update, clock = globalThis) {
  let index = 0;
  let stopped = false;
  let timer;
  function draw() {
    if (stopped) return;
    update(frames[index]);
    timer = clock.setTimeout(() => {
      index = (index + 1) % frames.length;
      draw();
    }, stepInterval);
  }
  draw();
  return () => {
    stopped = true;
    clock.clearTimeout(timer);
  };
}
