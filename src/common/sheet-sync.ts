// 기록 함께 모으기: 동의한 휴대폰의 분석용 표(pitches · plays · games)를 앱 만든 사람의 구글 시트로 보낸다.
// 시트 쪽은 apps-script/Code.gs가 받는다. 열은 분석용 CSV와 같다. (CLAUDE.md 5.4 "분석용 내려받기")
// 이 파일은 무엇을 보낼지만 정한다. 보내기·기억하기는 sheet-sync-client.ts가 한다.

import {
  ANALYSIS_FORMAT_VERSION,
  CellValue,
  Column,
  ColumnType,
  GAME_COLUMNS,
  PITCH_COLUMNS,
  PLAY_COLUMNS,
  columnValues,
  gameRowOf,
  pitchRowsOf,
  playRowsOf,
} from './analysis-export';
import { Game } from './game';
import { GameReplay } from './replay';

/** 시트가 이 앱에서 보낸 것인지 확인하는 이름 (apps-script/Code.gs의 APP_ID와 같아야 한다) */
export const SHEET_SYNC_APP_ID = 'yagumam';

/** 한 번에 보내는 경기 수. 요청 하나가 너무 커지지 않게 나눠 보낸다. (Code.gs의 MAX_GAMES_PER_REQUEST 이하) */
export const MAX_GAMES_PER_REQUEST = 10;

export type SheetTable = 'pitches' | 'plays' | 'games';

export const SHEET_TABLES: readonly SheetTable[] = ['pitches', 'plays', 'games'];

interface ColumnSpec {
  readonly name: string;
  readonly type: ColumnType;
}

export interface GameRows {
  readonly gameId: string;
  readonly rows: Record<SheetTable, CellValue[][]>;
}

export interface SyncPayload {
  readonly app: typeof SHEET_SYNC_APP_ID;
  readonly analysisFormatVersion: number;
  readonly deviceId: string;
  readonly tables: Record<SheetTable, { readonly columns: readonly ColumnSpec[] }>;
  readonly games: readonly GameRows[];
  readonly deletedGameIds: readonly string[];
  readonly deleteAll: boolean;
}

const specs = <R>(columns: readonly Column<R>[]): ColumnSpec[] => columns.map((c) => ({ name: c.name, type: c.type }));

const TABLE_SPECS: Record<SheetTable, { readonly columns: readonly ColumnSpec[] }> = {
  pitches: { columns: specs(PITCH_COLUMNS) },
  plays: { columns: specs(PLAY_COLUMNS) },
  games: { columns: specs(GAME_COLUMNS) },
};

/**
 * 경기가 바뀌었는지 알아보는 값. 기록은 덧붙이기만 하므로(CLAUDE.md 5.3)
 * 이벤트 수와 마지막 이벤트 id가 같으면 내용도 같다.
 */
export function gameSignature(game: Game): string {
  const last = game.events[game.events.length - 1];
  return `${game.events.length}:${last?.id ?? ''}`;
}

/** 경기 id → 마지막으로 보낸 때의 gameSignature */
export type SyncedSignatures = Readonly<Record<string, string>>;

/** 보내야 할 것: 처음 보거나 바뀐 경기, 보낸 뒤 이 휴대폰에서 지운 경기 */
export function pendingSync(games: readonly Game[], synced: SyncedSignatures): { changed: Game[]; deletedIds: string[] } {
  const ids = new Set(games.map((g) => g.id));
  return {
    changed: games.filter((g) => synced[g.id] !== gameSignature(g)),
    deletedIds: Object.keys(synced).filter((id) => !ids.has(id)),
  };
}

export function gameRows(game: Game, replay: GameReplay): GameRows {
  return {
    gameId: game.id,
    rows: {
      pitches: columnValues(PITCH_COLUMNS, pitchRowsOf(game, replay)),
      plays: columnValues(PLAY_COLUMNS, playRowsOf(game, replay)),
      games: columnValues(GAME_COLUMNS, [gameRowOf(game, replay)]),
    },
  };
}

/** 바뀐 경기와 지운 경기를 보낼 내용으로. 지운 경기는 줄 없이 id만 보내 시트에서 지우게 한다. */
export function syncPayload(deviceId: string, games: readonly Game[], deletedGameIds: readonly string[], replayOf: (g: Game) => GameReplay): SyncPayload {
  return {
    app: SHEET_SYNC_APP_ID,
    analysisFormatVersion: ANALYSIS_FORMAT_VERSION,
    deviceId,
    tables: TABLE_SPECS,
    games: games.map((g) => gameRows(g, replayOf(g))),
    deletedGameIds,
    deleteAll: false,
  };
}

/** 이 휴대폰에서 보낸 줄을 시트에서 모두 지우라는 내용 */
export function deleteAllPayload(deviceId: string): SyncPayload {
  return {
    app: SHEET_SYNC_APP_ID,
    analysisFormatVersion: ANALYSIS_FORMAT_VERSION,
    deviceId,
    tables: TABLE_SPECS,
    games: [],
    deletedGameIds: [],
    deleteAll: true,
  };
}

/** 보낼 경기를 요청 하나에 MAX_GAMES_PER_REQUEST개씩 나눈다. 지운 경기는 첫 묶음에 함께 보낸다. */
export function syncBatches(changed: readonly Game[], deletedIds: readonly string[]): { games: Game[]; deletedIds: string[] }[] {
  const batches: { games: Game[]; deletedIds: string[] }[] = [];
  for (let i = 0; i < changed.length; i += MAX_GAMES_PER_REQUEST) batches.push({ games: changed.slice(i, i + MAX_GAMES_PER_REQUEST), deletedIds: [] });
  if (deletedIds.length > 0) {
    if (batches.length === 0) batches.push({ games: [], deletedIds: [] });
    batches[0].deletedIds = [...deletedIds];
  }
  return batches;
}

/** Apps Script 웹 앱 주소만 받는다. (빌드할 때 넣은 값이 엉뚱한 곳을 가리키지 않게) */
export function validSyncUrl(raw: string | undefined): string | null {
  const url = raw?.trim() ?? '';
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url) ? url : null;
}
