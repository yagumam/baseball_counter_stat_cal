import { describe, expect, it } from 'vitest';
import { gamesByDate, monthGrid, monthLabel, monthlyCounts, shiftMonth } from './calendar';
import { createGame } from './game';

const game = (date: string) => createGame({ date, opponent: '', gameType: 'practice', battingFirst: 'them', venue: 'home', ourTeam: '', place: '' });

describe('달력', () => {
  it('달 옮기기: 해가 바뀌는 달 포함', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
    expect(monthLabel('2026-03')).toBe('2026년 3월');
  });

  it('2026년 10월: 1일이 목요일, 31일까지 5주', () => {
    const grid = monthGrid('2026-10');
    expect(grid).toHaveLength(5);
    expect(grid[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(grid[4][6]).toBe('2026-10-31');
  });

  it('윤년 2월은 29일까지', () => {
    expect(monthGrid('2028-02').flat().filter(Boolean)).toHaveLength(29);
    expect(monthGrid('2026-02').flat().filter(Boolean)).toHaveLength(28);
  });

  it('날짜별·달별로 경기를 모은다', () => {
    const games = [game('2026-10-05'), game('2026-10-05'), game('2026-03-01')];
    expect(gamesByDate(games).get('2026-10-05')).toHaveLength(2);
    const counts = monthlyCounts(games, 2026);
    expect(counts[9]).toBe(2);
    expect(counts[2]).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
  });
});
