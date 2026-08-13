/**
 * MySpeed — UI: DOM references and render function.
 *
 * Centralises all DOM element references so the update logic is not
 * scattered across files. Single `renderSnapshot` entry point.
 */

import type { TestSnapshot } from '../engine/types';
import { formatSpeed, formatSpeedUnit, formatLatency, formatLatencyUnit } from './format';
import { setProgress, setWater } from './ring';
import { setWaterLevel } from './wave';

/** DOM element getter helper. */
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export const els = {
  ip: $('ip'),
  ipInfo: document.querySelector('.ip-info') as HTMLElement | null,
  progressRing: $('progressRing') as unknown as SVGCircleElement,
  progressValue: $('progressValue'),
  progressUnit: $('progressUnit'),
  waterTank: $('waterTank'),
  waveFront: $('waveFront') as unknown as SVGPathElement,
  waveBack: $('waveBack') as unknown as SVGPathElement,
  pingValue: $('pingValue'),
  pingUnit: $('pingUnit'),
  jitValue: $('jitValue'),
  jitUnit: $('jitUnit'),
  dlValue: $('dlValue'),
  dlUnit: $('dlUnit'),
  ulValue: $('ulValue'),
  ulUnit: $('ulUnit'),
  startBtn: $('startStopBtn'),
  tierIcon: $('tierIcon') as unknown as HTMLImageElement,
};

/** Update all DOM elements from a test snapshot. Fields that are null are
 *  left unchanged — they are either not yet measured or have been reset by
 *  the worker (e.g. at the start of a new run). This allows the user to
 *  see the previous run's results until new data arrives. */
export function renderSnapshot(snapshot: TestSnapshot): void {
  if (snapshot.clientIp !== null) {
    els.ip.textContent = snapshot.clientIp;
    if (els.ipInfo) els.ipInfo.style.display = 'block';
  }

  if (snapshot.latencyMs !== null) {
    els.pingValue.textContent = formatLatency(snapshot.latencyMs);
    els.pingUnit.textContent = formatLatencyUnit(snapshot.latencyMs);
  }
  if (snapshot.jitterMs !== null) {
    els.jitValue.textContent = formatLatency(snapshot.jitterMs);
    els.jitUnit.textContent = formatLatencyUnit(snapshot.jitterMs);
  }
  if (snapshot.downloadSpeedMbps !== null) {
    els.dlValue.textContent = formatSpeed(snapshot.downloadSpeedMbps);
    els.dlUnit.textContent = formatSpeedUnit(snapshot.downloadSpeedMbps);
  }
  if (snapshot.uploadSpeedMbps !== null) {
    els.ulValue.textContent = formatSpeed(snapshot.uploadSpeedMbps);
    els.ulUnit.textContent = formatSpeedUnit(snapshot.uploadSpeedMbps);
  }

  // Progress ring + water tank (always update — phase-dependent)
  setProgress(snapshot);
  setWater(snapshot);
}

/** Reset UI to initial state. */
export function resetUI(): void {
  els.ip.textContent = '--';
  if (els.ipInfo) els.ipInfo.style.display = 'none';
  els.pingValue.textContent = '0.0';
  els.pingUnit.textContent = 'ms';
  els.jitValue.textContent = '0.0';
  els.jitUnit.textContent = 'ms';
  els.dlValue.textContent = '0.0';
  els.dlUnit.textContent = 'Mbps';
  els.ulValue.textContent = '0.0';
  els.ulUnit.textContent = 'Mbps';
  els.progressValue.textContent = '--';
  els.progressUnit.textContent = 'Mbps';
  els.progressValue.style.display = '';
  els.progressUnit.style.display = '';
  els.tierIcon.style.display = 'none';
  // Reset ring
  const circumference = 2 * Math.PI * 108;
  els.progressRing.style.strokeDashoffset = String(circumference);
  // Drain the water tank
  els.waterTank.classList.remove('active', 'done', 'submerged');
  setWaterLevel(null);
}