// 타자 기준 통계: 우리 아이가 타자로 들어선 타석과 주자로서의 기록만 센다. (CLAUDE.md 0.5)
// 모든 값은 Calculation으로 돌려주어 결과와 계산 과정을 함께 보여준다.

import { Calculation, SourceRef, safeDivide, tally, term } from '../common/calculation';
import { Count, countLabel } from '../common/count';
import { formatRate } from '../common/format';
import { RunnerEventKind } from '../common/replay';
import {
  END_COUNT_BASIS,
  GameForStats,
  ON_BASE,
  ScopedPlateAppearance,
  atBats,
  averageOf,
  battedBallShares,
  battedBallsOf,
  ChartPoint,
  completed,
  endCountsOf,
  inCount,
  outTypeOf,
  repeatedSources,
  pitchSources,
  platesOf,
  ref,
  sluggingOf,
  sprayPoints,
  withOutcome,
  outcomeRatioOf,
  zonePoints,
} from '../common/stat-base';

export { END_COUNT_BASIS };

const AT_BATS_LABEL = '타수 (끝난 타석에서 볼넷·몸에 맞는 공·희생번트·희생플라이 제외)';

function batted(games: readonly GameForStats[]): ScopedPlateAppearance[] {
  return platesOf(games, 'child');
}

export function plateAppearances(games: readonly GameForStats[]): Calculation {
  return tally('타석', '끝난 타석 수 (중단된 타석 제외)', completed(batted(games)).map(ref));
}

export function atBatCount(games: readonly GameForStats[]): Calculation {
  return tally('타수', '끝난 타석에서 볼넷·몸에 맞는 공·희생번트·희생플라이를 뺀 수', atBats(batted(games)));
}

export function hits(games: readonly GameForStats[]): Calculation {
  return tally('안타', '안타로 끝난 타석 수', withOutcome(batted(games), 'hit'));
}

export function extraBaseHits(games: readonly GameForStats[]): Calculation {
  const pas = batted(games).filter((s) => s.pa.hitType !== null && s.pa.hitType !== 'single');
  return tally('장타', '2루타·3루타·홈런으로 끝난 타석 수', pas.map(ref));
}

export function homeRuns(games: readonly GameForStats[]): Calculation {
  return tally('홈런', '홈런으로 끝난 타석 수', batted(games).filter((s) => s.pa.hitType === 'homeRun').map(ref));
}

export function walks(games: readonly GameForStats[]): Calculation {
  return tally('볼넷', '볼넷으로 끝난 타석 수', withOutcome(batted(games), 'walk'));
}

export function hitByPitches(games: readonly GameForStats[]): Calculation {
  return tally('몸에 맞는 공', '몸에 맞는 공으로 끝난 타석 수', withOutcome(batted(games), 'hitByPitch'));
}

export function strikeouts(games: readonly GameForStats[]): Calculation {
  return tally('삼진', '삼진으로 끝난 타석 수 (쓰리번트 아웃 포함)', withOutcome(batted(games), 'strikeout'));
}

/** 볼삼비(타자) = 볼넷 ÷ 삼진 (BB/K). 공을 잘 고르는지 */
export function walkStrikeoutRatio(games: readonly GameForStats[]): Calculation {
  return outcomeRatioOf(batted(games), '볼삼비 (볼넷 ÷ 삼진)', { label: '볼넷', outcome: 'walk' }, { label: '삼진', outcome: 'strikeout' });
}

/** 병살타: 아이가 친 공으로 아이와 주자 한 명이 함께 아웃된 타석 (타수에는 들어간다) */
export function groundedIntoDoublePlays(games: readonly GameForStats[]): Calculation {
  const pas = completed(batted(games)).filter((s) => s.pa.outcome === 'out' && s.pa.pitches[s.pa.pitches.length - 1]?.doublePlay !== undefined);
  return tally('병살타', '병살로 끝난 타석 수 (아이 + 주자 한 명 아웃)', pas.map(ref));
}

function withOutType(games: readonly GameForStats[], type: 'sacrificeBunt' | 'sacrificeFly' | 'productive'): SourceRef[] {
  return completed(batted(games)).filter((s) => outTypeOf(s.pa) === type).map(ref);
}

export function sacrificeBunts(games: readonly GameForStats[]): Calculation {
  return tally('희생번트', '번트로 주자를 보내고 아웃된 타석 수 (타수에서 빠짐)', withOutType(games, 'sacrificeBunt'));
}

export function sacrificeFlies(games: readonly GameForStats[]): Calculation {
  return tally('희생플라이', '뜬공이 잡혔지만 3루 주자가 홈인한 타석 수 (타수에서 빠짐)', withOutType(games, 'sacrificeFly'));
}

/** 진루타: 공식 기록은 아니다. 아웃됐지만 주자를 보낸 타석 (희생타 제외, 타수에는 들어간다) */
export function productiveOuts(games: readonly GameForStats[]): Calculation {
  return tally('진루타', '아웃됐지만 주자를 다음 베이스로 보낸 타석 수 (공식 기록 아님, 희생타 제외)', withOutType(games, 'productive'));
}

/**
 * 타점: 아이의 타석으로 홈에 들어온 점수.
 * 안타·볼넷·몸에 맞는 공·아웃(희생타 포함)으로 들어온 점수와, 그 타석이 끝난 직후 "상황 고치기"로 넣은 점수를 센다.
 * 공식 기록 규칙처럼 실책 출루·병살·삼진 때 들어온 점수와, 타석 도중 폭투·도루로 들어온 점수는 세지 않는다.
 */
export function runsBattedIn(games: readonly GameForStats[]): Calculation {
  const credited = completed(batted(games)).filter((s) => {
    const { outcome } = s.pa;
    if (outcome === 'hit' || outcome === 'walk' || outcome === 'hitByPitch') return true;
    return outcome === 'out' && s.pa.pitches[s.pa.pitches.length - 1]?.doublePlay === undefined;
  });
  return tally(
    '타점',
    '아이 타석의 결과로 들어온 점수 (실책 출루·병살·삼진·폭투·도루로 들어온 점수 제외)',
    repeatedSources(credited, (pa) => pa.runsOnResult + pa.runsAfterEnd),
  );
}

/** 타율 = 안타 ÷ 타수 */
export function battingAverage(games: readonly GameForStats[]): Calculation {
  return averageOf(batted(games), { title: '타율', hits: '안타', atBats: AT_BATS_LABEL });
}

/** 출루율 = (안타 + 볼넷 + 몸에 맞는 공) ÷ (타수 + 볼넷 + 몸에 맞는 공 + 희생플라이). 희생번트는 분모에서도 빠진다. */
export function onBasePercentage(games: readonly GameForStats[]): Calculation {
  const pas = batted(games);
  const reached = term('출루 (안타 + 볼넷 + 몸에 맞는 공)', completed(pas).filter((s) => s.pa.outcome !== null && ON_BASE.has(s.pa.outcome)).map(ref));
  // 타수 + 볼넷 + 몸에 맞는 공 + 희생플라이 = 끝난 타석에서 희생번트만 뺀 수
  const chances = term(
    '타수 + 볼넷 + 몸에 맞는 공 + 희생플라이 (= 끝난 타석 - 희생번트)',
    completed(pas).filter((s) => outTypeOf(s.pa) !== 'sacrificeBunt').map(ref),
  );
  const value = safeDivide(reached.value, chances.value);
  return {
    title: '출루율',
    formula: '출루 ÷ (타수 + 볼넷 + 몸에 맞는 공 + 희생플라이)',
    terms: [reached, chances],
    expression: `${reached.value} ÷ ${chances.value}`,
    value,
    display: formatRate(value),
    note: value === null ? '타석이 없어 계산할 수 없음' : undefined,
  };
}

/** 장타율 = 루타 ÷ 타수 */
export function slugging(games: readonly GameForStats[]): Calculation {
  return sluggingOf(batted(games), { title: '장타율', atBats: AT_BATS_LABEL });
}

/** OPS = 출루율 + 장타율 */
export function ops(games: readonly GameForStats[]): Calculation {
  const obp = onBasePercentage(games);
  const slg = slugging(games);
  const value = obp.value === null || slg.value === null ? null : obp.value + slg.value;
  return {
    title: 'OPS',
    formula: '출루율 + 장타율 (둘을 더한 종합 공격 점수)',
    terms: [
      { label: `출루율 ${obp.display}`, value: obp.value ?? 0, sources: obp.terms[0].sources },
      { label: `장타율 ${slg.display}`, value: slg.value ?? 0, sources: slg.terms[0].sources },
    ],
    expression: `${obp.display} + ${slg.display}`,
    value,
    display: formatRate(value),
    note: value === null ? '타수가 0이라 계산할 수 없음' : undefined,
  };
}

export function pitchesSeen(games: readonly GameForStats[]): Calculation {
  const pas = batted(games);
  const seen = term('본 공', pitchSources(pas, () => true));
  const count = term('타석', completed(pas).map(ref));
  const value = safeDivide(seen.value, count.value);
  return {
    title: '타석당 본 공',
    formula: '본 공 ÷ 타석 (많을수록 끈질기게 승부)',
    terms: [seen, count],
    expression: `${seen.value} ÷ ${count.value}`,
    value,
    display: value === null ? '-' : value.toFixed(1),
    note: value === null ? '타석이 없어 계산할 수 없음' : undefined,
  };
}

function runnerSources(games: readonly GameForStats[], kinds: readonly RunnerEventKind[]): SourceRef[] {
  return games.flatMap((g) =>
    g.replay.runnerEvents
      .filter((e) => kinds.includes(e.kind))
      .map((e) => ({ game: g.label, inning: e.inning, plateAppearance: e.plateAppearance })),
  );
}

export function stolenBases(games: readonly GameForStats[]): Calculation {
  return tally('도루 성공', '아이가 도루에 성공한 횟수', runnerSources(games, ['stolenBase']));
}

export function caughtStealing(games: readonly GameForStats[]): Calculation {
  return tally('도루 실패', '아이가 도루하다 잡힌 횟수', runnerSources(games, ['caughtStealing']));
}

export function pickoffsReceived(games: readonly GameForStats[]): Calculation {
  return tally('견제 받음', '아이에게 들어온 견제 수 (견제사 포함)', runnerSources(games, ['pickoff', 'pickedOff']));
}

export function pickedOff(games: readonly GameForStats[]): Calculation {
  return tally('견제사', '견제로 아웃된 횟수', runnerSources(games, ['pickedOff']));
}

export function runsScored(games: readonly GameForStats[]): Calculation {
  return tally('득점', '아이가 홈에 들어온 횟수 (홈런 포함)', runnerSources(games, ['scored']));
}

export function leftOnBase(games: readonly GameForStats[]): Calculation {
  return tally('잔루', '이닝이 끝날 때 베이스에 남은 횟수', runnerSources(games, ['stranded']));
}

/** 아이가 친 타구의 종류 비율 */
export function battedBallTypes(games: readonly GameForStats[]): Calculation[] {
  return battedBallShares(battedBallsOf(batted(games)), '친 타구');
}

export interface BatterCharts {
  /** 아이가 본 공의 존 통과 지점 */
  readonly zone: readonly ChartPoint[];
  /** 아이가 친 공의 낙구 지점 */
  readonly spray: readonly ChartPoint[];
}

export function charts(games: readonly GameForStats[]): BatterCharts {
  const pas = batted(games);
  return { zone: zonePoints(pas), spray: sprayPoints(battedBallsOf(pas)) };
}

export interface CountRow {
  readonly count: Count;
  readonly plateAppearances: Calculation;
  readonly battingAverage: Calculation;
}

/** 카운트별 타율 (종료 카운트 기준) */
export function byEndCount(games: readonly GameForStats[]): CountRow[] {
  const pas = batted(games);
  return endCountsOf(pas).map((count) => {
    const here = inCount(pas, count);
    return {
      count,
      plateAppearances: tally(`${countLabel(count)} 타석`, `${countLabel(count)}에서 끝난 타석 수`, here.map(ref)),
      battingAverage: averageOf(here, { title: `${countLabel(count)} 타율`, hits: '안타', atBats: AT_BATS_LABEL }),
    };
  });
}

export interface StatSection {
  readonly title: string;
  readonly items: readonly Calculation[];
}

export interface BatterSummary {
  readonly sections: readonly StatSection[];
  readonly byCount: readonly CountRow[];
  readonly charts: BatterCharts;
}

export function summarize(games: readonly GameForStats[]): BatterSummary {
  return {
    sections: [
      { title: '타율', items: [battingAverage(games), onBasePercentage(games), slugging(games), ops(games)] },
      {
        title: '타석 결과',
        items: [
          plateAppearances(games),
          atBatCount(games),
          hits(games),
          extraBaseHits(games),
          homeRuns(games),
          walks(games),
          hitByPitches(games),
          strikeouts(games),
          walkStrikeoutRatio(games),
          groundedIntoDoublePlays(games),
          runsBattedIn(games),
          sacrificeBunts(games),
          sacrificeFlies(games),
          productiveOuts(games),
          pitchesSeen(games),
        ],
      },
      {
        title: '주루',
        items: [
          stolenBases(games),
          caughtStealing(games),
          pickoffsReceived(games),
          pickedOff(games),
          runsScored(games),
          leftOnBase(games),
        ],
      },
      { title: '친 타구', items: battedBallTypes(games) },
    ],
    byCount: byEndCount(games),
    charts: charts(games),
  };
}
