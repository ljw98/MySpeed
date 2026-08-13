/**
 * MySpeed — UI: circular speedometer ring.
 *
 * The arc behaves like a car speedometer needle: it tracks the live speed
 * on a log scale (10 Mbps → 0%, 25 Gbps → 100%) during download/upload
 * phases, and fills green when the run finishes.
 */

import type { TestSnapshot } from '../engine/types';
import { Phase } from '../engine/types';
import { els } from './dom';
import { formatSpeedInt, formatSpeedUnit } from './format';
import { detectTier } from './tier';

/** All tier icon paths for preloading. */
const TIER_ICONS = ['/icons/snail.png', '/icons/bicycle.png', '/icons/car.png', '/icons/train.png', '/icons/rocket.png'];
// Fetch & cache icons as blob URLs so the <img> element never needs a
// second network round-trip when the test completes.  The browser's HTTP
// cache isn't reliable here — new Image() / link rel=preload can still
// trigger a redundant fetch when the img src is set later.
const _iconBlobCache = new Map<string, string>();
(async () => {
  for (const src of TIER_ICONS) {
    try {
      const resp = await fetch(src);
      const blob = await resp.blob();
      _iconBlobCache.set(src, URL.createObjectURL(blob));
    } catch {
      // Ignore — will fall through to the normal src path.
    }
  }
})();

/** Map tier ID to icon file path. */
function tierIconPath(tierId: string): string {
  switch (tierId) {
    case '100m': return '/icons/snail.png';
    case '1g':   return '/icons/bicycle.png';
    case '2g5':  return '/icons/car.png';
    case '10g':  return '/icons/train.png';
    default:     return '/icons/rocket.png'; // 25g
  }
}

/** Map tier ID to display label. */
function tierLabel(tierId: string): string {
  switch (tierId) {
    case '100m': return '百兆';
    case '1g':   return '千兆';
    case '2g5':  return '2.5G';
    case '10g':  return '万兆';
    case '25g':  return '25G';
    default:     return 'Mbps';
  }
}

import { setWaterLevel } from './wave';

export const RADIUS = 108;
export const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Initialise the ring (dash array + offset).
 *  Temporarily disables the transition so the ring starts empty
 *  without a visible animation from the browser's default state. */
export function initRing(): void {
  els.progressRing.style.transition = 'none';
  els.progressRing.style.strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE}`;
  els.progressRing.style.strokeDashoffset = `${CIRCUMFERENCE}`;
  // Force a layout so the non-transition offset is committed before
  // we re-enable transitions.
  void els.progressRing.getBoundingClientRect();
  els.progressRing.style.transition = '';
}

/** Set progress ring to a percentage (0–100). */
function ringSetPct(percent: number): void {
  const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;
  els.progressRing.style.strokeDashoffset = String(offset);
}

/** Dial arc tier boundaries (Mbps): five equal 20% arcs, one per tier. */
const DIAL_BOUNDS = [10, 100, 1000, 2500, 10000, 25000];

/** Map a speed to a dial percentage on the equal-arc tier scale: each of the
 *  five tiers spans 1/5 of the arc, log-interpolated within a tier.
 *  10 Mbps → 0%, 100 Mbps → 20%, 1 Gbps → 40%, 2.5 Gbps → 60%,
 *  10 Gbps → 80%, 25 Gbps → 100%. */
export function speedToPct(mbps: number): number {
  const clamped = Math.min(Math.max(mbps, DIAL_BOUNDS[0]), DIAL_BOUNDS[5]);
  let tier = 0;
  while (tier < 4 && clamped > DIAL_BOUNDS[tier + 1]) tier++;
  const lo = DIAL_BOUNDS[tier];
  const hi = DIAL_BOUNDS[tier + 1];
  const t = (Math.log10(clamped) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
  return (tier + t) * 20;
}

/** Overall test progress (0–100) for the water tank:
 *  latency 0–8%, download 8–50%, upload 50–100%. */
function overallProgress(snapshot: TestSnapshot): number | null {
  switch (snapshot.phase) {
    case Phase.Latency:
      return snapshot.latencyProgress * 8;
    case Phase.Download:
      return 8 + snapshot.downloadProgress * 42;
    case Phase.Upload:
      return 50 + snapshot.uploadProgress * 50;
    case Phase.Finished:
      return 100;
    default:
      return null;
  }
}

/** Drive the water tank: water level = overall progress; full tank = done.
 *  Aborted keeps the water where it stopped; Idle/Preparing drain it.
 *  The level is eased by the wave animator; the 'active' class fades the
 *  SVG in, and the submerged/done classes adjust text colour + palette. */
export function setWater(snapshot: TestSnapshot): void {
  if (snapshot.phase === Phase.Aborted) return;
  if (snapshot.phase === Phase.Idle || snapshot.phase === Phase.Preparing) {
    els.waterTank.classList.remove('active', 'done', 'submerged');
    setWaterLevel(null);
    return;
  }
  const pct = overallProgress(snapshot);
  if (pct === null) return;
  els.waterTank.classList.add('active');
  setWaterLevel(pct);
  els.waterTank.classList.toggle('submerged', pct >= 50);
  els.waterTank.classList.toggle('done', snapshot.phase === Phase.Finished);
}

/** Finished phase: show tier icon + arc stops at the final speed. */
function handleFinished(snapshot: TestSnapshot): void {
  const finalSpeed = Math.max(
    snapshot.downloadSpeedMbps ?? 0,
    snapshot.uploadSpeedMbps ?? 0,
  );
  els.progressRing.style.stroke = 'url(#completeGradient)';
  els.progressValue.style.display = 'none';
  els.progressUnit.style.display = '';
  if (finalSpeed > 0) {
    ringSetPct(speedToPct(finalSpeed));
    const tierId = detectTier(finalSpeed);
    const cached = _iconBlobCache.get(tierIconPath(tierId));
    els.tierIcon.src = cached ?? tierIconPath(tierId);
    els.tierIcon.style.display = 'block';
    els.progressUnit.textContent = tierLabel(tierId);
  } else {
    // Edge case: both download and upload are 0 Mbps.
    ringSetPct(100);
    els.tierIcon.style.display = 'none';
    els.progressUnit.textContent = '';
  }
}

/** Latency phase: show placeholder, clear ring to 0. */
function handleLatency(): void {
  els.progressRing.style.stroke = 'url(#progressGradient)';
  ringSetPct(0);
  els.progressValue.textContent = '--';
  els.progressUnit.textContent = 'Mbps';
  els.progressValue.style.display = '';
  els.progressUnit.style.display = '';
  els.tierIcon.style.display = 'none';
}

/** Show the live speed on the ring (Download/Upload phases). */
function handleLivePhase(speed: number | null): void {
  els.progressRing.style.stroke = 'url(#progressGradient)';
  els.tierIcon.style.display = 'none';
  els.progressValue.style.display = '';
  els.progressUnit.style.display = '';
  if (speed === null) {
    // Warmup period: no sample yet — empty arc and a placeholder.
    ringSetPct(0);
    els.progressValue.textContent = '--';
    els.progressUnit.textContent = 'Mbps';
    return;
  }
  ringSetPct(speedToPct(speed));
  els.progressValue.textContent = formatSpeedInt(speed);
  els.progressUnit.textContent = formatSpeedUnit(speed);
}

/** Aborted, Preparing, Idle: keep the previous ring state visible. */
function handleStatic(): void {
  els.tierIcon.style.display = 'none';
  els.progressValue.style.display = '';
  els.progressUnit.style.display = '';
}

/** Update the ring based on the current snapshot. During Preparing/Idle we
 *  skip the update entirely so the ring retains its previous state — the
 *  user can see the last run's results until new data arrives. */
export function setProgress(snapshot: TestSnapshot): void {
  switch (snapshot.phase) {
    case Phase.Download:
      handleLivePhase(snapshot.downloadSpeedMbps);
      break;
    case Phase.Upload:
      handleLivePhase(snapshot.uploadSpeedMbps);
      break;
    case Phase.Finished:
      handleFinished(snapshot);
      break;
    case Phase.Latency:
      handleLatency();
      break;
    case Phase.Aborted:
    case Phase.Idle:
    case Phase.Preparing:
      handleStatic();
      break;
  }
}