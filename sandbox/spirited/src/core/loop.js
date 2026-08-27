// Fixed-ish frame loop with a clamped delta so a background tab doesn't
// teleport the player through a wall on return.

export function startLoop(step) {
  let last = performance.now();
  let raf = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt, now / 1000);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
