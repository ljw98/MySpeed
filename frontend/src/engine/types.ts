/**
 * MySpeed — shared type definitions.
 *
 * A semantic Phase enum + a structured TestSnapshot.
 */

/** Lifecycle phase of a speed test run. */
export enum Phase {
  Idle = 'idle',
  Preparing = 'preparing',
  Download = 'download',
  Upload = 'upload',
  Latency = 'latency',
  Finished = 'finished',
  Aborted = 'aborted',
}

/** A point-in-time snapshot of the test, pushed to the UI on every update. */
export interface TestSnapshot {
  phase: Phase;
  /** Mbps, or null before the test has measured it. */
  downloadSpeedMbps: number | null;
  uploadSpeedMbps: number | null;
  /** Round-trip in ms. */
  latencyMs: number | null;
  jitterMs: number | null;
  clientIp: string | null;
  /** 0–1 progress within the current phase. */
  downloadProgress: number;
  uploadProgress: number;
  latencyProgress: number;
}

/** Messages sent Worker → main thread. Structured postMessage, not a
 *  string-prefixed JSON blob. */
export type WorkerMessage =
  | { type: 'snapshot'; data: TestSnapshot }
  | { type: 'finished'; aborted: boolean }
  | { type: 'error'; message: string };

/** Messages sent main thread → Worker. */
export type CommandMessage =
  | { type: 'start'; config?: Partial<TestConfig> }
  | { type: 'abort' }
  | { type: 'status' };

/** Test order entries — reuses Phase so there is one source of truth.
 *  Declared here (not in config.ts) to avoid a circular import. */
export type TestPhase = Phase.Latency | Phase.Download | Phase.Upload;

/** Forward declaration for the config interface; the real definition lives
 *  in config.ts. This keeps types.ts import-free. */
import type { TestConfig } from './config';
