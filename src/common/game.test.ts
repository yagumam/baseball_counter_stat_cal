import { describe, expect, it } from 'vitest';
import { Game, countsInStats, createGame, gameInfo, isGame, recentOpponents, shiftDate, upgradeLegacyGame } from './game';
import { GameType } from './events';
import { LogEvent } from './events';

const legacyPitch: LogEvent = { kind: 'pitch', id: 'p1', createdAt: '2026-10-01T00:00:00.000Z', author: '나', result: 'ball' };

describe('예전 기록 읽기', () => {
  it('경기 정보도 등장도 없던 첫 버전: 날짜와 "1회 투수로 등장"을 붙인다', () => {
    const game: Game = { id: 'g', createdAt: '2026-10-01T09:00:00.000Z', author: '나', events: [legacyPitch] };
    const up = upgradeLegacyGame(game);
    expect(up.events.map((e) => e.kind)).toEqual(['gameInfo', 'appearance', 'pitch']);
    expect(gameInfo(up)).toMatchObject({ date: '2026-10-01', battingFirst: 'them', venue: 'home', ourTeam: '' });
  });

  it('시작 이닝이 있던 두 번째 버전: 그 이닝에 투수로 등장', () => {
    const info: LogEvent = { kind: 'gameInfo', id: 'i', createdAt: 'x', author: '나', date: '2026-10-02', opponent: 'A', gameType: 'practice', startInning: 3 };
    const up = upgradeLegacyGame({ id: 'g', createdAt: 'x', author: '나', events: [info, legacyPitch] });
    const appearance = up.events[1];
    expect(appearance.kind === 'appearance' && appearance.inning).toBe(3);
  });

  it('새로 만든 빈 경기에는 아무것도 붙이지 않는다', () => {
    const info: LogEvent = { kind: 'gameInfo', id: 'i', createdAt: 'x', author: '나', date: '2026-10-02', opponent: '', gameType: 'practice' };
    const game: Game = { id: 'g', createdAt: 'x', author: '나', events: [info] };
    expect(upgradeLegacyGame(game)).toBe(game);
  });
});

describe('규칙을 바꿔 저장했던 경기', () => {
  it('예전에 저장한 규칙 값은 무시하고 그대로 읽는다 (정식 규칙으로 계산)', () => {
    const info = { kind: 'gameInfo', id: 'i', createdAt: 'x', author: '나', date: '2026-10-02', opponent: '', gameType: 'practice', battingFirst: 'them', rules: { ballsForWalk: 5, strikesForStrikeout: 4, outsPerInning: 3 } };
    const game = { id: 'g', createdAt: 'x', author: '나', events: [info] };
    expect(isGame(game)).toBe(true);
    expect(gameInfo(game as Game)).toEqual({ date: '2026-10-02', opponent: '', gameType: 'practice', battingFirst: 'them', venue: 'home', ourTeam: '' });
  });
});

describe('경기 정보 빠른 입력', () => {
  it('어제·내일 날짜 (달·해가 바뀌는 날 포함)', () => {
    expect(shiftDate('2026-10-05', -1)).toBe('2026-10-04');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('예전 상대팀: 최근 경기 먼저, 같은 이름·빈 이름은 한 번만/빼고', () => {
    const game = (date: string, opponent: string) => createGame({ date, opponent, gameType: 'practice', battingFirst: 'them', venue: 'home', ourTeam: '' });
    const games = [game('2026-09-01', '가팀'), game('2026-10-01', '나팀'), game('2026-09-15', ' 가팀 '), game('2026-10-02', '')];
    expect(recentOpponents(games)).toEqual(['나팀', '가팀']);
    expect(recentOpponents(games, 1)).toEqual(['나팀']);
  });
});

describe('아웃 종류 저장 검사', () => {
  const withPitch = (pitch: Record<string, unknown>): unknown => ({
    id: 'g',
    createdAt: '2026-10-05T00:00:00.000Z',
    author: '나',
    events: [{ kind: 'pitch', id: 'p', createdAt: '2026-10-05T00:00:00.000Z', author: '나', ...pitch }],
  });

  it('아웃에만 붙고, 병살과 함께 쓸 수 없다', () => {
    expect(isGame(withPitch({ result: 'out', outType: 'sacrificeFly' }))).toBe(true);
    expect(isGame(withPitch({ result: 'hit', outType: 'sacrificeFly' }))).toBe(false);
    expect(isGame(withPitch({ result: 'out', outType: 'sacrificeBunt', doublePlay: 0 }))).toBe(false);
    expect(isGame(withPitch({ result: 'out', outType: 'triple' }))).toBe(false);
  });
});

describe('경기 구분과 통계', () => {
  const ofType = (gameType: GameType) => createGame({ date: '2026-10-10', opponent: '', gameType, battingFirst: 'them', venue: 'home', ourTeam: '' });

  it('미니게임 · 기타는 통계에서 빼고, 연습 · 대회 · 예전 리그경기는 넣는다', () => {
    expect(countsInStats(ofType('mini'))).toBe(false);
    expect(countsInStats(ofType('other'))).toBe(false);
    expect(countsInStats(ofType('practice'))).toBe(true);
    expect(countsInStats(ofType('tournament'))).toBe(true);
    expect(countsInStats(ofType('league'))).toBe(true);
  });

  it('예전 리그경기 기록도 그대로 읽힌다', () => {
    expect(isGame(ofType('league'))).toBe(true);
    expect(isGame(ofType('mini'))).toBe(true);
  });
});
