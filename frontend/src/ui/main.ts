/**
 * MySpeed — UI entry point.
 *
 * Creates the SpeedTestEngine, wires up callbacks, and handles the
 * start/stop button lifecycle.
 */

import '../styles/main.css';
import { SpeedTestEngine } from '../engine/engine';
import { els, renderSnapshot, resetUI } from './dom';
import { initRing } from './ring';
import { ensureWaveLoop } from './wave';

const engine = new SpeedTestEngine();

// ── Engine callbacks ─────────────────────────────────────

engine.onUpdate((snapshot) => {
  renderSnapshot(snapshot);
});

engine.onEnd((_aborted) => {
  els.startBtn.className = 'start-btn';
  els.startBtn.textContent = '开始测试';
  // Normal finish — show final result. Manual stop keeps the last state.
  if (engine.getSnapshot()) {
    renderSnapshot(engine.getSnapshot()!);
  }
});

// ── Start/Stop button ────────────────────────────────────

els.startBtn.addEventListener('click', () => {
  if (engine.isRunning()) {
    // Abort — don't resetUI() here, it would flash the screen blank.
    // The worker's finished callback will render the final snapshot instead.
    engine.abort();
    els.startBtn.className = 'start-btn';
    els.startBtn.textContent = '开始测试';
  } else {
    // Start — clear previous results, then begin a fresh test.
    resetUI();
    els.startBtn.className = 'start-btn running';
    els.startBtn.textContent = '停止测试';
    engine.start();
    // Rolling water surface (self-stops once hidden and drained).
    ensureWaveLoop();
  }
});

initRing();
resetUI();
// Draw one frame so the paths exist even before the first run.
ensureWaveLoop();