// 기록 함께 모으기: 동의 여부·보낸 경기를 이 휴대폰에 기억하고, 기록이 바뀌면 잠시 뒤 시트로 보낸다.
// 보낼 내용은 sheet-sync.ts가 만든다.

import { Game, createId } from './game';
import { GameReplay } from './replay';
import { SyncPayload, SyncedSignatures, deleteAllPayload, gameSignature, pendingSync, syncBatches, syncPayload } from './sheet-sync';

/** 기록이 바뀐 뒤 보내기까지 기다리는 시간. 공을 연달아 기록할 때마다 보내지 않고 한 번에 보낸다. */
export const SYNC_DELAY_MS = 10_000;

export interface SheetSyncState {
  /** 이 휴대폰을 시트에서 구분하는 값. 처음 켤 때 만들고 바꾸지 않는다. */
  readonly deviceId: string;
  /** 동의하고 켰는지 */
  readonly enabled: boolean;
  readonly synced: SyncedSignatures;
  readonly lastSyncAt: string | null;
  /** 마지막으로 보내지 못한 까닭. 잘 보냈으면 null */
  readonly lastError: string | null;
}

const KEY = 'baseball-counter.sheet-sync';

function isState(value: unknown): value is SheetSyncState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.deviceId === 'string' &&
    typeof v.enabled === 'boolean' &&
    typeof v.synced === 'object' &&
    v.synced !== null &&
    Object.values(v.synced).every((s) => typeof s === 'string') &&
    (v.lastSyncAt === null || typeof v.lastSyncAt === 'string') &&
    (v.lastError === null || typeof v.lastError === 'string')
  );
}

export function loadSheetSync(): SheetSyncState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (isState(parsed)) return parsed;
  } catch {
    // 읽지 못하면 꺼진 처음 상태로 시작한다.
  }
  return { deviceId: createId(), enabled: false, synced: {}, lastSyncAt: null, lastError: null };
}

function saveSheetSync(state: SheetSyncState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 기억하지 못하면 다음에 다시 보낸다. 시트는 같은 경기 줄을 바꿔 넣으므로 겹치지 않는다.
  }
}

type PostResult = { ok: true } | { ok: false; error: string };

/** 단순 요청(text/plain)으로 보내 브라우저의 사전 확인(preflight) 없이 Apps Script에 닿게 한다. */
async function post(url: string, payload: SyncPayload): Promise<PostResult> {
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    if (!response.ok) return { ok: false, error: `시트가 응답하지 않았어요 (${response.status})` };
    const result = (await response.json()) as { ok?: boolean; error?: string };
    return result.ok === true ? { ok: true } : { ok: false, error: result.error ?? '시트가 받지 못했어요' };
  } catch {
    return { ok: false, error: '인터넷에 연결되지 않았어요' };
  }
}

export interface SheetSync {
  state: () => SheetSyncState;
  busy: () => boolean;
  /** 켜져 있으면 잠시 뒤 바뀐 경기를 보낸다. */
  schedule: () => void;
  /** 바로 보낸다. */
  syncNow: () => Promise<void>;
  setEnabled: (on: boolean) => void;
  /** 이 휴대폰에서 보낸 줄을 시트에서 모두 지우고 끈다. */
  deleteMine: () => Promise<void>;
}

export function createSheetSync(url: string, getGames: () => readonly Game[], replayOf: (g: Game) => GameReplay, onChange: () => void): SheetSync {
  let state = loadSheetSync();
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** 보내기·지우기가 겹치지 않게 차례로 한다. 진행 중인 일의 수 */
  let running = 0;
  let queue: Promise<void> = Promise.resolve();

  const inTurn = (task: () => Promise<void>): Promise<void> => {
    running += 1;
    onChange();
    queue = queue.then(task).finally(() => {
      running -= 1;
      onChange();
    });
    return queue;
  };

  const update = (next: SheetSyncState): void => {
    state = next;
    saveSheetSync(state);
    onChange();
  };

  const sendPending = async (): Promise<void> => {
    if (!state.enabled) return;
    const { changed, deletedIds } = pendingSync(getGames(), state.synced);
    for (const batch of syncBatches(changed, deletedIds)) {
      const result = await post(url, syncPayload(state.deviceId, batch.games, batch.deletedIds, replayOf));
      if (!result.ok) {
        update({ ...state, lastError: result.error });
        break;
      }
      const synced: Record<string, string> = { ...state.synced };
      for (const g of batch.games) synced[g.id] = gameSignature(g);
      for (const id of batch.deletedIds) delete synced[id];
      update({ ...state, synced, lastSyncAt: new Date().toISOString(), lastError: null });
    }
  };

  const syncNow = (): Promise<void> => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    return state.enabled ? inTurn(sendPending) : Promise.resolve();
  };

  const schedule = (): void => {
    if (!state.enabled) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), SYNC_DELAY_MS);
  };

  const deleteMine = (): Promise<void> => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    return inTurn(async () => {
      const result = await post(url, deleteAllPayload(state.deviceId));
      update(result.ok ? { ...state, enabled: false, synced: {}, lastError: null } : { ...state, lastError: result.error });
    });
  };

  return {
    state: () => state,
    busy: () => running > 0,
    schedule,
    syncNow,
    setEnabled: (on) => {
      update({ ...state, enabled: on });
      if (on) void syncNow();
    },
    deleteMine,
  };
}
