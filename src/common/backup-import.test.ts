import { describe, expect, it } from 'vitest';
import { mergeGames, mergeSummary, parseBackup } from './backup-import';
import { backupJson } from './export';
import { Game, addAppearance, addPitch, createGame } from './game';

function startedGame(): Game {
  const g = createGame({ date: '2026-10-05', opponent: '서울 ○○초', gameType: 'practice', battingFirst: 'them', venue: 'home', ourTeam: '', place: '' });
  return addAppearance(g, { role: 'pitcher', inning: 1, outs: 0, bases: [false, false, false], balls: 0, strikes: 0 });
}

describe('백업 파일 읽기', () => {
  it('내려받은 백업 파일을 그대로 다시 읽는다', () => {
    const game = addPitch(startedGame(), 'ball', { speed: 98 });
    const result = parseBackup(backupJson([game], '2026-10-05T00:00:00.000Z'));
    expect(result).toEqual({ ok: true, games: [game] });
  });

  it('JSON이 아니면 알린다', () => {
    expect(parseBackup('엑셀 파일')).toMatchObject({ ok: false });
  });

  it('다른 앱의 파일이면 알린다', () => {
    expect(parseBackup(JSON.stringify({ app: 'other', formatVersion: 1, games: [] }))).toEqual({ ok: false, message: '이 앱의 백업 파일이 아닙니다.' });
  });

  it('더 새 형식 버전이면 불러오지 않는다', () => {
    expect(parseBackup(JSON.stringify({ app: 'baseball-counter', formatVersion: 99, games: [] }))).toMatchObject({ ok: false });
  });

  it('망가진 경기가 하나라도 있으면 몇 번째인지 알리고 아무것도 불러오지 않는다', () => {
    const text = JSON.stringify({ app: 'baseball-counter', formatVersion: 1, games: [startedGame(), { id: 'x' }] });
    expect(parseBackup(text)).toEqual({ ok: false, message: '백업 파일의 2번째 경기 기록이 망가져 있어 불러오지 않았습니다.' });
  });
});

describe('기록 합치기 (덮어쓰지 않음)', () => {
  const base = startedGame();
  const longer = addPitch(addPitch(base, 'ball'), 'strike');

  it('처음 보는 경기는 더한다', () => {
    const other = startedGame();
    const r = mergeGames([base], [other]);
    expect(r.games.map((g) => g.id)).toEqual([base.id, other.id]);
    expect(r.added).toBe(1);
  });

  it('같은 경기를 다시 불러오면 그대로 둔다', () => {
    const r = mergeGames([longer], [base]);
    expect(r.games).toEqual([longer]);
    expect(r.unchanged).toBe(1);
  });

  it('백업 쪽이 더 이어서 기록됐으면 늘어난 투구 2개만 덧붙인다', () => {
    const r = mergeGames([base], [longer]);
    expect(r.games).toHaveLength(1);
    expect(r.games[0].events.map((e) => e.id)).toEqual(longer.events.map((e) => e.id));
    expect(r.extended).toBe(1);
  });

  it('서로 다르게 기록됐으면 지금 기록은 두고 백업은 새 id 사본으로 더한다', () => {
    const here = addPitch(base, 'ball');
    const there = addPitch(base, 'strike');
    const r = mergeGames([here], [there]);
    expect(r.games).toHaveLength(2);
    expect(r.games[0]).toEqual(here);
    expect(r.games[1].id).not.toBe(base.id);
    expect(r.games[1].events).toEqual(there.events);
    expect(r.games[1].copiedFrom).toBe(base.id);
    expect(r.copied).toBe(1);
  });

  it('결과를 쉬운 말로 알린다', () => {
    expect(mergeSummary({ games: [], added: 2, extended: 0, unchanged: 1, copied: 0 })).toBe(
      '불러오기 완료: 새 경기 2개를 더했습니다, 이미 있는 경기 1개는 그대로 두었습니다.',
    );
    expect(mergeSummary({ games: [], added: 0, extended: 0, unchanged: 0, copied: 0 })).toBe('백업 파일에 경기가 없습니다.');
  });
});
