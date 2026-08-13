/**
 * MySpeed — LatencyTest.
 *
 * Measures round-trip time (RTT) and jitter via a series of small HTTP GET
 * requests to the ping endpoint. The endpoint returns a tiny payload (2B `{}`),
 * so network transfer time is negligible — the measurement is dominated by
 * propagation delay.
 *
 * Algorithm:
 * 1. Fire N sequential XHR requests to the ping endpoint, measuring each
 *    round-trip with `performance.now()`.
 * 2. After each request, report the running median and jitter.
 * 3. Jitter = mean absolute deviation from the median (MAD), which is less
 *    sensitive to outliers than standard deviation.
 */

import type { TestConfig } from '../config';

export interface LatencyResult {
  /** Median RTT in ms. */
  latencyMs: number;
  /** Mean absolute deviation from the median (MAD) in ms. */
  jitterMs: number;
  /** All individual RTT measurements (ms). */
  measurements: number[];
  aborted: boolean;
}

export type LatencyProgress = (rttMs: number, progress: number, runningLatencyMs: number, runningJitterMs: number) => void;

export class LatencyTest {
  private config: TestConfig;
  private running = false;
  private aborted = false;
  private onProgress: LatencyProgress;

  constructor(config: TestConfig, onProgress: LatencyProgress) {
    this.config = config;
    this.onProgress = onProgress;
  }

  async run(): Promise<LatencyResult> {
    this.running = true;
    this.aborted = false;
    const measurements: number[] = [];
    const count = this.config.pingCount;
    const url = this.config.endpoints.ping;

    for (let i = 0; i < count; i++) {
      if (!this.running) break;

      const rtt = await this.measureOnce(url);
      measurements.push(rtt);

      this.onProgress(rtt, (i + 1) / count, median(measurements), mad(measurements));
    }

    this.running = false;
    return {
      latencyMs: median(measurements),
      jitterMs: mad(measurements),
      measurements,
      aborted: this.aborted,
    };
  }

  abort(): void {
    this.aborted = true;
    this.running = false;
  }

  private measureOnce(url: string): Promise<number> {
    return new Promise<number>((resolve) => {
      const start = performance.now();
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), true);
      xhr.onload = () => resolve(performance.now() - start);
      xhr.onerror = () => resolve(performance.now() - start); // still measure on error
      xhr.ontimeout = () => resolve(performance.now() - start);
      xhr.send();
    });
  }
}

/** Median of an array of numbers. Returns 0 for empty arrays. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Mean absolute deviation from the median. Returns 0 for empty arrays. */
function mad(values: number[]): number {
  if (values.length < 2) return 0;
  const m = median(values);
  return values.reduce((sum, v) => sum + Math.abs(v - m), 0) / values.length;
}