import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_COLUMNS, PITCH_COLUMNS, PLAY_COLUMNS } from './analysis-export';
import { activeEvents, playEvents } from './events';
import { Game, addAppearance, addPitch, addPlay, addVoid, createGame, gameInfo } from './game';
import { replayGame } from './replay';
import {
  MAX_GAMES_PER_REQUEST,
  SyncPayload,
  deleteAllPayload,
  gameSignature,
  pendingSync,
  syncBatches,
  syncPayload,
  validSyncUrl,
} from './sheet-sync';
import { createSheetSync } from './sheet-sync-client';
import codeGs from '../../apps-script/Code.gs?raw';

const replayOf = (g: Game) =>
  replayGame(playEvents(activeEvents(g.events)), { battingFirst: gameInfo(g).battingFirst, miniGame: gameInfo(g).gameType === 'mini' });

const DEVICE_A = '11111111-1111-4111-8111-111111111111';
const DEVICE_B = '22222222-2222-4222-8222-222222222222';

/** 공 3개 + 도루 1개인 투수 경기 */
function sampleGame(opponent = '가팀'): Game {
  let g = createGame({ date: '2026-10-05', opponent, gameType: 'practice', battingFirst: 'them', venue: 'home', ourTeam: '', place: '' });
  g = addAppearance(g, { role: 'pitcher', inning: 1, outs: 0, bases: [false, false, false], balls: 0, strikes: 0 });
  g = addPitch(g, 'hit', { hitType: 'single' });
  g = addPlay(g, 'stolenBase', 0);
  g = addPitch(g, 'ball');
  g = addPitch(g, 'strike');
  return g;
}

// ---------- apps-script/Code.gs를 가짜 시트로 돌려 본다 ----------

class FakeSheet {
  values: (string | number)[][] = [];
  readonly textColumns = new Set<number>();
  getLastRow(): number {
    return this.values.length;
  }
  getDataRange() {
    return { getValues: () => this.values.map((r) => [...r]) };
  }
  clearContents(): void {
    this.values = [];
  }
  getRange(row: number, col: number, _rows: number, _cols: number) {
    return {
      setValues: (v: (string | number)[][]) => {
        expect([row, col]).toEqual([1, 1]);
        this.values = v.map((r) => [...r]);
      },
      setNumberFormat: (format: string) => {
        if (format === '@') this.textColumns.add(col);
      },
    };
  }
}

class FakeBook {
  readonly sheets = new Map<string, FakeSheet>();
  getSheetByName(name: string): FakeSheet | null {
    return this.sheets.get(name) ?? null;
  }
  insertSheet(name: string): FakeSheet {
    const sheet = new FakeSheet();
    this.sheets.set(name, sheet);
    return sheet;
  }
  rows(name: string): (string | number)[][] {
    return this.sheets.get(name)?.values ?? [];
  }
}

type Script = { applySync: (book: FakeBook, body: unknown) => { ok: boolean; games: number; removedRows: number } };

const script: Script = new Function(`${codeGs}\nreturn { applySync };`)();

/** 앱이 보내는 그대로(JSON 글자)를 거쳐 시트에 넣는다. */
const send = (book: FakeBook, payload: SyncPayload) => script.applySync(book, JSON.parse(JSON.stringify(payload)));

describe('보낼 내용 (sheet-sync)', () => {
  it('경기 서명: 기록을 더하면 바뀐다', () => {
    const g = sampleGame();
    expect(gameSignature(g)).toBe(`${g.events.length}:${g.events[g.events.length - 1].id}`);
    expect(gameSignature(addPitch(g, 'ball'))).not.toBe(gameSignature(g));
  });

  it('보낼 것: 처음 보거나 바뀐 경기, 보낸 뒤 지운 경기', () => {
    const a = sampleGame();
    const b = sampleGame();
    const synced = { [a.id]: gameSignature(a), [b.id]: 'old', gone: 'x' };
    const c = sampleGame();
    const pending = pendingSync([a, b, c], synced);
    expect(pending.changed.map((g) => g.id)).toEqual([b.id, c.id]);
    expect(pending.deletedIds).toEqual(['gone']);
    expect(pendingSync([a], { [a.id]: gameSignature(a) })).toEqual({ changed: [], deletedIds: [] });
  });

  it('경기를 나눠 보내고, 지운 경기는 첫 묶음에', () => {
    const games = Array.from({ length: MAX_GAMES_PER_REQUEST + 1 }, () => sampleGame());
    const batches = syncBatches(games, ['gone']);
    expect(batches.map((b) => b.games.length)).toEqual([MAX_GAMES_PER_REQUEST, 1]);
    expect(batches.map((b) => b.deletedIds)).toEqual([['gone'], []]);
    expect(syncBatches([], ['gone'])).toEqual([{ games: [], deletedIds: ['gone'] }]);
    expect(syncBatches([], [])).toEqual([]);
  });

  it('줄의 칸 수와 순서는 분석용 CSV 열과 같다', () => {
    const g = sampleGame();
    const payload = syncPayload(DEVICE_A, [g], [], replayOf);
    expect(payload.tables.pitches.columns.map((c) => c.name)).toEqual(PITCH_COLUMNS.map((c) => c.name));
    expect(payload.tables.plays.columns.map((c) => c.name)).toEqual(PLAY_COLUMNS.map((c) => c.name));
    expect(payload.tables.games.columns.map((c) => c.name)).toEqual(GAME_COLUMNS.map((c) => c.name));
    const rows = payload.games[0].rows;
    expect([rows.pitches.length, rows.plays.length, rows.games.length]).toEqual([3, 1, 1]);
    expect(rows.pitches.every((r) => r.length === PITCH_COLUMNS.length)).toBe(true);
    expect(rows.pitches[0][0]).toBe(g.id);
  });

  it('Apps Script 웹 앱 주소만 받는다', () => {
    expect(validSyncUrl(' https://script.google.com/macros/s/AKfy_cb-123/exec ')).toBe('https://script.google.com/macros/s/AKfy_cb-123/exec');
    expect(validSyncUrl('https://example.com/macros/s/x/exec')).toBeNull();
    expect(validSyncUrl('http://script.google.com/macros/s/x/exec')).toBeNull();
    expect(validSyncUrl('')).toBeNull();
    expect(validSyncUrl(undefined)).toBeNull();
  });
});

describe('시트에서 받기 (apps-script/Code.gs)', () => {
  it('처음 보내면 탭 3개를 만들고, 머리줄은 CSV 열 + device_id', () => {
    const book = new FakeBook();
    const g = sampleGame();
    expect(send(book, syncPayload(DEVICE_A, [g], [], replayOf))).toEqual({ ok: true, games: 1, removedRows: 0 });
    expect(book.rows('pitches')[0]).toEqual([...PITCH_COLUMNS.map((c) => c.name), 'device_id']);
    expect(book.rows('plays')[0]).toEqual([...PLAY_COLUMNS.map((c) => c.name), 'device_id']);
    expect([book.rows('pitches').length, book.rows('plays').length, book.rows('games').length]).toEqual([4, 2, 2]);
    expect(book.rows('pitches')[1].at(-1)).toBe(DEVICE_A);
    // 빈 값은 빈 칸, 숫자는 숫자 그대로
    const header = book.rows('pitches')[0];
    const first = book.rows('pitches')[1];
    expect(first[header.indexOf('pitch_type')]).toBe('');
    expect(first[header.indexOf('inning')]).toBe(1);
  });

  it('ID·날짜 같은 글자 열은 글자 서식, 숫자 열은 그대로', () => {
    const book = new FakeBook();
    send(book, syncPayload(DEVICE_A, [sampleGame()], [], replayOf));
    const text = book.sheets.get('pitches')?.textColumns ?? new Set();
    const col = (name: string): number => PITCH_COLUMNS.findIndex((c) => c.name === name) + 1;
    expect(text.has(col('game_id'))).toBe(true);
    expect(text.has(col('game_date'))).toBe(true);
    expect(text.has(col('inning'))).toBe(false);
    expect(text.has(PITCH_COLUMNS.length + 1)).toBe(true);
  });

  it('같은 경기를 다시 보내도 줄이 겹치지 않고, 고친 기록으로 바뀐다', () => {
    const book = new FakeBook();
    let g = sampleGame();
    send(book, syncPayload(DEVICE_A, [g], [], replayOf));
    send(book, syncPayload(DEVICE_A, [g], [], replayOf));
    expect(book.rows('pitches').length).toBe(4);
    // 마지막 공을 취소하고 공 2개를 더함 → 공 4개
    const lastPitch = g.events.filter((e) => e.kind === 'pitch').at(-1);
    g = addPitch(addPitch(addVoid(g, lastPitch?.id ?? ''), 'foul'), 'foul');
    expect(send(book, syncPayload(DEVICE_A, [g], [], replayOf)).removedRows).toBe(3 + 1 + 1);
    expect(book.rows('pitches').length).toBe(5);
  });

  it('다른 휴대폰의 같은 경기(백업을 불러온 경우)는 따로 둔다', () => {
    const book = new FakeBook();
    const g = sampleGame();
    send(book, syncPayload(DEVICE_A, [g], [], replayOf));
    send(book, syncPayload(DEVICE_B, [g], [], replayOf));
    send(book, syncPayload(DEVICE_A, [g], [], replayOf));
    expect(book.rows('games').length).toBe(3);
    expect(book.rows('games').slice(1).map((r) => r.at(-1)).sort()).toEqual([DEVICE_A, DEVICE_B]);
  });

  it('휴대폰에서 지운 경기는 시트에서도 지운다', () => {
    const book = new FakeBook();
    const keep = sampleGame('남길 팀');
    const gone = sampleGame('지울 팀');
    send(book, syncPayload(DEVICE_A, [keep, gone], [], replayOf));
    send(book, syncPayload(DEVICE_A, [], [gone.id], replayOf));
    expect(book.rows('games').slice(1).map((r) => r[0])).toEqual([keep.id]);
    expect(book.rows('pitches').length).toBe(4);
  });

  it('보낸 기록 지우기: 이 휴대폰 줄만 모두 지운다', () => {
    const book = new FakeBook();
    send(book, syncPayload(DEVICE_A, [sampleGame()], [], replayOf));
    send(book, syncPayload(DEVICE_B, [sampleGame()], [], replayOf));
    send(book, deleteAllPayload(DEVICE_A));
    expect(book.rows('pitches').slice(1).every((r) => r.at(-1) === DEVICE_B)).toBe(true);
    expect(book.rows('pitches').length).toBe(4);
    // 아직 아무것도 없는 시트에서 지워도 괜찮다
    expect(send(new FakeBook(), deleteAllPayload(DEVICE_A))).toEqual({ ok: true, games: 0, removedRows: 0 });
  });

  it('잘못 보낸 내용은 이유와 함께 거절한다', () => {
    const book = new FakeBook();
    const good = syncPayload(DEVICE_A, [sampleGame()], [], replayOf);
    expect(() => send(book, { ...good, app: 'other' } as unknown as SyncPayload)).toThrow('야구맘기록지');
    expect(() => send(book, { ...good, analysisFormatVersion: 2 } as unknown as SyncPayload)).toThrow('형식 버전');
    expect(() => send(book, { ...good, deviceId: 'x' })).toThrow('휴대폰 구분');
    const short = { ...good, games: [{ ...good.games[0], rows: { ...good.games[0].rows, pitches: [['a']] } }] };
    expect(() => send(book, short)).toThrow('칸 수');
    expect(book.sheets.size).toBe(0);
  });

  it('탭의 열 구조가 다르면 덮어쓰지 않고 멈춘다', () => {
    const book = new FakeBook();
    book.insertSheet('pitches').values = [['old_column']];
    expect(() => send(book, syncPayload(DEVICE_A, [sampleGame()], [], replayOf))).toThrow('열 구조');
    expect(book.rows('pitches')).toEqual([['old_column']]);
  });
});

describe('보내기 (sheet-sync-client)', () => {
  const URL = 'https://script.google.com/macros/s/test/exec';
  let book: FakeBook;
  let store: Map<string, string>;
  let online: boolean;

  beforeEach(() => {
    book = new FakeBook();
    store = new Map();
    online = true;
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    // 앱이 보낸 글자를 Code.gs에 그대로 넘기는 가짜 인터넷
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      if (!online) throw new TypeError('Failed to fetch');
      try {
        return new Response(JSON.stringify(script.applySync(book, JSON.parse(init.body))));
      } catch (error) {
        return new Response(JSON.stringify({ ok: false, error: (error as Error).message }));
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('처음에는 꺼져 있어 보내지 않는다', async () => {
    const sync = createSheetSync(URL, () => [sampleGame()], replayOf, () => {});
    expect(sync.state().enabled).toBe(false);
    await sync.syncNow();
    expect(book.sheets.size).toBe(0);
  });

  it('동의하고 켜면 보내고, 바뀐 경기만 다시 보낸다', async () => {
    let games = [sampleGame('가팀'), sampleGame('나팀')];
    const sync = createSheetSync(URL, () => games, replayOf, () => {});
    sync.setEnabled(true);
    await vi.waitFor(() => expect(sync.busy()).toBe(false));
    await sync.syncNow();
    expect(book.rows('games').length).toBe(3);
    expect(Object.keys(sync.state().synced)).toHaveLength(2);
    expect(sync.state().lastError).toBeNull();

    games = [addPitch(games[0], 'ball'), games[1]];
    expect(pendingSync(games, sync.state().synced).changed).toHaveLength(1);
    await sync.syncNow();
    expect(pendingSync(games, sync.state().synced).changed).toHaveLength(0);
    expect(book.rows('pitches').length).toBe(1 + 4 + 3);
  });

  it('인터넷이 안 되면 까닭을 남기고, 다음에 다시 보낸다', async () => {
    const games = [sampleGame()];
    const sync = createSheetSync(URL, () => games, replayOf, () => {});
    online = false;
    sync.setEnabled(true);
    await vi.waitFor(() => expect(sync.state().lastError).toBe('인터넷에 연결되지 않았어요'));
    online = true;
    await sync.syncNow();
    expect(sync.state().lastError).toBeNull();
    expect(book.rows('games').length).toBe(2);
  });

  it('기록이 바뀌면 잠시 뒤 한 번만 보낸다', async () => {
    vi.useFakeTimers();
    const games = [sampleGame()];
    const sync = createSheetSync(URL, () => games, replayOf, () => {});
    store.set('baseball-counter.sheet-sync', JSON.stringify({ ...sync.state(), enabled: true }));
    const enabled = createSheetSync(URL, () => games, replayOf, () => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    enabled.schedule();
    enabled.schedule();
    expect(fetchSpy).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('보낸 기록 지우기: 시트에서 이 휴대폰 줄을 지우고 끈다', async () => {
    const games = [sampleGame()];
    const sync = createSheetSync(URL, () => games, replayOf, () => {});
    sync.setEnabled(true);
    await vi.waitFor(() => expect(book.rows('games').length).toBe(2));
    await sync.deleteMine();
    expect(book.rows('games').length).toBe(1);
    expect(sync.state().enabled).toBe(false);
    expect(sync.state().synced).toEqual({});
  });

  it('휴대폰 구분 값은 다시 열어도 그대로', () => {
    const first = createSheetSync(URL, () => [], replayOf, () => {});
    first.setEnabled(false);
    const again = createSheetSync(URL, () => [], replayOf, () => {});
    expect(again.state().deviceId).toBe(first.state().deviceId);
    expect(again.state().deviceId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
