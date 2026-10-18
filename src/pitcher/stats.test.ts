import { describe, expect, it } from 'vitest';
import { formatSources } from '../common/calculation';
import { PlayLogEvent } from '../common/events';
import { replayGame } from '../common/replay';
import { adjust, appear, batter, hit, pitchWith, pitches, play, settings } from '../common/test-helpers';
import {
  GameForStats,
  averageSpeed,
  battedBallTypes,
  byBatterHand,
  earnedRunAverage,
  earnedRuns,
  unearnedRuns,
  byPitchType,
  charts,
  topSpeed,
  battersFaced,
  battingAverageAgainst,
  byEndCount,
  caughtStealing,
  errorsBehind,
  extraBaseHitsAllowed,
  homeRunsAllowed,
  inningsPitched,
  pickoffAttempts,
  pitchCount,
  pitchesByInning,
  runsAllowed,
  sluggingAgainst,
  stolenBasesAllowed,
  strikeRate,
  strikeouts,
  walks,
  wildPitches,
  passedBalls,
  strikeoutWalkRatio,
} from './stats';

const asGame = (label: string, events: PlayLogEvent[]): GameForStats => ({ label, replay: replayGame(events, settings()) });

// 1회 선발
//  타석1: 볼 스트라이크 1루타                 (볼 1 · 스트라이크 1)
//  타석2: 견제, 스트라이크 번트파울 번트파울   (쓰리번트 삼진)
//  타석3: 와일드피치 볼 볼 볼                 (볼넷)
//  타석4: 파울 아웃
//  타석5: 볼, 견제 아웃 → 3아웃 (중단)
const game = asGame('10월 4일 ○○전', [
  appear('pitcher'),
  ...pitches('ball', 'strike'),
  hit('single'),
  play('pickoff', 0),
  ...pitches('strike', 'buntFoul', 'buntFoul'),
  ...pitches('wildPitch', 'ball', 'ball', 'ball'),
  ...pitches('foul', 'out'),
  ...pitches('ball'),
  play('pickoffOut', 0),
]);

describe('투수 통계 (한 경기)', () => {
  it('투구 수 = 1회 13', () => {
    expect(pitchCount([game]).expression).toBe('1회 13');
  });

  it('스트라이크 비율 = 7 ÷ 13 (번트 파울 포함, 와일드피치는 볼)', () => {
    const c = strikeRate([game]);
    expect(c.expression).toBe('7 ÷ 13');
    expect(c.display).toBe('53.8%');
  });

  it('던진 이닝 = 잡은 아웃 3 ÷ 3 = 1', () => {
    expect(inningsPitched([game]).display).toBe('1');
  });

  it('쓰리번트 아웃은 삼진, 볼넷 1, 와일드피치 1, 견제 2', () => {
    expect(strikeouts([game]).value).toBe(1);
    expect(walks([game]).value).toBe(1);
    expect(wildPitches([game]).value).toBe(1);
    expect(pickoffAttempts([game]).value).toBe(2);
  });

  it('피안타율 = 1 ÷ 3 = .333 (볼넷·중단 타석 제외)', () => {
    const c = battingAverageAgainst([game]);
    expect(c.formula).toBe('맞은 안타 ÷ 상대 타수');
    expect(c.display).toBe('.333');
    expect(formatSources(c.terms[1].sources)).toBe('1회 1·2·4번째 타석');
  });

  it('카운트별(종료 카운트 기준)은 기록에 있는 카운트만', () => {
    const rows = byEndCount([game]);
    expect(rows.map((r) => `${r.count.balls}-${r.count.strikes}`)).toEqual(['0-1', '0-2', '1-1', '3-0']);
  });

  it('타수가 0이면 계산 불가(-)와 이유', () => {
    const c = battingAverageAgainst([asGame('x', [appear('pitcher'), ...pitches('ball', 'ball', 'ball', 'ball')])]);
    expect(c.display).toBe('-');
    expect(c.note).toContain('계산할 수 없음');
  });
});

describe('안타 종류·실점·실책·도루', () => {
  const g = asGame('x', [
    appear('pitcher'),
    hit('double'),
    hit('homeRun'),
    ...pitches('reachedOnError'),
    play('stolenBase', 0),
    play('caughtStealing', 1),
    ...pitches('strike', 'strike', 'strike', 'out'),
  ]);

  it('실점 2, 장타 2, 홈런 1', () => {
    expect(runsAllowed([g]).value).toBe(2);
    expect(extraBaseHitsAllowed([g]).value).toBe(2);
    expect(homeRunsAllowed([g]).value).toBe(1);
  });

  it('피장타율 = 6 ÷ 5 = 1.200, 피안타율 = 2 ÷ 5', () => {
    expect(sluggingAgainst([g]).display).toBe('1.200');
    expect(battingAverageAgainst([g]).expression).toBe('2 ÷ 5');
  });

  it('수비 실책 1, 도루 허용 1, 도루 저지 1, 이닝별 투구 수', () => {
    expect(errorsBehind([g]).value).toBe(1);
    expect(stolenBasesAllowed([g]).value).toBe(1);
    expect(caughtStealing([g]).value).toBe(1);
    expect(pitchesByInning([g])[0].expression).toBe('1 + 1 + 1 + 3 + 1');
  });
});

describe('투수 장면만 센다', () => {
  it('같은 경기의 아이 타석은 투수 통계에 들어가지 않는다', () => {
    const g = asGame('x', [appear('pitcher'), ...pitches('out'), appear('batter', { inning: 1 }), hit('single')]);
    expect(pitchCount([g]).value).toBe(1);
    expect(battingAverageAgainst([g]).expression).toBe('0 ÷ 1');
  });

  it('아이가 다른 자리에서 수비할 때의 상대 타석(다른 투수가 던짐)은 투수 통계에 들어가지 않는다', () => {
    const g = asGame('x', [appear('pitcher'), ...pitches('strike'), appear('fielder', { inning: 2, position: 'shortstop' }), ...pitches('ball', 'out')]);
    expect(pitchCount([g]).value).toBe(1);
    expect(battersFaced([g]).value).toBe(0);
  });

  it('중계로 들어와 이어받은 카운트도 아이가 끝낸 타석이면 아이 기록', () => {
    const g = asGame('x', [appear('pitcher', { inning: 5, outs: 2, balls: 3, strikes: 2 }), ...pitches('strike')]);
    expect(strikeouts([g]).value).toBe(1);
    expect(pitchCount([g]).value).toBe(1);
    expect(inningsPitched([g]).display).toBe('1/3');
  });
});

describe('여러 경기 합계', () => {
  const second = asGame('10월 11일 △△전', [appear('pitcher', { inning: 2, outs: 1, bases: [true, false, false] }), play('caughtStealingSecond'), hit('single')]);

  it('투구 수는 경기별로 더하고, 출처는 경기별로 묶는다', () => {
    expect(pitchCount([game, second]).expression).toBe('10월 4일 ○○전 13 + 10월 11일 △△전 1');
    const c = battingAverageAgainst([game, second]);
    expect(formatSources(c.terms[0].sources)).toBe('10월 4일 ○○전: 1회 1번째 타석 / 10월 11일 △△전: 2회 1번째 타석');
  });

  it('던진 이닝: 3아웃 + 1아웃 = 1 1/3', () => {
    expect(inningsPitched([game, second]).display).toBe('1 1/3');
  });
});

describe('구종·구속·맞은 타구', () => {
  const g = asGame('x', [
    appear('pitcher'),
    pitchWith('strike', { pitchType: 'fastball', speed: 100, zone: { x: 0.5, y: 0.5 } }),
    pitchWith('ball', { pitchType: 'fastball', speed: 104, zone: { x: 0.1, y: 0.5 } }),
    pitchWith('strike', { pitchType: 'curveball', speed: 80 }),
    pitchWith('out', { battedBall: { x: 0.4, y: 0.8, type: 'ground', strength: 'soft' } }),
    pitchWith('hit', { hitType: 'single', battedBall: { x: 0.5, y: 0.5, type: 'line', strength: 'hard' } }),
    pitchWith('out', { battedBall: { x: null, y: null, type: null, strength: null } }),
  ]);

  it('평균 구속 = (100 + 104 + 80) ÷ 3 = 94.7 km/h, 최고 104', () => {
    expect(averageSpeed([g]).expression).toBe('284 ÷ 3');
    expect(averageSpeed([g]).display).toBe('94.7 km/h');
    expect(topSpeed([g]).display).toBe('104 km/h');
  });

  it('구종별: 직구 2개(비율 2 ÷ 3), 스트라이크 비율 1 ÷ 2, 평균 102 km/h / 커브 1개', () => {
    const rows = byPitchType([g]);
    expect(rows.map((r) => r.pitchType)).toEqual(['fastball', 'curveball']);
    expect(rows[0].share.expression).toBe('2 ÷ 3');
    expect(rows[0].strikeRate.display).toBe('50.0%');
    expect(rows[0].speed.display).toBe('102.0 km/h');
  });

  it('맞은 타구: 종류를 기록한 2개 중 땅볼 1, 라인드라이브 1, 세게 1 (건너뛴 타구는 빼고)', () => {
    const [ground, line, fly, hard] = battedBallTypes([g]);
    expect(ground.expression).toBe('1 ÷ 2');
    expect(line.display).toBe('50.0%');
    expect(fly.expression).toBe('0 ÷ 2');
    expect(hard.expression).toBe('1 ÷ 2');
  });

  it('그림 점: 존은 위치를 찍은 2개, 낙구는 위치를 찍은 2개 (아웃·안타)', () => {
    const c = charts([g]);
    expect(c.zone.map((p) => p.kind)).toEqual(['strike', 'ball']);
    expect(c.spray.map((p) => p.kind)).toEqual(['out', 'hit']);
  });

  it('구속을 잰 공이 없으면 계산 불가', () => {
    expect(averageSpeed([game]).display).toBe('-');
    expect(averageSpeed([game]).note).toContain('계산할 수 없음');
  });
});

describe('병살', () => {
  it('병살로 잡은 아웃 2개 → 던진 이닝 2/3, 상대 타자 1명', () => {
    const g = asGame('x', [appear('pitcher', { bases: [true, false, false] }), pitchWith('out', { doublePlay: 0 })]);
    expect(inningsPitched([g]).expression).toBe('2 ÷ 3');
    expect(inningsPitched([g]).display).toBe('2/3');
    expect(battersFaced([g]).value).toBe(1);
  });
});

describe('좌타 · 우타별', () => {
  it('타자 정보를 고른 타석만 나눠 센다: 우타 2타수 1안타 .500, 좌타 1타수 0안타 .000', () => {
    const games: GameForStats[] = [
      {
        label: '10월 5일 ○○전',
        replay: replayGame(
          [
            appear('pitcher'),
            batter('right', 5),
            hit('single'),
            batter('right', null),
            ...pitches('out'),
            batter('left', 6),
            ...pitches('out'),
            ...pitches('out'),
          ],
          settings(),
        ),
      },
    ];
    const [rightPa, rightAvg, leftPa, leftAvg] = byBatterHand(games);
    expect(rightPa.value).toBe(2);
    expect(rightAvg.expression).toBe('1 ÷ 2');
    expect(rightAvg.display).toBe('.500');
    expect(leftPa.value).toBe(1);
    expect(leftAvg.display).toBe('.000');
    // 고르지 않은 네 번째 타자는 어느 쪽에도 들어가지 않는다.
    expect(games[0].replay.plateAppearances[3].batterHand).toBeNull();
    expect(games[0].replay.plateAppearances[0].batterGrade).toBe(5);
  });
});

describe('자책점 · 비자책점 · 평균자책점', () => {
  const asGames = (events: PlayLogEvent[]): GameForStats[] => [{ label: '10월 6일 ○○전', replay: replayGame(events, settings()) }];

  it('1·2루 내야 뜬공 실책 → 2루 주자 득점, 1루 주자 홈에서 주루사: 실점 1 = 비자책 1, 아웃 1', () => {
    const games = asGames([
      appear('pitcher', { bases: [true, true, false] }),
      // 실책 출루: 타자 1루, 1루 주자 2루, 2루 주자 3루 (자동)
      ...pitches('reachedOnError'),
      // 상황 고치기: 3루까지 간 주자 홈인(1점), 2루까지 간 주자는 홈에서 아웃 → 주자는 타자 한 명(1루), 1아웃
      adjust(1, 1, [true, false, false], 1),
    ]);
    expect(runsAllowed(games).value).toBe(1);
    expect(unearnedRuns(games).value).toBe(1);
    expect(earnedRuns(games).value).toBe(0);
    expect(inningsPitched(games).display).toBe('1/3');
  });

  it('주자 아웃 버튼으로 기록해도 같다 (실책 → 주자 아웃 → 상황 고치기 1점)', () => {
    const games = asGames([
      appear('pitcher', { bases: [true, true, false] }),
      ...pitches('reachedOnError'),
      play('runnerOut', 1),
      adjust(1, 1, [true, false, false], 1),
    ]);
    expect(unearnedRuns(games).value).toBe(1);
    expect(earnedRuns(games).value).toBe(0);
  });

  it('3루 주자가 포일로 홈인: 실점 1 = 비자책 1, 와일드피치로 홈인하면 자책 1', () => {
    const passed = asGames([appear('pitcher', { bases: [false, false, true] }), ...pitches('passedBall')]);
    expect(runsAllowed(passed).value).toBe(1);
    expect(unearnedRuns(passed).value).toBe(1);
    expect(earnedRuns(passed).value).toBe(0);
    const wild = asGames([appear('pitcher', { bases: [false, false, true] }), ...pitches('wildPitch')]);
    expect(earnedRuns(wild).value).toBe(1);
  });

  it('포일 뒤 바로 상황 고치기로 넣은 점수도 비자책 (2루 주자도 홈까지)', () => {
    const games = asGames([appear('pitcher', { bases: [false, true, false] }), ...pitches('passedBall'), adjust(1, 0, [false, false, false], 1)]);
    expect(unearnedRuns(games).value).toBe(1);
    expect(earnedRuns(games).value).toBe(0);
  });

  it('포일 수는 따로 세고, 스트라이크 비율에서는 볼로 센다: 포일 1 + 스트라이크 1 → 50.0%', () => {
    const games = asGames([appear('pitcher', { bases: [true, false, false] }), ...pitches('passedBall', 'strike')]);
    expect(passedBalls(games).value).toBe(1);
    expect(wildPitches(games).value).toBe(0);
    expect(strikeRate(games).display).toBe('50.0%');
  });

  it('실책으로 나간 주자가 뒤 타자 홈런에 들어오면 그 1점만 비자책: 실점 2 = 자책 1 + 비자책 1', () => {
    const games = asGames([appear('pitcher'), ...pitches('reachedOnError'), hit('homeRun')]);
    expect(runsAllowed(games).value).toBe(2);
    expect(unearnedRuns(games).value).toBe(1);
    expect(earnedRuns(games).value).toBe(1);
  });

  it('평균자책점 = 자책점 × 9 ÷ 던진 이닝: 1이닝 자책 1 → 9.00, 아웃이 없으면 계산할 수 없음', () => {
    const games = asGames([appear('pitcher'), hit('homeRun'), ...pitches('out', 'out', 'out')]);
    const era = earnedRunAverage(games);
    expect(era.display).toBe('9.00');
    expect(era.expression).toBe('1 × 9 ÷ 1이닝');
    const none = earnedRunAverage(asGames([appear('pitcher'), hit('homeRun')]));
    expect(none.value).toBeNull();
    expect(none.display).toBe('-');
  });
});

describe('볼삼비 (투수)', () => {
  const gamesOf = (events: PlayLogEvent[]): GameForStats[] => [{ label: '10월 18일 ○○전', replay: replayGame(events, settings()) }];
  const k = pitches('strike', 'strike', 'strike');
  const bb = pitches('ball', 'ball', 'ball', 'ball');

  it('삼진 ÷ 볼넷: 삼진 3 · 볼넷 2 → 1.50', () => {
    const ratio = strikeoutWalkRatio(gamesOf([appear('pitcher'), ...k, ...bb, ...k, ...bb, ...k]));
    expect(ratio.expression).toBe('3 ÷ 2');
    expect(ratio.display).toBe('1.50');
  });

  it('볼넷이 0이면 계산할 수 없음 (-), 둘 다 0이어도 마찬가지', () => {
    expect(strikeoutWalkRatio(gamesOf([appear('pitcher'), ...k])).display).toBe('-');
    const none = strikeoutWalkRatio(gamesOf([appear('pitcher')]));
    expect(none.value).toBeNull();
    expect(none.note).toBe('볼넷이 0이라 계산할 수 없음');
  });
});
