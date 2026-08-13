import { describe, it, expect, beforeEach } from 'vitest';
import { Sampler } from '../sampler';

describe('Sampler', () => {
  let s: Sampler;

  beforeEach(() => {
    s = new Sampler(5);
  });

  it('reports null before any data', () => {
    expect(s.currentSpeedMbps(1.0)).toBeNull();
    expect(s.coefficientOfVariation()).toBe(Infinity);
    expect(s.isStable(0.05)).toBe(false);
  });

  it('computes speed correctly over a sliding window (decimal Mbps)', () => {
    // 12.5 MB in 1 second = 100 Mbit in 1s with no overhead
    s.beginWarmupDone(0, 0);
    s.record(6_250_000, 500);   // 6.25 MB at 500ms
    s.record(12_500_000, 1000); // 12.5 MB at 1000ms
    // deltaBytes = 12.5MB, deltaMs = 1000ms
    // bits = 12.5e6 * 8 = 100e6 bits; /1s /1e6 = 100 Mbps
    expect(s.currentSpeedMbps(1.0)).toBeCloseTo(100, 5);
  });

  it('applies overhead compensation to the speed', () => {
    s.beginWarmupDone(0, 0);
    s.record(6_250_000, 500);
    s.record(12_500_000, 1000);
    // without overhead: 100 Mbps; with 1.06: 106
    expect(s.currentSpeedMbps(1.06)).toBeCloseTo(106, 5);
  });

  it('uses only the window, dropping older samples', () => {
    s = new Sampler(2);
    s.beginWarmupDone(0, 0);
    s.record(1_000_000, 100);   // 1MB
    s.record(2_000_000, 200);   // 2MB  -> speed between these
    s.record(3_000_000, 300);   // 3MB, window=2 keeps [2MB,3MB]
    // deltaBytes = 1MB, deltaMs = 100ms -> 80 Mbps
    expect(s.currentSpeedMbps(1.0)).toBeCloseTo(80, 5);
  });

  it('returns null when elapsed does not advance', () => {
    s.beginWarmupDone(0, 0);
    s.record(1_000_000, 0);
    s.record(2_000_000, 0);
    expect(s.currentSpeedMbps(1.0)).toBeNull();
  });

  it('is stable for constant throughput and unstable for noisy throughput', () => {
    // Constant: identical per-interval byte counts => CV≈0
    const stable = new Sampler(6);
    stable.beginWarmupDone(0, 0);
    for (let i = 1; i <= 6; i++) stable.record(i * 1_000_000, i * 100);
    expect(stable.isStable(0.05)).toBe(true);

    // Noisy: cumulative bytes with wildly varying per-interval rates => high CV
    const noisy = new Sampler(6);
    noisy.beginWarmupDone(0, 0);
    const cum = [5_000_000, 5_100_000, 10_100_000, 10_200_000, 15_200_000, 15_300_000];
    for (let i = 0; i < cum.length; i++) noisy.record(cum[i], (i + 1) * 100);
    expect(noisy.isStable(0.05)).toBe(false);
  });

  it('tracks totalBytes and elapsedMs since warmup', () => {
    s.beginWarmupDone(0, 0);
    s.record(1_000_000, 100);
    s.record(3_000_000, 300);
    expect(s.totalBytes()).toBe(3_000_000);
    expect(s.elapsedMs()).toBe(300);
  });

  it('ignores records before warmup completes', () => {
    s.record(9_999_999, 999); // before beginWarmupDone
    s.beginWarmupDone(0, 0);
    s.record(1_000_000, 100);
    s.record(2_000_000, 200); // second sample so sampler has a window
    expect(s.totalBytes()).toBe(2_000_000);
    expect(s.currentSpeedMbps(1.0)).toBeCloseTo(80, 5);
  });

  it('reset clears all state', () => {
    s.beginWarmupDone(0, 0);
    s.record(1_000_000, 100);
    s.reset();
    expect(s.currentSpeedMbps(1.0)).toBeNull();
    expect(s.totalBytes()).toBe(0);
  });
});