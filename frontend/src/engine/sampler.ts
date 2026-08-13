/**
 * MySpeed — Sampler.
 *
 * Collects bytes-vs-time samples during a test run and derives:
 *  - current speed (Mbps) over a sliding window
 *  - coefficient-of-variation (stability metric for early termination)
 */

export class Sampler {
  /** Each entry: [cumulativeBytes, elapsedMs]. */
  private samples: Array<[number, number]> = [];
  private readonly windowSize: number;
  private startBytes = 0;
  private startMs = 0;
  private counting = false;

  constructor(windowSize = 5) {
    this.windowSize = windowSize;
  }

  /** Begin counting after warmup. Pass the cumulative bytes seen so far so
   *  the delta starts from zero. */
  beginWarmupDone(cumulativeBytes: number, elapsedMs: number): void {
    this.startBytes = cumulativeBytes;
    this.startMs = elapsedMs;
    this.counting = true;
    this.samples = [];
  }

  /** Record a sample point. */
  record(cumulativeBytes: number, elapsedMs: number): void {
    if (!this.counting) return;
    this.samples.push([cumulativeBytes - this.startBytes, elapsedMs - this.startMs]);
    if (this.samples.length > this.windowSize) {
      this.samples.shift();
    }
  }

  /** Current speed in Mbps (megabits per second) over the sliding window.
   *  Returns null if insufficient data (< 2 samples or zero elapsed) —
   *  callers must NOT render 0 in this case, it would flash a fake value
   *  before the first real reading. */
  currentSpeedMbps(overheadCompensation: number): number | null {
    if (this.samples.length < 2) return null;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const deltaBytes = last[0] - first[0];
    const deltaMs = last[1] - first[1];
    if (deltaMs <= 0) return null;
    const bits = deltaBytes * 8 * overheadCompensation;
    return bits / (deltaMs / 1000) / 1_000_000; // Mbps (decimal)
  }

  /** Coefficient of variation (stddev / mean) of per-interval speeds.
   *  Low CV → stable throughput → safe to end early. */
  coefficientOfVariation(): number {
    if (this.samples.length < 3) return Infinity;
    const intervalSpeeds: number[] = [];
    for (let i = 1; i < this.samples.length; i++) {
      const db = this.samples[i][0] - this.samples[i - 1][0];
      const dt = this.samples[i][1] - this.samples[i - 1][1];
      if (dt > 0) intervalSpeeds.push(db / dt);
    }
    if (intervalSpeeds.length < 2) return Infinity;
    const mean = intervalSpeeds.reduce((a, b) => a + b, 0) / intervalSpeeds.length;
    if (mean === 0) return Infinity;
    const variance =
      intervalSpeeds.reduce((a, b) => a + (b - mean) ** 2, 0) / intervalSpeeds.length;
    return Math.sqrt(variance) / mean;
  }

  /** True when the window is full AND CV is below the threshold. Requiring
   *  the full window avoids false early termination: with a partially-filled
   *  window a constant-speed loopback test can reach CV≈0 after only 2-3
   *  samples (~400-600ms) and end the run before any real measurement. */
  isStable(threshold: number): boolean {
    if (this.samples.length < this.windowSize) return false;
    return this.coefficientOfVariation() <= threshold;
  }

  /** Reset all state for a fresh run. */
  reset(): void {
    this.samples = [];
    this.startBytes = 0;
    this.startMs = 0;
    this.counting = false;
  }

  /** Total bytes recorded since warmup ended. */
  totalBytes(): number {
    if (this.samples.length === 0) return 0;
    return this.samples[this.samples.length - 1][0];
  }

  /** Elapsed ms since warmup ended. */
  elapsedMs(): number {
    if (this.samples.length === 0) return 0;
    return this.samples[this.samples.length - 1][1];
  }
}
