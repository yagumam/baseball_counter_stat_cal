import { describe, expect, it } from 'vitest';
import { formatInningsFromOuts, formatPercent, formatRate, formatRatio } from './format';

describe('표시 형식', () => {
  it('비율은 소수점 셋째 자리로 보여준다', () => {
    expect(formatRate(3 / 10)).toBe('.300');
    expect(formatRate(1 / 3)).toBe('.333');
    expect(formatRate(1)).toBe('1.000');
    expect(formatRate(0)).toBe('.000');
  });

  it('계산할 수 없으면 - 로 보여준다', () => {
    expect(formatRate(null)).toBe('-');
    expect(formatPercent(null)).toBe('-');
  });

  it('백분율은 소수점 첫째 자리까지', () => {
    expect(formatPercent(5 / 8)).toBe('62.5%');
  });

  it('던진 이닝은 아웃 3개 = 1이닝', () => {
    expect(formatInningsFromOuts(0)).toBe('0');
    expect(formatInningsFromOuts(1)).toBe('1/3');
    expect(formatInningsFromOuts(6)).toBe('2');
    expect(formatInningsFromOuts(7)).toBe('2 1/3');
  });
});

describe('비 표시', () => {
  it('소수점 둘째 자리, 값 없으면 -', () => {
    expect(formatRatio(2.5)).toBe('2.50');
    expect(formatRatio(1 / 3)).toBe('0.33');
    expect(formatRatio(null)).toBe('-');
  });
});
