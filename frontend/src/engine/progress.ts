/**
 * MySpeed — shared progress estimation.
 *
 * Uses elapsed wall-clock time as the progress metric — monotonically
 * increasing, no jumps.  The previous approach (totalBytes / (speed *
 * maxDuration)) was non-monotonic: when the sampled speed fluctuated,
 * maxBytes changed and progress bounced up/down.
 */

/** Estimate progress (0–1) within a test phase, based on elapsed time.
 *  @param elapsed  ms since phase start
 *  @param maxDuration  total phase duration in seconds
 *  @param warmupDuration  warmup period in seconds (not counted as progress) */
export function estimateProgress(
  elapsed: number,
  maxDuration: number,
  warmupDuration: number,
): number {
  const maxMs = maxDuration * 1000;
  const warmupMs = warmupDuration * 1000;
  const testMs = maxMs - warmupMs;
  if (testMs <= 0) return Math.min(1, elapsed / maxMs);
  const effective = Math.max(0, elapsed - warmupMs);
  return Math.min(1, effective / testMs);
}