import { describe, expect, it } from 'vitest';
import { formatSources } from '../common/calculation';
import { PlayLogEvent } from '../common/events';
import { replayGame } from '../common/replay';
import { appear, hit, pitchWith, pitches, play, settings } from '../common/test-helpers';
import {
  GameForStats,
  assists,
  byPosition,
  catcherItems,
  errors,
  fieldingInnings,
  fieldingPercentage,
  handledBallPoints,
  putouts,
  summarize,
  totalChances,
} from './stats';

const asGame = (label: string, events: PlayLogEvent[]): GameForStats => ({ label, replay: replayGame(events, settings()) });

// 유격수로 1회: 땅볼 송구 아웃(보살) · 뜬공 잡음(자살) · 실책 출루(실책) · 안타 · 다른 수비수 아웃(3아웃)
// 2회: 뜬공 잡음(자살)  → 잡은 아웃 4개(1 1/3이닝), 자살 2 · 보살 1 · 실책 1
const shortstop = asGame('10월 4일 ○○전', [
  appear('fielder', { position: 'shortstop' }),
  pitchWith('out', { fielding: ['assist'], battedBall: { x: 0.4, y: 0.6, type: 'ground', strength: null } }),
  pitchWith('out', { fielding: ['putout'] }),
  pitchWith('reachedOnError', { fielding: ['error'], battedBall: { x: 0.45, y: 0.62, type: 'ground', strength: null } }),
  hit('single'),
  ...pitches('out'),
  pitchWith('out', { fielding: ['putout'] }),
]);

describe('수비 기록 (유격수, 한 경기)', () => {
  it('수비 이닝 = 잡은 아웃 4 ÷ 3', () => {
    expect(fieldingInnings([shortstop]).expression).toBe('4 ÷ 3');
    expect(fieldingInnings([shortstop]).display).toBe('1 1/3');
  });

  it('자살 2 · 보살 1 · 실책 1, 수비 기회 4', () => {
    expect(putouts([shortstop]).value).toBe(2);
    expect(assists([shortstop]).value).toBe(1);
    expect(errors([shortstop]).value).toBe(1);
    expect(totalChances([shortstop]).expression).toBe('2 + 1 + 1');
    expect(totalChances([shortstop]).value).toBe(4);
  });

  it('수비율 = (2 + 1) ÷ 4 = .750', () => {
    const fpct = fieldingPercentage([shortstop]);
    expect(fpct.expression).toBe('3 ÷ 4');
    expect(fpct.display).toBe('.750');
  });

  it('출처: 자살은 1회 2번째, 2회 6번째 타석', () => {
    expect(formatSources(putouts([shortstop]).terms[0].sources)).toBe('1회 2번째 타석, 2회 6번째 타석');
  });

  it('처리한 타구 그림: 낙구 지점을 찍은 2개 (아웃 1, 실책 1)', () => {
    expect(handledBallPoints([shortstop]).map((p) => p.kind)).toEqual(['out', 'error']);
  });
});

describe('포수', () => {
  // 삼진(포수 자동 자살) · 도루 허용 · 2루 도루 저지(송구 = 보살)
  const catcher = asGame('x', [
    appear('fielder', { position: 'catcher', bases: [true, false, false] }),
    ...pitches('strike', 'strike', 'strike'),
    play('stolenBase', 0),
    play('caughtStealing', 1, ['assist']),
  ]);

  it('삼진은 포수 자살로 자동으로 센다', () => {
    expect(putouts([catcher]).value).toBe(1);
    expect(assists([catcher]).value).toBe(1);
    expect(fieldingPercentage([catcher]).display).toBe('1.000');
  });

  it('도루 허용 1 · 저지 1 → 도루 저지율 50.0%', () => {
    const [allowed, caught, rate] = catcherItems([catcher]);
    expect(allowed.value).toBe(1);
    expect(caught.value).toBe(1);
    expect(rate.expression).toBe('1 ÷ 2');
    expect(rate.display).toBe('50.0%');
  });

  it('포수 칸은 포수로 수비한 적이 있을 때만 보인다', () => {
    expect(summarize([catcher]).sections.map((s) => s.title)).toEqual(['수비 기록', '포수일 때']);
    expect(summarize([shortstop]).sections.map((s) => s.title)).toEqual(['수비 기록']);
  });

  it('포수가 아닌 자리의 삼진은 자살로 세지 않는다', () => {
    const g = asGame('x', [appear('fielder', { position: 'firstBase' }), ...pitches('strike', 'strike', 'strike')]);
    expect(putouts([g]).value).toBe(0);
  });
});

describe('투수 장면도 수비로 센다', () => {
  it('투수가 잡은 땅볼은 투수 자리의 자살', () => {
    const g = asGame('x', [appear('pitcher'), pitchWith('out', { fielding: ['putout'] }), appear('fielder', { inning: 2, position: 'leftField' }), ...pitches('out')]);
    const rows = byPosition([g]);
    expect(rows.map((r) => r.position)).toEqual(['pitcher', 'leftField']);
    expect(rows[0].putouts.value).toBe(1);
    expect(rows[0].putouts.title).toBe('투수 잡아서 아웃 (자살)');
    expect(rows[1].innings.display).toBe('1/3');
  });
});

describe('수비 기록이 없을 때', () => {
  it('공격만 했으면 수비 기회 0, 수비율은 계산할 수 없음(-)', () => {
    const g = asGame('x', [appear('batter'), hit('single')]);
    const fpct = fieldingPercentage([g]);
    expect(totalChances([g]).value).toBe(0);
    expect(fpct.value).toBeNull();
    expect(fpct.display).toBe('-');
    expect(fpct.note).toBe('수비 기회가 0이라 계산할 수 없음');
    expect(summarize([g]).hasData).toBe(false);
  });

  it('수비는 했지만 처리한 공이 없으면 이닝만 있고 수비율은 -', () => {
    const g = asGame('x', [appear('fielder', { position: 'rightField' }), ...pitches('out', 'out', 'out')]);
    expect(fieldingInnings([g]).display).toBe('1');
    expect(fieldingPercentage([g]).display).toBe('-');
  });
});

describe('여러 경기 합계', () => {
  it('두 경기의 기록을 더한다', () => {
    const second = asGame('10월 5일 △△전', [appear('fielder', { position: 'shortstop' }), pitchWith('out', { fielding: ['assist'] })]);
    expect(assists([shortstop, second]).value).toBe(2);
    expect(fieldingPercentage([shortstop, second]).expression).toBe('4 ÷ 5');
  });
});

describe('와일드피치 · 포일 때 홈에서 아웃 (포수)', () => {
  // 포수로 1회: 3루 주자 포일 홈 아웃을 태그(자살)
  const catcher = asGame('11월 8일 ○○전', [
    appear('fielder', { position: 'catcher', bases: [false, false, true] }),
    pitchWith('passedBall', { runnerOutAtHome: true, fielding: ['putout'] }),
  ]);

  it('태그 아웃은 자살 1, 잡은 아웃 1 (1/3이닝)', () => {
    expect(putouts([catcher]).value).toBe(1);
    expect(fieldingInnings([catcher]).display).toBe('1/3');
  });
});
