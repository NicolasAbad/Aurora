// ECONOMY_MODEL §12 (v2.2): "Suffixes from 10,000, always 3 significant figures:
// 10.0K, 125K, 1.25M, 3.10B. Rates 1 decimal. Percentages integers."
const SUFFIXES: [number, string][] = [
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

export function formatAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs < 10_000) return Math.floor(value).toLocaleString('en-US');
  const sign = value < 0 ? '-' : '';
  for (const [threshold, suffix] of SUFFIXES) {
    if (abs < threshold) continue;
    const mantissa = abs / threshold;
    // 3 significant figures: fewer decimals as the integer part grows (10.0 / 1.25 / 125).
    const decimals = mantissa < 10 ? 2 : mantissa < 100 ? 1 : 0;
    return `${sign}${mantissa.toFixed(decimals)}${suffix}`;
  }
  return Math.floor(value).toLocaleString('en-US');
}

export function formatRate(value: number): string {
  return value.toFixed(1);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

// UI_SPEC §4: "Every timer shows remaining time in human units (2h 14m, 45s)." Shared
// by ProcessProgress (remaining time) and ResearchPanel (a node's total duration).
export function formatDuration(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
