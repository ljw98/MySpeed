/**
 * MySpeed — Worker entry point.
 *
 * Receives structured messages from the main thread and drives the test
 * lifecycle: start → (latency → download → upload) → finished.
 * This worker is modular, typed, and event-driven.
 */

import { Phase, type TestSnapshot, type WorkerMessage, type CommandMessage } from './types';
import { buildConfig, type TestConfig } from './config';
import { Sequencer } from './sequencer';
import { DownloadTest } from './tests/download';
import { UploadTest } from './tests/upload';
import { LatencyTest } from './tests/latency';

let config: TestConfig;
let sequencer: Sequencer;
let running = false;
let aborted = false;
let sequenceGen = 0;
/** Reference to the currently active test, so abort can reach it. */
let currentTest: { abort: () => void } | null = null;

/** Cumulative state across phases so each snapshot includes all prior results. */
interface CumulativeState {
  latencyMs: number | null;
  jitterMs: number | null;
  downloadSpeedMbps: number | null;
  uploadSpeedMbps: number | null;
  clientIp: string | null;
}
const state: CumulativeState = {
  latencyMs: null,
  jitterMs: null,
  downloadSpeedMbps: null,
  uploadSpeedMbps: null,
  clientIp: null,
};

/** Send a typed message to the main thread. */
function send(msg: WorkerMessage): void {
  self.postMessage(msg);
}

/** Build a snapshot from partial data, merging in cumulative state. */
function snapshot(
  phase: Phase,
  overrides: Partial<TestSnapshot> = {},
): TestSnapshot {
  return {
    phase,
    downloadSpeedMbps: state.downloadSpeedMbps,
    uploadSpeedMbps: state.uploadSpeedMbps,
    latencyMs: state.latencyMs,
    jitterMs: state.jitterMs,
    clientIp: state.clientIp,
    downloadProgress: 0,
    uploadProgress: 0,
    latencyProgress: 0,
    ...overrides,
  };
}

async function runSequence(): Promise<void> {
  sequencer.reset();
  running = true;
  aborted = false;
  const gen = ++sequenceGen;

  // Reset cumulative state for a fresh run.
  state.latencyMs = null;
  state.jitterMs = null;
  state.downloadSpeedMbps = null;
  state.uploadSpeedMbps = null;
  state.clientIp = null;

  send({ type: 'snapshot', data: snapshot(Phase.Preparing) });

  // Fetch client IP info once at the start (non-blocking but awaited so
  // the top bar shows it during the test).
  try {
    const res = await fetch(config.endpoints.ipinfo);
    if (res.ok) {
      const info = await res.json();
      state.clientIp = info.ip ?? null;
      send({ type: 'snapshot', data: snapshot(Phase.Preparing) });
    }
  } catch {
    // IP info is best-effort; ignore failures.
  }

  while (sequencer.hasNext()) {
    if (!running || aborted) break;
    const phase = sequencer.next()!;
    send({ type: 'snapshot', data: snapshot(phase) });

    switch (phase) {
      case Phase.Latency:
        await runLatency();
        break;
      case Phase.Download:
        await runDownload();
        break;
      case Phase.Upload:
        await runUpload();
        break;
    }
    // If a new sequence has started, bail out silently.
    if (gen !== sequenceGen) return;
  }

  // If a new sequence has started, bail out silently.
  if (gen !== sequenceGen) return;

  // Final cumulative snapshot so the UI shows all results together.
  send({
    type: 'snapshot',
    data: snapshot(aborted ? Phase.Aborted : Phase.Finished),
  });

  running = false;
  // Guard: only send finished if we're still the current sequence.
  if (gen !== sequenceGen) return;
  send({ type: 'finished', aborted });
}

async function runLatency(): Promise<void> {
  let pingCount = 0;
let lastLatencyMs: number | null = null;
let lastJitterMs: number | null = null;
const test = new LatencyTest(config, (_rttMs, progress, runningLatencyMs, runningJitterMs) => {
    pingCount++;
    // Update the displayed numbers every 6 pings (10 updates across 60 pings).
    if (pingCount % 6 === 0 || progress >= 1) {
      lastLatencyMs = runningLatencyMs;
      lastJitterMs = runningJitterMs;
    }
    send({
      type: 'snapshot',
      data: snapshot(Phase.Latency, {
        latencyProgress: progress,
        latencyMs: lastLatencyMs,
        jitterMs: lastJitterMs,
      }),
    });
  });
  currentTest = test;
  const result = await test.run();
  currentTest = null;
  state.latencyMs = result.latencyMs;
  state.jitterMs = result.jitterMs;
  // Don't jump to 100% on abort — the while loop will handle the exit.
  if (!aborted) {
    send({
      type: 'snapshot',
      data: snapshot(Phase.Latency, {
        latencyProgress: 1,
      }),
    });
  }
}

async function runDownload(): Promise<void> {
  const test = new DownloadTest(config, (speedMbps, progress) => {
    send({
      type: 'snapshot',
      data: snapshot(Phase.Download, {
        downloadSpeedMbps: speedMbps,
        downloadProgress: progress,
      }),
    });
  });
  currentTest = test;
  const result = await test.run();
  currentTest = null;
  state.downloadSpeedMbps = result.speedMbps;
  // Don't jump to 100% on abort — the while loop will handle the exit.
  if (!aborted) {
    send({
      type: 'snapshot',
      data: snapshot(Phase.Download, {
        downloadProgress: 1,
      }),
    });
  }
}

async function runUpload(): Promise<void> {
  const test = new UploadTest(config, (speedMbps, progress) => {
    send({
      type: 'snapshot',
      data: snapshot(Phase.Upload, {
        uploadSpeedMbps: speedMbps,
        uploadProgress: progress,
      }),
    });
  });
  currentTest = test;
  const result = await test.run();
  currentTest = null;
  state.uploadSpeedMbps = result.speedMbps;
  // Don't jump to 100% on abort — the while loop will handle the exit.
  if (!aborted) {
    send({
      type: 'snapshot',
      data: snapshot(Phase.Upload, {
        uploadProgress: 1,
      }),
    });
  }
}

// ── Message handler ────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<CommandMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'start':
      config = buildConfig(msg.config);
      sequencer = new Sequencer(config);
      runSequence();
      break;

    case 'abort':
      aborted = true;
      running = false;
      // Abort the currently running test (if any) so its await resolves.
      currentTest?.abort();
      currentTest = null;
      break;

    case 'status':
      // Polling: return current state.
      // Since we're in a worker and don't store the latest snapshot,
      // the main-thread engine caches it instead.
      break;
  }
};