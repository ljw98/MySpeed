/**
 * MySpeed — UI: sine-wave water tank.
 *
 * Direct port of LKAWaveCircleProgressBar's WaveLayer: the water body is a
 * filled sine path, y = A·sin(W·x + U + offsetU) + levelY, closed down to
 * the tank bottom. Two translucent layers (phase offset 0.8π, amplitudes
 * 5%/8% of width, 0.8 cycles across) stack like the reference's dual waves;
 * the round tank's overflow clip cuts coloured water at the rim — no
 * straight edge, no ghost crescents.
 *
 * The animation loop lives here: it starts when the tank becomes active
 * and stops itself once the tank is hidden and the level has drained.
 *
 * Note: queries its own DOM nodes instead of importing `els` to avoid an
 * import cycle (dom → ring → wave → dom).
 */

const SIZE = 240; // matches the viewBox
const STEP = 4;   // path sample step in viewBox units
const W = (2 * Math.PI / SIZE) * 0.8;            // ref: 2π/width * 0.8
const AMP = [SIZE * 0.05, SIZE * 0.08];          // ref: width * (0.05 + 0.03*i)
const PHASE = [0, Math.PI * 0.8];                // ref: offsetU = i * π * 0.8
const PERIOD = [1.8, 2.4];                       // seconds per wavelength roll

let level = SIZE;  // smoothed waterline y (viewBox units)
let target = SIZE;
const u = [0, 0];
let last: number | null = null;
let raf: number | null = null;

function node(id: string): SVGPathElement | HTMLElement | null {
  return document.getElementById(id);
}

/** Water level from overall progress; null drains the tank.
 *  Any non-null level (re)arms the animation loop — the loop self-stops
 *  while the tank is hidden and drained (Preparing), so it must be
 *  restarted when the next phase raises the water. */
export function setWaterLevel(pct: number | null): void {
  target = pct === null ? SIZE : SIZE * (1 - pct / 100);
  if (pct !== null) ensureWaveLoop();
}

function wavePath(i: number): string {
  const parts: string[] = [];
  for (let x = 0; x <= SIZE; x += STEP) {
    const y = AMP[i] * Math.sin(W * x + u[i] + PHASE[i]) + level;
    parts.push(`${x === 0 ? 'M' : 'L'}${x},${y.toFixed(2)}`);
  }
  parts.push(`L${SIZE},${SIZE}L0,${SIZE}Z`);
  return parts.join('');
}

/** Advance the rolling animation + ease the level toward its target. */
export function tickWaves(now: number): void {
  if (last === null) last = now;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  level += (target - level) * Math.min(1, dt * 4);
  if (Math.abs(target - level) < 0.1) level = target;
  for (let i = 0; i < 2; i++) {
    u[i] += (dt * 2 * Math.PI) / PERIOD[i];
    // Keep phase values bounded to avoid IEEE 754 precision loss from
    // unbounded accumulation over long-running sessions.
    if (u[i] > 2 * Math.PI * 100) u[i] -= 2 * Math.PI * 100;
  }

  const front = node('waveFront') as SVGPathElement | null;
  const back = node('waveBack') as SVGPathElement | null;
  if (front) front.setAttribute('d', wavePath(0));
  if (back) back.setAttribute('d', wavePath(1));
}

function frame(now: number): void {
  tickWaves(now);
  const tank = node('waterTank');
  const hidden = !tank || !tank.classList.contains('active');
  // Stop only when the tank is hidden AND the level has fully drained —
  // otherwise a fresh start (Preparing drains, then Download fills) would
  // leave the surface frozen.
  if (hidden && Math.abs(target - level) < 0.1) {
    raf = null;
    return;
  }
  raf = requestAnimationFrame(frame);
}

/** Arm the rolling animation if it isn't already running. */
export function ensureWaveLoop(): void {
  if (raf === null) {
    last = null;
    raf = requestAnimationFrame(frame);
  }
}
