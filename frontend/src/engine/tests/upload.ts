/**
 * MySpeed — UploadTest.
 *
 * Measures upload bandwidth via N concurrent HTTP POST streams.
 * Each stream posts a Blob of `uploadBlobMb` MB to the upload endpoint.
 *
 * Algorithm:
 * 1. Generate N Blobs (pre-filled with random-ish data) and POST them
 *    concurrently.
 * 2. Track upload progress via XHR.upload.onprogress (bytes sent).
 * 3. Warmup period → begin sampling.
 * 4. Every ~200ms sample cumulative bytes, compute throughput.
 * 5. Auto-finish on stability (CV < threshold) or timeout.
 */

import { StreamManager, type StreamCallbacks } from '../stream-manager';
import { Sampler } from '../sampler';
import { estimateProgress } from '../progress';
import type { TestConfig } from '../config';

export interface UploadResult {
  /** Mbps, or null if aborted before any real sample was taken. */
  speedMbps: number | null;
  totalBytes: number;
  elapsedMs: number;
  aborted: boolean;
}

export type UploadProgress = (speedMbps: number | null, progress: number) => void;

/** Max per-stream relaunches after an error before giving up. Prevents an
 *  infinite retry loop when the network is down but the timeout hasn't
 *  fired yet. */
const MAX_STREAM_RETRIES = 8;

/** Generate a Blob filled with psuedo-random bytes. Using a deterministic
 *  seed avoids large allocations and is reproducible. */
function generateBlob(mb: number): Blob {
  const size = Math.round(mb * 1_048_576);
  const chunk = new Uint8Array(65536);
  for (let i = 0; i < chunk.length; i++) {
    chunk[i] = (i * 73 + 137) & 0xff; // deterministic, not compressible
  }
  const parts: BlobPart[] = [];
  let remaining = size;
  while (remaining > 0) {
    const take = Math.min(remaining, chunk.length);
    parts.push(chunk.slice(0, take));
    remaining -= take;
  }
  return new Blob(parts, { type: 'application/octet-stream' });
}

export class UploadTest {
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
  private onProgress: UploadProgress;
  private resolveFinish: ((r: UploadResult) => void) | null = null;

  constructor(config: TestConfig, onProgress: UploadProgress) {
    this.config = config;
    this.onProgress = onProgress;
    this.sampler = new Sampler(config.stabilityWindow);
  }

  async run(): Promise<UploadResult> {
    this.running = true;
    this.startTs = performance.now();
    this.totalBytes = 0;
    this.warmupDone = false;
    this.activeStreams = 0;
    this.streamRetries = 0;

    // Pre-generate the blobs so we don't allocate during the test.
    const blobs = Array.from(
      { length: this.config.uploadStreams },
      () => generateBlob(this.config.uploadBlobMb),
    );

    return new Promise<UploadResult>((resolve) => {
      this.resolveFinish = resolve;
      for (let i = 0; i < this.config.uploadStreams; i++) {
        setTimeout(() => this.launchStream(blobs[i]), i * this.config.streamStaggerDelay);
      }

      const poll = () => {
        if (!this.running) return;
        const elapsed = performance.now() - this.startTs;

        if (!this.warmupDone && elapsed > this.config.warmupDuration * 1000) {
          this.warmupDone = true;
          this.sampler.beginWarmupDone(this.totalBytes, elapsed);
        }

        if (this.warmupDone) {
          this.sampler.record(this.totalBytes, elapsed);
          const speed = this.sampler.currentSpeedMbps(this.config.overheadCompensation);
          const progress = this.estimateProgress(elapsed);
          this.onProgress(speed, Math.min(1, progress));
        }

        if (elapsed > this.config.maxUploadDuration * 1000) {
          this.finish(resolve);
          return;
        }

        if (this.warmupDone && this.config.autoFinish && this.sampler.isStable(this.config.stabilityThreshold)) {
          this.finish(resolve);
          return;
        }

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
    return estimateProgress(elapsed, this.config.maxUploadDuration, this.config.warmupDuration);
  }

  private launchStream(blob: Blob) {
    if (!this.running) return;
    this.activeStreams++;
    let lastLoaded = 0;

    const callbacks: StreamCallbacks = {
      onProgress: (loaded: number) => {
        const delta = loaded - lastLoaded;
        lastLoaded = loaded;
        this.totalBytes += delta;
      },
      onComplete: () => {
        this.activeStreams--;
        this.totalBytes += blob.size - lastLoaded;
        if (this.running) {
          this.launchStream(generateBlob(this.config.uploadBlobMb));
        }
      },
      onError: (err: string) => {
        console.warn('[MySpeed] upload stream error:', err);
        this.activeStreams--;
        if (this.config.errorStrategy === 'retry' && this.running && this.streamRetries < MAX_STREAM_RETRIES) {
          this.streamRetries++;
          this.launchStream(generateBlob(this.config.uploadBlobMb));
        }
      },
    };
    this.manager.createUploadStream(this.config.endpoints.upload, blob, callbacks);
  }

  private finish(resolve: (r: UploadResult) => void) {
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