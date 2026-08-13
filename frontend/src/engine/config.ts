/**
 * MySpeed — typed test configuration with defaults + builder.
 *
 * A single typed interface plus a builder that applies overrides.
 */

import type { TestPhase } from './types';
import { Phase } from './types';

export interface TestConfig {
  /** API endpoints, overridable for reverse-proxy setups. */
  endpoints: {
    download: string;
    upload: string;
    ping: string;
    ipinfo: string;
  };
  /** Timing (seconds). */
  maxDownloadDuration: number;
  maxUploadDuration: number;
  /** Warmup period during which bytes are not counted (network ramp-up). */
  warmupDuration: number;
  /** Number of small RTT probes for the latency test. */
  pingCount: number;
  /** Concurrency. */
  downloadStreams: number;
  uploadStreams: number;
  /** ms to stagger between launching streams (avoids thundering-herd). */
  streamStaggerDelay: number;
  /** Per-request payload sizes (MB). */
  downloadChunkMb: number;
  uploadBlobMb: number;
  /** Behaviour. */
  autoFinish: boolean;
  stabilityWindow: number;
  stabilityThreshold: number;
  errorStrategy: 'fail' | 'retry' | 'ignore';
  /** Multiplier applied to measured throughput to compensate for
   *  transport (TCP/IP) overhead. 1.0 = no compensation. */
  overheadCompensation: number;
  /** Run order. */
  testOrder: TestPhase[];
}

/** Sensible defaults, derived from bandwidth-measurement practice. */
export function defaultConfig(): TestConfig {
  return {
    endpoints: {
      download: '/api/download',
      upload: '/api/upload',
      ping: '/api/ping',
      ipinfo: '/api/ipinfo',
    },
    maxDownloadDuration: 16,
    maxUploadDuration: 16,
    warmupDuration: 1,
    pingCount: 60,
    downloadStreams: 6,
    uploadStreams: 3,
    streamStaggerDelay: 250,
    downloadChunkMb: 200,
    uploadBlobMb: 40,
    autoFinish: false,
    stabilityWindow: 20,
    stabilityThreshold: 0.02,
    errorStrategy: 'retry',
    overheadCompensation: 1.06,
    testOrder: [Phase.Latency, Phase.Download, Phase.Upload],
  };
}

/**
 * Merge user overrides into defaults. Deep-merges nested `endpoints`.
 */
export function buildConfig(overrides?: Partial<TestConfig>): TestConfig {
  const base = defaultConfig();
  if (!overrides) return base;
  return {
    ...base,
    ...overrides,
    endpoints: { ...base.endpoints, ...(overrides.endpoints ?? {}) },
    testOrder: overrides.testOrder ?? base.testOrder,
  };
}
