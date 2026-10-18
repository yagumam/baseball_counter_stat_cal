// 투수 기준 통계: 우리 아이가 투수로 등장한 장면의 상대 타자 타석만 센다. (CLAUDE.md 0.5)
// 아이가 다른 자리에서 수비한 장면의 상대 타석(다른 투수가 던짐)은 세지 않는다.
// 모든 값은 Calculation으로 돌려주어 결과와 계산 과정을 함께 보여준다.

import { Calculation, safeDivide, tally, term } from '../common/calculation';
import { Count, OUTS_PER_INNING, countLabel } from '../common/count';
import { BATTER_HANDS, PITCH_TYPES, PitchResult, PitchType } from '../common/events';
import { formatEra, formatInningsFromOuts, formatPercent } from '../common/format';
import {
  END_COUNT_BASIS,
  GameForStats,
  ScopedPlateAppearance,
  averageOf,
  battedBallShares,
  battedBallsOf,
  ChartPoint,
  completed,
  endCountsOf,
  inCount,
  maxSpeed,
  meanSpeed,
  pitchSources,
  platesOf,
  playSources,
  ref,
  repeatedSources,
  shareOf,
  sluggingOf,
  speedsOf,
  sprayPoints,
  withOutcome,
  zonePoints,
} from '../common/stat-base';
import { BATTER_HAND_LABEL, PITCH_TYPE_LABEL } from '../common/labels';

export { END_COUNT_BASIS };
export type { GameForStats };

/** 스트라이크로 세는 공. 파울·번트 파울과 친 공(안타·실책 출루·아웃)도 스트라이크로 센다. 몸에 맞는 공은 볼로 센다. */
const STRIKE_LIKE: ReadonlySet<PitchResult> = new Set(['strike', 'foul', 'buntFoul', 'hit', 'reachedOnError', 'out']);

const AT_BATS_LABEL = '상대 타수 (끝난 타석에서 볼넷·몸에 맞는 공·희생번트·희생플라이 제외)';

function faced(games: readonly GameForStats[]): ScopedPlateAppearance[] {
  return platesOf(games, 'opponent').filter((s) => s.pa.fieldingPosition === 'pitcher');
}

export function pitchCount(games: readonly GameForStats[]): Calculation {
  const pas = faced(games);
  const multiGame = games.length > 1;
  const parts = new Map<string, number>();
  for (const s of pas) {
    const key = multiGame ? s.game : `${s.pa.inning}회`;
    parts.set(key, (parts.get(key) ?? 0) + s.pa.pitches.length);
  }
  const sources = pitchSources(pas, () => true);
  return {
    title: '투구 수',
    formula: multiGame ? '경기별 투구 수를 모두 더한 수' : '이닝별 투구 수를 모두 더한 수 (취소한 공 제외)',
    terms: [term('던진 공', sources)],
    expression: [...parts.entries()].map(([k, n]) => `${k} ${n}`).join(' + ') || '0',
    value: sources.length,
    display: `${sources.length}`,
  };
}

export function strikeRate(games: readonly GameForStats[]): Calculation {
  const pas = faced(games);
  const strikes = term('스트라이크 (헛스윙·지켜본 스트라이크·파울·번트 파울·친 공)', pitchSources(pas, (r) => STRIKE_LIKE.has(r)));
  const total = term('투구 수', pitchSources(pas, () => true));
  const value = safeDivide(strikes.value, total.value);
  return {
    title: '스트라이크 비율',
    formula: '스트라이크 ÷ 투구 수',
    terms: [strikes, total],
    expression: `${strikes.value} ÷ ${total.value}`,
    value,
    display: formatPercent(value),
    note: value === null ? '던진 공이 없어 계산할 수 없음' : undefined,
  };
}

/** 던진 이닝 = 잡은 아웃 ÷ 3 */
export function inningsPitched(games: readonly GameForStats[]): Calculation {
  const outs = repeatedSources(faced(games), (pa) => pa.outsRecorded);
  return {
    title: '던진 이닝',
    formula: `잡은 아웃 ÷ ${OUTS_PER_INNING} (아웃 ${OUTS_PER_INNING}개 = 1이닝)`,
    terms: [term('잡은 아웃 (삼진·아웃·견제 아웃·도루 저지·고쳐서 더한 아웃)', outs)],
    expression: `${outs.length} ÷ ${OUTS_PER_INNING}`,
    value: outs.length / OUTS_PER_INNING,
    display: formatInningsFromOuts(outs.length),
  };
}

export function battersFaced(games: readonly GameForStats[]): Calculation {
  return tally('상대한 타자', '끝난 타석 수 (중단된 타석 제외)', completed(faced(games)).map(ref));
}

export function strikeouts(games: readonly GameForStats[]): Calculation {
  return tally('삼진', '삼진으로 끝난 타석 수 (쓰리번트 아웃 포함)', withOutcome(faced(games), 'strikeout'));
}

export function walks(games: readonly GameForStats[]): Calculation {
  return tally('볼넷', '볼넷으로 끝난 타석 수', withOutcome(faced(games), 'walk'));
}

export function hitByPitches(games: readonly GameForStats[]): Calculation {
  return tally('몸에 맞는 공', '몸에 맞는 공으로 끝난 타석 수', withOutcome(faced(games), 'hitByPitch'));
}

export function hitsAllowed(games: readonly GameForStats[]): Calculation {
  return tally('맞은 안타', '안타로 끝난 타석 수', withOutcome(faced(games), 'hit'));
}

export function extraBaseHitsAllowed(games: readonly GameForStats[]): Calculation {
  const pas = faced(games).filter((s) => s.pa.hitType !== null && s.pa.hitType !== 'single');
  return tally('맞은 장타', '2루타·3루타·홈런으로 끝난 타석 수', pas.map(ref));
}

export function homeRunsAllowed(games: readonly GameForStats[]): Calculation {
  return tally('맞은 홈런', '홈런으로 끝난 타석 수', faced(games).filter((s) => s.pa.hitType === 'homeRun').map(ref));
}

/** 피안타율 = 맞은 안타 ÷ 상대 타수 */
export function battingAverageAgainst(games: readonly GameForStats[]): Calculation {
  return averageOf(faced(games), { title: '피안타율', hits: '맞은 안타', atBats: AT_BATS_LABEL });
}

/** 피장타율 = 루타 ÷ 상대 타수 */
export function sluggingAgainst(games: readonly GameForStats[]): Calculation {
  return sluggingOf(faced(games), { title: '피장타율', atBats: AT_BATS_LABEL });
}

/** 좌타·우타별: 그 쪽에 선 타자의 타석 수와 피안타율. 타자 정보를 고른 타석만 센다. */
export function byBatterHand(games: readonly GameForStats[]): Calculation[] {
  const pas = faced(games);
  return BATTER_HANDS.flatMap((hand) => {
    const name = `${BATTER_HAND_LABEL[hand]}자`;
    const here = pas.filter((s) => s.pa.batterHand === hand);
    return [
      tally(`${name} 타석`, `${name}로 고른 상대 타자의 끝난 타석 수`, completed(here).map(ref)),
      averageOf(here, { title: `${name} 피안타율`, hits: `${name}에게 맞은 안타`, atBats: `${name} 타수 (볼넷·몸에 맞는 공·희생타 제외)` }),
    ];
  });
}

/** 타자 정보(좌타·우타)를 고른 타석이 하나라도 있는지 */
function hasBatterHands(games: readonly GameForStats[]): boolean {
  return faced(games).some((s) => s.pa.batterHand !== null);
}

export function runsAllowed(games: readonly GameForStats[]): Calculation {
  return tally('실점', '던지는 동안 홈에 들어온 점수', repeatedSources(faced(games), (pa) => pa.runs));
}

/** 비자책점: 실책으로 나간 주자의 득점, 실책 출루·실책 진루 때(바로 이어 고친 상황 포함) 들어온 점수 */
export function unearnedRuns(games: readonly GameForStats[]): Calculation {
  return tally('비자책점', '실점 중 수비 실책 때문에 준 점수 (실책으로 나간 주자의 득점, 실책 플레이 때 들어온 점수)', repeatedSources(faced(games), (pa) => pa.unearnedRuns));
}

/** 자책점 = 실점 - 비자책점 (투수 책임인 점수) */
export function earnedRuns(games: readonly GameForStats[]): Calculation {
  return tally('자책점', '실점에서 비자책점을 뺀 점수 (투수 책임인 점수)', repeatedSources(faced(games), (pa) => pa.runs - pa.unearnedRuns));
}

/** 평균자책점(ERA)을 셀 때 한 경기로 보는 이닝 (공식 기록 규칙: 9이닝) */
export const ERA_INNINGS = 9;

/** 평균자책점 = 자책점 × 9 ÷ 던진 이닝 = 자책점 × 27 ÷ 잡은 아웃 (9이닝을 던졌다면 몇 점을 줬을지) */
export function earnedRunAverage(games: readonly GameForStats[]): Calculation {
  const pas = faced(games);
  const earned = term('자책점', repeatedSources(pas, (pa) => pa.runs - pa.unearnedRuns));
  const outs = term('잡은 아웃', repeatedSources(pas, (pa) => pa.outsRecorded));
  const value = safeDivide(earned.value * ERA_INNINGS * OUTS_PER_INNING, outs.value);
  return {
    title: '평균자책점',
    formula: `자책점 × ${ERA_INNINGS} ÷ 던진 이닝 (${ERA_INNINGS}이닝을 던졌다면 줬을 점수, 낮을수록 좋아요)`,
    terms: [earned, outs],
    expression: `${earned.value} × ${ERA_INNINGS} ÷ ${formatInningsFromOuts(outs.value)}이닝`,
    value,
    display: formatEra(value),
    note: value === null ? '잡은 아웃이 없어 계산할 수 없음' : undefined,
  };
}

export function wildPitches(games: readonly GameForStats[]): Calculation {
  return tally('와일드피치', '와일드피치로 기록한 공 수', pitchSources(faced(games), (r) => r === 'wildPitch'));
}

/** 포일: 포수가 공을 놓쳐 주자가 간 공. 투수 기록은 아니지만 던지는 동안 일어난 일로 함께 보여준다. */
export function passedBalls(games: readonly GameForStats[]): Calculation {
  return tally('포일', '포일(포수가 놓침)로 기록한 공 수', pitchSources(faced(games), (r) => r === 'passedBall'));
}

export function pickoffAttempts(games: readonly GameForStats[]): Calculation {
  return tally('견제', '견제한 횟수 (견제 아웃 포함)', playSources(faced(games), ['pickoff', 'pickoffOut']));
}

export function pickoffOuts(games: readonly GameForStats[]): Calculation {
  return tally('견제 아웃', '견제로 주자를 잡은 횟수', playSources(faced(games), ['pickoffOut']));
}

export function stolenBasesAllowed(games: readonly GameForStats[]): Calculation {
  return tally('도루 허용', '도루를 성공한 횟수 (2루·3루·홈)', playSources(faced(games), ['stolenBase', 'stolenSecond']));
}

export function caughtStealing(games: readonly GameForStats[]): Calculation {
  return tally('도루 저지', '도루하던 주자를 잡은 횟수', playSources(faced(games), ['caughtStealing', 'caughtStealingSecond']));
}

export function errorsBehind(games: readonly GameForStats[]): Calculation {
  return tally('수비 실책', '우리 팀 수비 실책 수 (실책 출루 + 실책으로 주자 진루)', repeatedSources(faced(games), (pa) => pa.errors));
}

/** 이닝별 투구 수 */
export function pitchesByInning(games: readonly GameForStats[]): Calculation[] {
  const pas = faced(games);
  const innings = [...new Set(pas.map((s) => s.pa.inning))].sort((a, b) => a - b);
  return innings.map((inning) => {
    const inInning = pas.filter((s) => s.pa.inning === inning && s.pa.pitches.length > 0);
    const sources = pitchSources(inInning, () => true);
    return {
      title: `${inning}회 투구 수`,
      formula: `${inning}회에 던진 공을 타석별로 더한 수`,
      terms: [term('던진 공', sources)],
      expression: inInning.map((s) => s.pa.pitches.length).join(' + ') || '0',
      value: sources.length,
      display: `${sources.length}`,
    };
  });
}

/** 평균 구속·최고 구속 (구속을 잰 공만) */
export function averageSpeed(games: readonly GameForStats[]): Calculation {
  return meanSpeed('평균 구속', speedsOf(faced(games)));
}

export function topSpeed(games: readonly GameForStats[]): Calculation {
  return maxSpeed('최고 구속', speedsOf(faced(games)));
}

export interface PitchTypeRow {
  readonly pitchType: PitchType;
  readonly pitches: Calculation;
  readonly share: Calculation;
  readonly strikeRate: Calculation;
  readonly speed: Calculation;
}

/** 구종별: 투구 수, 비율(구종을 기록한 공 중), 스트라이크 비율, 평균 구속 */
export function byPitchType(games: readonly GameForStats[]): PitchTypeRow[] {
  const pas = faced(games);
  const typed = pas.flatMap((s) => s.pa.pitches.filter((p) => p.pitchType).map(() => ref(s)));
  return PITCH_TYPES.map((pitchType) => {
    const label = PITCH_TYPE_LABEL[pitchType];
    const mine = pas.flatMap((s) => s.pa.pitches.filter((p) => p.pitchType === pitchType).map((p) => ({ s, p })));
    const sources = mine.map(({ s }) => ref(s));
    const strikes = mine.filter(({ p }) => STRIKE_LIKE.has(p.result)).map(({ s }) => ref(s));
    return {
      pitchType,
      pitches: tally(`${label} 투구 수`, `${label}로 기록한 공 수`, sources),
      share: shareOf(`${label} 비율`, { label, sources }, { label: '구종을 기록한 공', sources: typed }),
      strikeRate: shareOf(`${label} 스트라이크 비율`, { label: `${label} 스트라이크`, sources: strikes }, { label: `${label} 투구 수`, sources }),
      speed: meanSpeed(`${label} 평균 구속`, speedsOf(pas, (p) => p.pitchType === pitchType)),
    };
  }).filter((row) => row.pitches.value !== 0);
}

/** 맞은 타구의 종류 비율 */
export function battedBallTypes(games: readonly GameForStats[]): Calculation[] {
  return battedBallShares(battedBallsOf(faced(games)), '맞은 타구');
}

export interface PitcherCharts {
  /** 아이가 던진 공의 존 통과 지점 */
  readonly zone: readonly ChartPoint[];
  /** 상대 타자가 친 공의 낙구 지점 */
  readonly spray: readonly ChartPoint[];
}

export function charts(games: readonly GameForStats[]): PitcherCharts {
  const pas = faced(games);
  return { zone: zonePoints(pas), spray: sprayPoints(battedBallsOf(pas)) };
}

export interface CountRow {
  readonly count: Count;
  readonly plateAppearances: Calculation;
  readonly battingAverageAgainst: Calculation;
}

/** 카운트별 기록 (종료 카운트 기준) */
export function byEndCount(games: readonly GameForStats[]): CountRow[] {
  const pas = faced(games);
  return endCountsOf(pas).map((count) => {
    const here = inCount(pas, count);
    return {
      count,
      plateAppearances: tally(`${countLabel(count)} 타석`, `${countLabel(count)}에서 끝난 타석 수`, here.map(ref)),
      battingAverageAgainst: averageOf(here, { title: `${countLabel(count)} 피안타율`, hits: '맞은 안타', atBats: AT_BATS_LABEL }),
    };
  });
}

export interface StatSection {
  readonly title: string;
  readonly items: readonly Calculation[];
}

export interface PitcherSummary {
  readonly sections: readonly StatSection[];
  readonly byCount: readonly CountRow[];
  /** 한 경기만 볼 때 이닝별 투구 수 */
  readonly byInning: readonly Calculation[];
  readonly byPitchType: readonly PitchTypeRow[];
  readonly charts: PitcherCharts;
}

export function summarize(games: readonly GameForStats[]): PitcherSummary {
  return {
    sections: [
      { title: '던진 공', items: [pitchCount(games), strikeRate(games), inningsPitched(games), averageSpeed(games), topSpeed(games)] },
      {
        title: '타자 상대',
        items: [
          battersFaced(games),
          strikeouts(games),
          walks(games),
          hitByPitches(games),
          hitsAllowed(games),
          extraBaseHitsAllowed(games),
          homeRunsAllowed(games),
          battingAverageAgainst(games),
          sluggingAgainst(games),
          runsAllowed(games),
          earnedRuns(games),
          unearnedRuns(games),
          earnedRunAverage(games),
        ],
      },
      {
        title: '주자 상황',
        items: [
          wildPitches(games),
          passedBalls(games),
          pickoffAttempts(games),
          pickoffOuts(games),
          stolenBasesAllowed(games),
          caughtStealing(games),
          errorsBehind(games),
        ],
      },
      { title: '맞은 타구', items: battedBallTypes(games) },
      ...(hasBatterHands(games) ? [{ title: '좌타 · 우타별', items: byBatterHand(games) }] : []),
    ],
    byCount: byEndCount(games),
    byInning: games.length === 1 ? pitchesByInning(games) : [],
    byPitchType: byPitchType(games),
    charts: charts(games),
  };
}

