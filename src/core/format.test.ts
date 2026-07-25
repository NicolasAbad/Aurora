import { describe, expect, it } from 'vitest';
import { formatAmount, formatPercent, formatRate } from './format';

describe('formatAmount', () => {
  it('shows plain integers below 10,000', () => {
    expect(formatAmount(0)).toBe('0');
    expect(formatAmount(9999)).toBe('9,999');
  });

  it('applies suffixes from 10,000, always at 3 significant figures', () => {
    expect(formatAmount(10_000)).toBe('10.0K');
    expect(formatAmount(125_000)).toBe('125K');
    expect(formatAmount(1_250_000)).toBe('1.25M');
    expect(formatAmount(3_100_000_000)).toBe('3.10B');
  });
});

describe('formatRate', () => {
  it('always shows one decimal', () => {
    expect(formatRate(2)).toBe('2.0');
    expect(formatRate(2.34)).toBe('2.3');
  });
});

describe('formatPercent', () => {
  it('rounds to an integer with a % sign', () => {
    expect(formatPercent(86.6)).toBe('87%');
    expect(formatPercent(100)).toBe('100%');
  });
});
