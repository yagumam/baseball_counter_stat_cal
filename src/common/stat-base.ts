// 투수·타자 통계가 함께 쓰는 공식과 도우미. 공식은 여기 한 곳에만 둔다. (CLAUDE.md 5.2)
// 어느 타석을 셀지(상대 타자 / 우리 아이)는 각자(pitcher/, batter/)가 정한다.

import { Calculation, SourceRef, safeDivide, term } from './calculation';
import { Count, compareCounts, countKey } from './count';
import { BattedBall, BattedBallType, HIT_BASES, OutType, PitchEvent, PitchResult, PlayKind } from './events';
import { NO_VALUE_DISPLAY, formatPercent, formatRate, formatRatio } from './format';
import { Actor, GameReplay, PlateAppearance, PlateAppearanceOutcome, isInterrupted } from './replay';

/** 분석할 경기 하나 */
export interface GameForStats {
  /** 출처 표시에 쓰는 경기 이름 */
  readonly label: string;
  readonly replay: GameReplay;
}

export interface ScopedPlateAppearance {
  readonly game: string;
  readonly pa: PlateAppearance;
}

/** 타수에서 빠지는 결과. 희생번트·희생플라이도 빠진다. (isSacrifice) */
const NOT_AT_BAT: ReadonlySet<PlateAppearanceOutcome> = new Set(['walk', 'hitByPitch']);

/** 아웃으로 끝난 타석의 아웃 종류 (희생번트·희생플라이·진루타). 없으면 null */
export function outTypeOf(pa: PlateAppearance): OutType | null {
  if (pa.outcome !== 'out') return null;
  return pa.pitches[pa.pitches.length - 1]?.outType ?? null;
}

/** 희생번트·희생플라이 (공식 기록 규칙: 타수에서 뺀다) */
export function isSacrifice(pa: PlateAppearance): boolean {
  const type = outTypeOf(pa);
  return type === 'sacrificeBunt' || type === 'sacrificeFly';
}

/** 출루로 세는 결과 (출루율) */
export const ON_BASE: ReadonlySet<PlateAppearanceOutcome> = new Set(['hit', 'walk', 'hitByPitch']);

export const END_COUNT_BASIS = '종료 카운트 기준: 그 카운트에서 던진 다음 공으로 타석이 끝난 경우만 셉니다.';

export function platesOf(games: readonly GameForStats[], actor: Actor): ScopedPlateAppearance[] {
  return games.flatMap((g) => g.replay.plateAppearances.filter((pa) => pa.actor === actor).map((pa) => ({ game: g.label, pa })));
}

export function ref(s: ScopedPlateAppearance): SourceRef {
  return { game: s.game, inning: s.pa.inning, plateAppearance: s.pa.number };
}

/** 끝난 타석 (중단된 타석 제외) */
export function completed(pas: readonly ScopedPlateAppearance[]): ScopedPlateAppearance[] {
  return pas.filter((s) => s.pa.outcome !== null && !isInterrupted(s.pa.outcome));
}

export function withOutcome(pas: readonly ScopedPlateAppearance[], outcome: PlateAppearanceOutcome): SourceRef[] {
  return pas.filter((s) => s.pa.outcome === outcome).map(ref);
}

export function atBats(pas: readonly ScopedPlateAppearance[]): SourceRef[] {
  return completed(pas)
    .filter((s) => s.pa.outcome !== null && !NOT_AT_BAT.has(s.pa.outcome) && !isSacrifice(s.pa))
    .map(ref);
}

/** 조건에 맞는 공마다 출처 하나 */
export function pitchSources(pas: readonly ScopedPlateAppearance[], match: (r: PitchResult) => boolean): SourceRef[] {
  return pas.flatMap((s) => s.pa.pitches.filter((p) => match(p.result)).map(() => ref(s)));
}

export function playSources(pas: readonly ScopedPlateAppearance[], kinds: readonly PlayKind[]): SourceRef[] {
  return pas.flatMap((s) => s.pa.plays.filter((p) => kinds.includes(p.play)).map(() => ref(s)));
}

/** 이 타석들에서 나온 수만큼 출처를 반복한다. (예: 한 타석 2점이면 출처 2개) */
export function repeatedSources(pas: readonly ScopedPlateAppearance[], amount: (pa: PlateAppearance) => number): SourceRef[] {
  return pas.flatMap((s) => Array.from({ length: amount(s.pa) }, () => ref(s)));
}

export interface RateLabels {
  readonly title: string;
  readonly hits: string;
  readonly atBats: string;
}

/** 타율(피안타율) = 안타 ÷ 타수 */
export function averageOf(pas: readonly ScopedPlateAppearance[], labels: RateLabels): Calculation {
  const hits = term(labels.hits, withOutcome(pas, 'hit'));
  const abs = term(labels.atBats, atBats(pas));
  const value = safeDivide(hits.value, abs.value);
  return {
    title: labels.title,
    formula: `${labels.hits.replace(/ \(.*\)$/, '')} ÷ ${labels.atBats.replace(/ \(.*\)$/, '')}`,
    terms: [hits, abs],
    expression: `${hits.value} ÷ ${abs.value}`,
    value,
    display: formatRate(value),
    note: value === null ? '타수가 0이라 계산할 수 없음' : undefined,
  };
}

export interface OutcomeCount {
  readonly label: string;
  readonly outcome: PlateAppearanceOutcome;
}

/**
 * 볼삼비: 두 결과로 끝난 타석 수의 비.
 * 투수는 삼진 ÷ 볼넷(K/BB), 타자는 볼넷 ÷ 삼진(BB/K)으로, 둘 다 높을수록 좋다.
 */
export function outcomeRatioOf(pas: readonly ScopedPlateAppearance[], title: string, top: OutcomeCount, bottom: OutcomeCount): Calculation {
  const numerator = term(top.label, withOutcome(pas, top.outcome));
  const denominator = term(bottom.label, withOutcome(pas, bottom.outcome));
  const value = safeDivide(numerator.value, denominator.value);
  return {
    title,
    formula: `${top.label} ÷ ${bottom.label} (높을수록 좋아요)`,
    terms: [numerator, denominator],
    expression: `${numerator.value} ÷ ${denominator.value}`,
    value,
    display: formatRatio(value),
    note: value === null ? `${bottom.label}이 0이라 계산할 수 없음` : undefined,
  };
}

/** 장타율(피장타율) = 루타 ÷ 타수. 루타: 1루타 1, 2루타 2, 3루타 3, 홈런 4 */
export function sluggingOf(pas: readonly ScopedPlateAppearance[], labels: Omit<RateLabels, 'hits'>): Calculation {
  const bases = term(
    '루타 (1루타 1, 2루타 2, 3루타 3, 홈런 4)',
    repeatedSources(completed(pas), (pa) => (pa.hitType ? HIT_BASES[pa.hitType] : 0)),
  );
  const abs = term(labels.atBats, atBats(pas));
  const value = safeDivide(bases.value, abs.value);
  return {
    title: labels.title,
    formula: '루타 ÷ 타수 (장타가 많을수록 높아요)',
    terms: [bases, abs],
    expression: `${bases.value} ÷ ${abs.value}`,
    value,
    display: formatRate(value),
    note: value === null ? '타수가 0이라 계산할 수 없음' : undefined,
  };
}

/** 기록에 나온 종료 카운트만 볼·스트라이크 순으로 (타석이 없는 카운트는 표에서 뺀다) */
export function endCountsOf(pas: readonly ScopedPlateAppearance[]): Count[] {
  const seen = new Map<string, Count>();
  for (const s of completed(pas)) {
    if (s.pa.endCount) seen.set(countKey(s.pa.endCount), s.pa.endCount);
  }
  return [...seen.values()].sort(compareCounts);
}

export function inCount(pas: readonly ScopedPlateAppearance[], count: Count): ScopedPlateAppearance[] {
  return completed(pas).filter((s) => s.pa.endCount && countKey(s.pa.endCount) === countKey(count));
}

/** 비율 계산: 부분 ÷ 전체 (백분율로 보여준다) */
export function shareOf(
  title: string,
  part: { label: string; sources: readonly SourceRef[] },
  whole: { label: string; sources: readonly SourceRef[] },
): Calculation {
  const p = term(part.label, part.sources);
  const w = term(whole.label, whole.sources);
  const value = safeDivide(p.value, w.value);
  return {
    title,
    formula: `${part.label.replace(/ \(.*\)$/, '')} ÷ ${whole.label.replace(/ \(.*\)$/, '')}`,
    terms: [p, w],
    expression: `${p.value} ÷ ${w.value}`,
    value,
    display: formatPercent(value),
    note: value === null ? `${whole.label.replace(/ \(.*\)$/, '')}이(가) 0이라 계산할 수 없음` : undefined,
  };
}

/** 친 공 하나 (낙구 지점·질을 기록했거나 건너뛴 것 모두) */
export interface ScopedBattedBall {
  readonly source: SourceRef;
  readonly ball: BattedBall;
  readonly outcome: PlateAppearanceOutcome | null;
}

export function battedBallsOf(pas: readonly ScopedPlateAppearance[]): ScopedBattedBall[] {
  return pas.flatMap((s) =>
    s.pa.pitches.filter((p) => p.battedBall).map((p) => ({ source: ref(s), ball: p.battedBall as BattedBall, outcome: s.pa.outcome })),
  );
}

/** 타구 종류 비율들: 종류를 기록한 타구 중 땅볼·라인드라이브·뜬공(팝플라이 포함) 비율, 세게 맞은 비율 */
export function battedBallShares(balls: readonly ScopedBattedBall[], subject: string): Calculation[] {
  const typed = balls.filter((b) => b.ball.type !== null);
  const strengthKnown = balls.filter((b) => b.ball.strength !== null);
  const whole = { label: `종류를 기록한 ${subject}`, sources: typed.map((b) => b.source) };
  const ofType = (types: readonly BattedBallType[]): SourceRef[] =>
    typed.filter((b) => b.ball.type !== null && types.includes(b.ball.type)).map((b) => b.source);
  return [
    shareOf('땅볼 비율', { label: '땅볼', sources: ofType(['ground']) }, whole),
    shareOf('라인드라이브 비율', { label: '라인드라이브', sources: ofType(['line']) }, whole),
    shareOf('뜬공 비율', { label: '뜬공 (팝플라이 포함)', sources: ofType(['fly', 'popup']) }, whole),
    shareOf(
      '세게 맞은 타구 비율',
      { label: '세게 맞은 타구', sources: strengthKnown.filter((b) => b.ball.strength === 'hard').map((b) => b.source) },
      { label: `세기를 기록한 ${subject}`, sources: strengthKnown.map((b) => b.source) },
    ),
  ];
}

interface SpeedSample {
  readonly speed: number;
  readonly source: SourceRef;
}

export function speedsOf(pas: readonly ScopedPlateAppearance[], match: (p: PitchEvent) => boolean = () => true): SpeedSample[] {
  return pas.flatMap((s) =>
    s.pa.pitches.filter((p) => p.speed !== undefined && match(p)).map((p) => ({ speed: p.speed as number, source: ref(s) })),
  );
}

const SPEED_DECIMALS = 1;

/** 평균 구속 = 구속 합 ÷ 구속을 잰 공 수 */
export function meanSpeed(title: string, samples: readonly SpeedSample[]): Calculation {
  const sum = samples.reduce((n, s) => n + s.speed, 0);
  const value = safeDivide(sum, samples.length);
  return {
    title,
    formula: '구속 합 ÷ 구속을 잰 공 수',
    terms: [
      { label: '구속 합 (km/h)', value: sum, sources: samples.map((s) => s.source) },
      term('구속을 잰 공', samples.map((s) => s.source)),
    ],
    expression: `${sum} ÷ ${samples.length}`,
    value,
    display: value === null ? NO_VALUE_DISPLAY : `${value.toFixed(SPEED_DECIMALS)} km/h`,
    note: value === null ? '구속을 잰 공이 없어 계산할 수 없음' : undefined,
  };
}

export function maxSpeed(title: string, samples: readonly SpeedSample[]): Calculation {
  const top = samples.reduce<SpeedSample | null>((best, s) => (best === null || s.speed > best.speed ? s : best), null);
  return {
    title,
    formula: '구속을 잰 공 중 가장 빠른 공',
    terms: [{ label: '가장 빠른 공 (km/h)', value: top?.speed ?? 0, sources: top ? [top.source] : [] }],
    expression: top ? `${samples.length}개 중 최고 ${top.speed}` : '0개',
    value: top?.speed ?? null,
    display: top ? `${top.speed} km/h` : NO_VALUE_DISPLAY,
    note: top ? undefined : '구속을 잰 공이 없어 계산할 수 없음',
  };
}

/** 그림에 찍을 점 */
export interface ChartPoint {
  readonly x: number;
  readonly y: number;
  readonly kind: string;
}

/** 존 통과 지점: 스트라이크·볼·친 공으로 색을 나눈다 */
export function zonePoints(pas: readonly ScopedPlateAppearance[]): ChartPoint[] {
  const kindOf = (p: PitchEvent): string => {
    if (p.result === 'hit' || p.result === 'out' || p.result === 'reachedOnError') return 'inPlay';
    if (p.result === 'ball' || p.result === 'wildPitch' || p.result === 'passedBall' || p.result === 'hitByPitch') return 'ball';
    return 'strike';
  };
  return pas.flatMap((s) => s.pa.pitches.filter((p) => p.zone).map((p) => ({ x: p.zone!.x, y: p.zone!.y, kind: kindOf(p) })));
}

/** 낙구 지점: 안타·아웃·실책으로 색을 나눈다 */
export function sprayPoints(balls: readonly ScopedBattedBall[]): ChartPoint[] {
  return balls
    .filter((b) => b.ball.x !== null && b.ball.y !== null)
    .map((b) => ({
      x: b.ball.x as number,
      y: b.ball.y as number,
      kind: b.outcome === 'hit' ? 'hit' : b.outcome === 'reachedOnError' ? 'error' : 'out',
    }));
}
