// 반올림은 표시 단계에서만 한다. (CLAUDE.md 5.2)

import { OUTS_PER_INNING } from './count';

export const NO_VALUE_DISPLAY = '-';

const RATE_DECIMALS = 3;
const PERCENT_DECIMALS = 1;

/** 비율 기록 표시. 예: 0.3 → ".300", 1 → "1.000" */
export function formatRate(value: number | null): string {
  if (value === null) return NO_VALUE_DISPLAY;
  const fixed = value.toFixed(RATE_DECIMALS);
  return fixed.startsWith('0.') ? fixed.slice(1) : fixed;
}

/** 백분율 표시. 예: 0.625 → "62.5%" */
export function formatPercent(value: number | null): string {
  if (value === null) return NO_VALUE_DISPLAY;
  return `${(value * 100).toFixed(PERCENT_DECIMALS)}%`;
}

const ERA_DECIMALS = 2;

/** 평균자책점 표시. 예: 3 → "3.00" */
export function formatEra(value: number | null): string {
  return value === null ? NO_VALUE_DISPLAY : value.toFixed(ERA_DECIMALS);
}

const RATIO_DECIMALS = 2;

/** 두 수의 비(볼삼비 등) 표시. 예: 2.5 → "2.50" */
export function formatRatio(value: number | null): string {
  return value === null ? NO_VALUE_DISPLAY : value.toFixed(RATIO_DECIMALS);
}

/** 던진 이닝 표시. 잡은 아웃 수로 받는다. 예: 7 → "2 1/3", 6 → "2", 1 → "1/3" */
export function formatInningsFromOuts(outs: number): string {
  const whole = Math.floor(outs / OUTS_PER_INNING);
  const rest = outs % OUTS_PER_INNING;
  if (rest === 0) return `${whole}`;
  return whole === 0 ? `${rest}/${OUTS_PER_INNING}` : `${whole} ${rest}/${OUTS_PER_INNING}`;
}
