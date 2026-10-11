import { describe, expect, it } from 'vitest';
import { gamesChangedSince, lastChangeOf, parseBackupTime, shouldShowReminder } from './backup-reminder';
import { Game } from './game';
import { appear, pitches } from './test-helpers';

function gameAt(createdAt: string, eventTimes: string[]): Game {
  const events = [appear('pitcher'), ...pitches(...eventTimes.map(() => 'ball' as const))].slice(0, eventTimes.length);
  return { id: createdAt, createdAt, author: '나', events: events.map((e, i) => ({ ...e, createdAt: eventTimes[i] })) };
}

describe('백업 알림', () => {
  const old = gameAt('2026-10-01T09:00:00.000Z', ['2026-10-01T10:00:00.000Z']);
  const fresh = gameAt('2026-10-04T09:00:00.000Z', ['2026-10-04T09:30:00.000Z', '2026-10-04T11:00:00.000Z']);
  const empty = gameAt('2026-10-05T08:00:00.000Z', []);

  it('경기가 마지막으로 바뀐 시각: 가장 늦은 기록, 기록이 없으면 만든 시각', () => {
    expect(lastChangeOf(fresh)).toBe('2026-10-04T11:00:00.000Z');
    expect(lastChangeOf(empty)).toBe('2026-10-05T08:00:00.000Z');
  });

  it('백업한 적이 없으면 모든 경기가 백업 대상', () => {
    expect(gamesChangedSince([old, fresh], null)).toEqual([old, fresh]);
  });

  it('마지막 백업 뒤에 바뀐 경기만 센다 (백업 뒤에 이어서 기록한 경기 포함)', () => {
    expect(gamesChangedSince([old, fresh, empty], '2026-10-04T10:00:00.000Z')).toEqual([fresh, empty]);
    expect(gamesChangedSince([old, fresh, empty], '2026-10-05T09:00:00.000Z')).toEqual([]);
  });

  it('무시하기: 누른 뒤 바뀐 경기가 없으면 띠를 숨기고, 새로 기록하면 다시 보여준다', () => {
    expect(shouldShowReminder([old, fresh], null, null, 1)).toBe(true);
    expect(shouldShowReminder([old, fresh], null, '2026-10-04T12:00:00.000Z', 1)).toBe(false);
    expect(shouldShowReminder([old, fresh], null, '2026-10-04T10:00:00.000Z', 1)).toBe(true);
  });

  it('백업 안 한 경기가 없으면 무시하기와 상관없이 띠를 보이지 않는다', () => {
    expect(shouldShowReminder([old], '2026-10-02T00:00:00.000Z', null, 1)).toBe(false);
  });

  it('저장된 백업 시각이 망가져 있으면 백업한 적 없는 것으로 본다', () => {
    expect(parseBackupTime('2026-10-05T09:00:00.000Z')).toBe('2026-10-05T09:00:00.000Z');
    expect(parseBackupTime('엉뚱한 값')).toBeNull();
    expect(parseBackupTime(null)).toBeNull();
  });
});
