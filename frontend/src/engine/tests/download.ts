/**
 * MySpeed — DownloadTest.
 *
 * Measures download bandwidth via N concurrent HTTP GET streams.
 * Each stream pulls `downloadChunkMb` MB of data, then the stream
 * manager re-launches it (or waits for the test to finish).
 *
 * Algorithm:
 * 1. Open N concurrent XHR streams to the download endpoint.
 * 2. After a warmup period, reset the byte counter and begin measuring.
 * 3. Every ~200ms, sample the cumulative bytes and compute throughput.
 * 4. If autoFinish is enabled, check whether the throughput has stabilised
 *    (CV < threshold for N consecutive windows). If so, end early.
 * 5. On timeout, force-stop and report whatever was measured.
 */

import { StreamManager, type StreamCallbacks } from '../stream-manager';
import { Sampler } from '../sampler';
import { estimateProgress } from '../progress';
import type { TestConfig } from '../config';

export interface DownloadResult {
  /** Mbps, or null if aborted before any real sample was taken. */
  speedMbps: number | null;
  totalBytes: number;
  elapsedMs: number;
  aborted: boolean;
}

export type DownloadProgress = (speedMbps: number | null, progress: number) => void;

/** Max per-stream relaunches after an error before giving up. Prevents an
 *  infinite retry loop when the network is down but the timeout hasn't
 *  fired yet. */
const MAX_STREAM_RETRIES = 8;

export class DownloadTest {
  private manager = new StreamManager();
  private sampler: Sampler;
  private config: TestConfig;
  private running = false;
  private aborted = false;
  private totalBytes = 0;
  private startTs = 0;
  private warmupDone = false;
  private activeStreams = 0;
  private streamRetries = 0;
  private onProgress: DownloadProgress;
  private resolveFinish: ((r: DownloadResult) => void) | null = null;

  constructor(config: TestConfig, onProgress: DownloadProgress) {
    this.config = config;
    this.onProgress = onProgress;
    this.sampler = new Sampler(config.stabilityWindow);
  }

  async run(): Promise<DownloadResult> {
    this.running = true;
    this.startTs = performance.now();
    this.totalBytes = 0;
    this.warmupDone = false;
    this.activeStreams = 0;
    this.streamRetries = 0;

    return new Promise<DownloadResult>((resolve) => {
      this.resolveFinish = resolve;
      // Launch N streams with staggered delay.
      for (let i = 0; i < this.config.downloadStreams; i++) {
        setTimeout(() => this.launchStream(), i * this.config.streamStaggerDelay);
      }

      // Polling loop: samples every 200ms, checks for stability / timeout.
      const poll = () => {
        if (!this.running) return;
        const elapsed = performance.now() - this.startTs;

        // Warmup phase: let TCP windows ramp up.
        if (!this.warmupDone && elapsed > this.config.warmupDuration * 1000) {
          this.warmupDone = true;
          this.sampler.beginWarmupDone(this.totalBytes, elapsed);
        }

        // Sample throughput.
        if (this.warmupDone) {
          this.sampler.record(this.totalBytes, elapsed);
          const speed = this.sampler.currentSpeedMbps(this.config.overheadCompensation);
          const progress = this.estimateProgress(elapsed);
          this.onProgress(speed, Math.min(1, progress));
        }

        // Check timeout.
        if (elapsed > this.config.maxDownloadDuration * 1000) {
          this.finish(resolve);
          return;
        }

        // Check auto-finish (stability).
        if (this.warmupDone && this.config.autoFinish && this.sampler.isStable(this.config.stabilityThreshold)) {
          this.finish(resolve);
          return;
        }

        // All streams finished and no more to do? finish.
        if (this.activeStreams === 0 && this.warmupDone && elapsed > 1000) {
          this.finish(resolve);
          return;
        }

        setTimeout(poll, 200);
      };
      setTimeout(poll, 200);
    });
  }

  private estimateProgress(elapsed: number): number {
    return estimateProgress(elapsed, this.config.maxDownloadDuration, this.config.warmupDuration);
  }

  private launchStream() {
    if (!this.running) return;
    this.activeStreams++;
    let lastLoaded = 0; // per-stream delta tracker

    const url = this.config.endpoints.download + '?chunks=' + this.config.downloadChunkMb;
    const callbacks: StreamCallbacks = {
      onProgress: (loaded: number) => {
        const delta = loaded - lastLoaded;
        lastLoaded = loaded;
        this.totalBytes += delta;
      },
      onComplete: () => {
        this.activeStreams--;
        this.totalBytes += this.config.downloadChunkMb * 1_048_576 - lastLoaded;
        if (this.running) {
          // Relaunch immediately to keep the pipeline saturated.
          this.launchStream();
        }
      },
      onError: (err: string) => {
        console.warn('[MySpeed] download stream error:', err);
        this.activeStreams--;
        if (this.config.errorStrategy === 'retry' && this.running && this.streamRetries < MAX_STREAM_RETRIES) {
          this.streamRetries++;
          this.launchStream();
        }
      },
    };
    this.manager.createDownloadStream(url, callbacks);
  }

  private finish(resolve: (r: DownloadResult) => void) {
    if (!this.running) return;
    this.running = false;
    this.manager.abortAll();
    const elapsed = performance.now() - this.startTs;
    const speed = this.sampler.currentSpeedMbps(this.config.overheadCompensation);
    resolve({
      speedMbps: speed,
      totalBytes: this.totalBytes,
      elapsedMs: elapsed,
      aborted: this.aborted,
    });
  }

  abort(): void {
    this.aborted = true;
    this.running = false;
    this.manager.abortAll();
    // Resolve the pending promise so the worker can continue/terminate.
    if (this.resolveFinish) {
      const resolve = this.resolveFinish;
      this.resolveFinish = null;
      const elapsed = performance.now() - this.startTs;
      const speed = this.sampler.currentSpeedMbps(this.config.overheadCompensation);
      resolve({
        speedMbps: speed,
        totalBytes: this.totalBytes,
        elapsedMs: elapsed,
        aborted: true,
      });
    }
  }
}