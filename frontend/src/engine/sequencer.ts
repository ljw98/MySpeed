/**
 * MySpeed — Sequencer.
 *
 * Orchestrates the order of test phases. The plan is config-driven
 * (`config.testOrder`), defaulting to Latency → Download → Upload.
 * The order is data, not code, and each phase is driven by a small
 * state machine implemented with an iterator.
 */

import type { TestPhase } from './types';
import type { TestConfig } from './config';

export type PhaseRunner = () => Promise<void>;

/**
 * A closure that runs one phase. The Sequencer yields phases in order;
 * the caller supplies the runner that actually executes the phase.
 */
export class Sequencer {
  private readonly order: TestPhase[];
  private index = 0;

  constructor(config: TestConfig) {
    this.order = [...config.testOrder];
  }

  /** True while there are still phases to run. */
  hasNext(): boolean {
    return this.index < this.order.length;
  }

  /** The next phase to run, or null when exhausted. */
  next(): TestPhase | null {
    if (!this.hasNext()) return null;
    return this.order[this.index++];
  }

  /** Reset back to the start of the sequence. */
  reset(): void {
    this.index = 0;
  }
}