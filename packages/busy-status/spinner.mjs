export const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const background = "#d71920";
export const foreground = "#ffffff";

// Own a timer only while the busy component is mounted. Inject the clock for tests.
export function startSpinner(update, clock = globalThis) {
  let index = 0;
  update(frames[index]);
  const timer = clock.setInterval(() => {
    index = (index + 1) % frames.length;
    update(frames[index]);
  }, 80);
  return () => clock.clearInterval(timer);
}
