/**
 * MySpeed — UI: number formatting.
 *
 * - ≥1000 auto-switch unit (Mbps↔Gbps, ms↔s)
 * - tabular-nums for alignment
 * - one decimal place for <1000, two for ≥1000
 */

export function formatSpeed(mbps: number): string {
  if (mbps == null) return '0.0';
  return mbps >= 1000 ? (mbps / 1000).toFixed(2) : mbps.toFixed(1);
}

/** Integer speed for the dial center (rounded). */
export function formatSpeedInt(mbps: number): string {
  if (mbps == null) return '0';
  return String(mbps >= 1000 ? Math.round(mbps / 1000) : Math.round(mbps));
}

export function formatSpeedUnit(mbps: number): string {
  return (mbps ?? 0) >= 1000 ? 'Gbps' : 'Mbps';
}

export function formatLatency(ms: number): string {
  if (ms == null) return '0.0';
  return ms >= 1000 ? (ms / 1000).toFixed(2) : ms.toFixed(1);
}

export function formatLatencyUnit(ms: number): string {
  return (ms ?? 0) >= 1000 ? 's' : 'ms';
}

