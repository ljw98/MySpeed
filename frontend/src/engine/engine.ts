/**
 * MySpeed — SpeedTestEngine.
 *
 * The public-facing entry point that the UI talks to. It wraps a Web
 * Worker and translates the worker's structured messages into
 * callback-based events for the UI.
 *
 * Uses method-based registration (`onUpdate`/`onEnd`) and a typed config
 * object, and keeps a cached snapshot for polling.
 */

import type { TestSnapshot, CommandMessage, WorkerMessage } from './types';
import type { TestConfig } from './config';

export class SpeedTestEngine {
  private worker: Worker;
  private snapshotCb?: (snapshot: TestSnapshot) => void;
  private endCb?: (aborted: boolean) => void;
  private latest: TestSnapshot | null = null;
  private running = false;

  constructor() {
    this.worker = new Worker(new URL('./worker', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'snapshot':
          this.latest = msg.data;
          this.snapshotCb?.(msg.data);
          break;
        case 'finished':
          this.running = false;
          this.endCb?.(msg.aborted);
          break;
      }
    };
  }

  /** Register a snapshot callback (called on every update). */
  onUpdate(cb: (snapshot: TestSnapshot) => void): this {
    this.snapshotCb = cb;
    return this;
  }

  /** Register an end callback (called when the test finishes/aborts). */
  onEnd(cb: (aborted: boolean) => void): this {
    this.endCb = cb;
    return this;
  }

  /** Start a test run with optional config overrides. */
  start(config?: Partial<TestConfig>): void {
    this.running = true;
    this.post({ type: 'start', config });
  }

  /** Abort the current run. */
  abort(): void {
    this.running = false;
    this.post({ type: 'abort' });
  }

  /** True while a test is running. */
  isRunning(): boolean {
    return this.running;
  }

  /** Latest snapshot, for polling. */
  getSnapshot(): TestSnapshot | null {
    return this.latest;
  }

  /** Terminate the worker and release resources. */
  destroy(): void {
    this.worker.terminate();
  }

  private post(msg: CommandMessage): void {
    this.worker.postMessage(msg);
  }
}