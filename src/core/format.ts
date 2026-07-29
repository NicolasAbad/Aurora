import { RESOURCE_ICON } from '../data/resourceNames';
import type { ResourceId } from './types';

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

// ECONOMY §12 (v3.7, Sprint 9.5): "any rate/delta whose magnitude is below 0.1 renders
// with 2 decimals instead of 1" — real bug fix, R&D Lab's 0.03 Research/s per level
// rounded to "+0.0/s" and read as broken. `value !== 0` keeps a genuine zero at the usual
// one decimal ("0.0") — the bug is about a REAL nonzero delta disappearing, not about 0
// itself gaining spurious precision.
export function formatRate(value: number): string {
  const decimals = value !== 0 && Math.abs(value) < 0.1 ? 2 : 1;
  return value.toFixed(decimals);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

// UI_SPEC §4 (v3.0): "Costs and price tags render as icon + number, with NO resource
// noun... Funds use the currency symbol $ as a prefix and no noun at all." Single
// source of truth for this, so every consumer (BuildingTile, StaffHiring,
// PromotionPanel, ResearchPanel, manual-action buttons) renders a price the same way.
export function formatCostEntry(id: ResourceId, amount: number): string {
  if (id === 'funding') return `$${formatAmount(amount)}`;
  return `${RESOURCE_ICON[id]} ${formatAmount(amount)}`;
}

export function formatCost(cost: Partial<Record<ResourceId, number>>): string {
  return (Object.entries(cost) as [ResourceId, number][])
    .map(([id, amount]) => formatCostEntry(id, amount))
    .join(' + ');
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
