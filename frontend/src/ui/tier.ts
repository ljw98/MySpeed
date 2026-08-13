/**
 * MySpeed — UI: network tier detection.
 */

const TIER_BOUNDS: { id: string; min: number; max: number }[] = [
  { id: '100m', min: 0,     max: 100 },
  { id: '1g',   min: 100,   max: 1000 },
  { id: '2g5',  min: 1000,  max: 2500 },
  { id: '10g',  min: 2500,  max: 10000 },
  { id: '25g',  min: 10000, max: Infinity },
];

export function detectTier(mbps: number): string {
  for (const t of TIER_BOUNDS) {
    if (mbps >= t.min && mbps <= t.max) return t.id;
  }
  return '25g';
}