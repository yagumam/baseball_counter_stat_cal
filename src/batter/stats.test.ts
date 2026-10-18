import { describe, expect, it } from 'vitest';
import { formatSources } from '../common/calculation';
import { PlayLogEvent } from '../common/events';
import { replayGame } from '../common/replay';
import { GameForStats } from '../common/stat-base';
import { adjust, appear, hit, pitchWith, pitches, play, settings } from '../common/test-helpers';
import {
  battedBallTypes,
  charts,
  battingAverage,
  groundedIntoDoublePlays,
  byEndCount,
  caughtStealing,
  leftOnBase,
  onBasePercentage,
  ops,
  pickedOff,
  pickoffsReceived,
  pitchesSeen,
  plateAppearances,
  productiveOuts,
  runsBattedIn,
  sacrificeBunts,
  sacrificeFlies,
  runsScored,
  slugging,
  stolenBases,
  strikeouts,
  walkStrikeoutRatio,
} from './stats';

const asGame = (events: PlayLogEvent[]): GameForStats => ({ label: '10월 4일 ○○전', replay: replayGame(events, settings()) });

// 아이 타석 5번 (후공이라 말 공격)
//  1회: 2루타 → 3루 도루 성공 → 뒤 타자 1루타에 득점(1루타: 3루→홈)
//  2회: 볼넷 → 견제 받음 → 2루 도루 실패
//  3회: 삼진 (볼 1 · 스트라이크 2에서)
//  4회: 몸에 맞는 공 → 3아웃 잔루
//  5회: 홈런
const game = asGame([
  appear('batter', { inning: 1 }),
  ...pitches('ball'),
  hit('double'),
  play('stolenBase', 1),
  hit('single'),
  appear('batter', { inning: 2 }),
  ...pitches('ball', 'ball', 'ball', 'ball'),
  play('pickoff', 0),
  play('caughtStealing', 0),
  appear('batter', { inning: 3 }),
  ...pitches('ball', 'strike', 'strike', 'strike'),
  appear('batter', { inning: 4, outs: 2 }),
  ...pitches('hitByPitch'),
  ...pitches('out'),
  appear('batter', { inning: 5 }),
  hit('homeRun'),
]);

describe('타자 통계', () => {
  it('타석 5, 타율 = 안타 2 ÷ 타수 3 = .667', () => {
    expect(plateAppearances([game]).value).toBe(5);
    const avg = battingAverage([game]);
    expect(avg.expression).toBe('2 ÷ 3');
    expect(avg.display).toBe('.667');
  });

  it('출루율 = (안타 2 + 볼넷 1 + 몸에 맞는 공 1) ÷ 5 = .800', () => {
    expect(onBasePercentage([game]).expression).toBe('4 ÷ 5');
    expect(onBasePercentage([game]).display).toBe('.800');
  });

  it('장타율 = 루타 6 (2루타 2 + 홈런 4) ÷ 3 = 2.000, OPS = .800 + 2.000', () => {
    expect(slugging([game]).expression).toBe('6 ÷ 3');
    expect(ops([game]).display).toBe('2.800');
    expect(ops([game]).expression).toBe('.800 + 2.000');
  });

  it('동료 타자의 타석은 타자 통계에 들어가지 않는다', () => {
    expect(strikeouts([game]).value).toBe(1);
    // 본 공: 2 + 4 + 4 + 1 + 1 = 12
    expect(pitchesSeen([game]).expression).toBe('12 ÷ 5');
  });

  it('카운트별 타율 (종료 카운트 기준)', () => {
    const rows = byEndCount([game]);
    expect(rows.map((r) => `${r.count.balls}-${r.count.strikes}`)).toEqual(['0-0', '1-0', '1-2', '3-0']);
    expect(rows.find((r) => r.count.balls === 1 && r.count.strikes === 0)!.battingAverage.display).toBe('1.000');
  });

  it('주루: 도루 성공 1, 실패 1, 견제 받음 1, 득점 2 (뒤 타자 안타 + 홈런), 잔루 1', () => {
    expect(stolenBases([game]).value).toBe(1);
    expect(caughtStealing([game]).value).toBe(1);
    expect(pickoffsReceived([game]).value).toBe(1);
    expect(pickedOff([game]).value).toBe(0);
    expect(runsScored([game]).value).toBe(2);
    expect(leftOnBase([game]).value).toBe(1);
  });

  it('타석이 없으면 계산 불가', () => {
    const empty = asGame([appear('runner', { childBase: 0 }), adjust(1, 0, [false, false, false], 1, 'scored')]);
    expect(battingAverage([empty]).display).toBe('-');
    expect(runsScored([empty]).value).toBe(1);
  });
});

describe('아이가 친 타구', () => {
  const g = asGame([
    appear('batter'),
    pitchWith('ball', { zone: { x: 0.9, y: 0.5 } }),
    pitchWith('hit', { hitType: 'double', zone: { x: 0.5, y: 0.6 }, battedBall: { x: 0.2, y: 0.5, type: 'fly', strength: 'hard' } }),
  ]);

  it('뜬공 1 ÷ 1, 세게 맞은 타구 1 ÷ 1', () => {
    const [, , fly, hard] = battedBallTypes([g]);
    expect(fly.display).toBe('100.0%');
    expect(hard.expression).toBe('1 ÷ 1');
  });

  it('본 공의 존 점 2개, 낙구 점 1개(안타)', () => {
    const c = charts([g]);
    expect(c.zone.map((p) => p.kind)).toEqual(['ball', 'inPlay']);
    expect(c.spray).toEqual([{ x: 0.2, y: 0.5, kind: 'hit' }]);
  });
});

describe('병살타', () => {
  it('아이가 친 병살은 타수 1, 안타 0 → 타율 0 ÷ 1', () => {
    const g = asGame([appear('batter', { bases: [true, false, false] }), pitchWith('out', { doublePlay: 0 })]);
    expect(battingAverage([g]).expression).toBe('0 ÷ 1');
  });

  it('병살타는 아이 타석만 센다: 아이 병살 1, 일반 아웃·다른 타자 병살은 빼고', () => {
    const g = asGame([
      appear('batter', { bases: [true, false, false] }),
      pitchWith('out', { doublePlay: 0 }),
      appear('batter', { inning: 2, bases: [true, false, false] }),
      ...pitches('out'),
      appear('runner', { inning: 3, childBase: 0 }),
      pitchWith('out', { doublePlay: 0 }),
    ]);
    const gidp = groundedIntoDoublePlays([g]);
    expect(gidp.value).toBe(1);
    expect(formatSources(gidp.terms[0].sources)).toBe('1회 1번째 타석');
  });

  it('병살타가 없으면 0', () => {
    expect(groundedIntoDoublePlays([asGame([appear('batter'), hit('single')])]).value).toBe(0);
  });
});

describe('희생타 · 진루타 · 타점', () => {
  // 1회: 3루 주자 있을 때 희생플라이 (3루 주자 홈인, 1타점)
  // 2회: 1루 주자 있을 때 희생번트 (주자 2루로)
  // 3회: 2루 주자 있을 때 진루타 (주자 3루로, 타수에 들어감)
  // 4회: 1·2루에서 2루타 → 2루 주자 홈인(자동) + 1루 주자도 홈인(상황 고치기 1점) = 2타점
  // 5회: 3루 주자 있을 때 실책 출루 (주자 홈인해도 타점 아님)
  const sacGame = asGame([
    appear('batter', { inning: 1, bases: [false, false, true] }),
    pitchWith('out', { outType: 'sacrificeFly' }),
    appear('batter', { inning: 2, bases: [true, false, false] }),
    pitchWith('out', { outType: 'sacrificeBunt' }),
    appear('batter', { inning: 3, bases: [false, true, false] }),
    pitchWith('out', { outType: 'productive' }),
    appear('batter', { inning: 4, bases: [true, true, false] }),
    hit('double'),
    adjust(4, 0, [false, true, false], 1, 1),
    appear('batter', { inning: 5, bases: [false, false, true] }),
    ...pitches('reachedOnError'),
  ]);

  it('희생번트·희생플라이는 타수에서 빠진다: 타율 = 안타 1 ÷ 타수 3 (진루타·2루타·실책 출루)', () => {
    expect(sacrificeFlies([sacGame]).value).toBe(1);
    expect(sacrificeBunts([sacGame]).value).toBe(1);
    expect(productiveOuts([sacGame]).value).toBe(1);
    expect(battingAverage([sacGame]).expression).toBe('1 ÷ 3');
  });

  it('출루율 분모에는 희생플라이만 들어간다: 1 ÷ (타수 3 + 희생플라이 1) = .250', () => {
    const obp = onBasePercentage([sacGame]);
    expect(obp.expression).toBe('1 ÷ 4');
    expect(obp.display).toBe('.250');
  });

  it('타점 = 희생플라이 1 + 2루타 2 = 3 (실책 출루 때 들어온 점수는 빼고)', () => {
    const rbi = runsBattedIn([sacGame]);
    expect(rbi.value).toBe(3);
  });

  it('희생플라이는 3루 주자를 홈에 들이고, 희생번트는 주자를 한 베이스 보낸다', () => {
    const [sf, sh] = sacGame.replay.plateAppearances;
    expect(sf.runsOnResult).toBe(1);
    expect(sh.runs).toBe(0);
    expect(sacGame.replay.scenes.length).toBe(5);
  });
});

describe('볼삼비 (타자)', () => {
  // 아이 타석 하나씩 따로 등장: 볼넷 2, 삼진 4
  const plate = (results: Parameters<typeof pitches>): PlayLogEvent[] => [appear('batter'), ...pitches(...results)];
  const walk = plate(['ball', 'ball', 'ball', 'ball']);
  const strikeout = plate(['strike', 'strike', 'strike']);
  const gamesOf = (...plates: PlayLogEvent[][]): GameForStats[] => [{ label: '10월 18일 ○○전', replay: replayGame(plates.flat(), settings()) }];

  it('볼넷 ÷ 삼진: 볼넷 2 · 삼진 4 → 0.50', () => {
    const ratio = walkStrikeoutRatio(gamesOf(walk, walk, strikeout, strikeout, strikeout, strikeout));
    expect(ratio.expression).toBe('2 ÷ 4');
    expect(ratio.display).toBe('0.50');
  });

  it('삼진이 0이면 계산할 수 없음 (-)', () => {
    const ratio = walkStrikeoutRatio(gamesOf(walk));
    expect(ratio.value).toBeNull();
    expect(ratio.display).toBe('-');
    expect(ratio.note).toBe('삼진이 0이라 계산할 수 없음');
  });
});
