// 설정 → 기록 함께 모으기. 다른 집 아이 기록을 받게 되므로 무엇을 보내는지 먼저 알리고, 동의해야 켠다.

import { lastBackupText } from './data-section';
import { h } from './dom';
import { SHEET_SYNC_LABEL } from './labels';
import { SheetSyncState } from './sheet-sync-client';

export interface SheetSyncActions {
  setEnabled: (on: boolean) => void;
  syncNow: () => void;
  deleteMine: () => void;
}

export interface SheetSyncStatus {
  readonly state: SheetSyncState;
  readonly busy: boolean;
  /** 아직 보내지 않은 경기 수 */
  readonly pending: number;
}

const WHAT_IS_SENT =
  '보내는 것: 이 휴대폰의 모든 경기 기록(날짜 · 상대팀 · 장소 · 우리 팀 이름 · 공 하나하나와 주자 상황 · 점수). 아이 이름은 앱에 적지 않으므로 보내지 않습니다.';

function statusText(status: SheetSyncStatus): string {
  if (status.busy) return '보내는 중…';
  if (status.state.lastError) return `보내지 못했어요: ${status.state.lastError}. 인터넷이 되면 다시 보냅니다.`;
  const last = status.state.lastSyncAt === null ? '아직 보낸 적이 없어요' : lastBackupText(status.state.lastSyncAt).replace('마지막 백업', '마지막으로 보낸 때');
  return status.pending > 0 ? `${last} · 보낼 경기 ${status.pending}개` : `${last} · 모두 보냈어요`;
}

/** "보낸 기록 지우기"는 한 번 더 물어본다. (앱 만든 사람의 시트에서 지우는 일이라 되돌릴 수 없다) */
function removeButton(status: SheetSyncStatus, actions: SheetSyncActions): HTMLElement {
  const box = h('div', { className: 'sheet-sync-remove' });
  const ask = (): void => {
    box.replaceChildren(
      h('p', { className: 'help', text: '앱 만든 사람의 시트에서 이 휴대폰이 보낸 기록을 모두 지우고, 함께 모으기를 끕니다. 휴대폰 안의 기록은 그대로입니다.' }),
      h('button', { className: 'secondary danger', text: SHEET_SYNC_LABEL.confirmRemove, onClick: actions.deleteMine }),
      h('button', { className: 'secondary', text: '취소', onClick: reset }),
    );
  };
  const reset = (): void => {
    box.replaceChildren(h('button', { className: 'secondary', text: SHEET_SYNC_LABEL.remove, disabled: status.busy, onClick: ask }));
  };
  reset();
  return box;
}

export function sheetSyncSection(status: SheetSyncStatus, actions: SheetSyncActions): HTMLElement {
  const { enabled } = status.state;
  return h('div', { className: 'settings-item sheet-sync' }, [
    h('h3', { text: SHEET_SYNC_LABEL.title }),
    h('p', {
      className: 'help',
      text: '켜 두면 기록이 바뀔 때마다 앱 만든 사람의 구글 시트로 기록을 보냅니다. 여러 집의 기록을 모아 앱을 더 낫게 만드는 데 씁니다. 켜지 않아도 앱은 그대로 쓸 수 있어요.',
    }),
    h('p', { className: 'help', text: WHAT_IS_SENT }),
    enabled
      ? h('p', { className: 'help sheet-sync-status', text: statusText(status) })
      : h('p', { className: 'help', text: '"동의하고 켜기"를 누르면 위 내용을 보내는 데 동의한 것으로 봅니다. 언제든 끄거나 보낸 기록을 지울 수 있어요.' }),
    enabled
      ? h('div', { className: 'sheet-sync-buttons' }, [
          h('button', { className: 'secondary', text: SHEET_SYNC_LABEL.now, disabled: status.busy || status.pending === 0, onClick: actions.syncNow }),
          h('button', { className: 'secondary', text: SHEET_SYNC_LABEL.disable, onClick: () => actions.setEnabled(false) }),
        ])
      : h('button', { className: 'secondary', text: SHEET_SYNC_LABEL.enable, onClick: () => actions.setEnabled(true) }),
    status.state.lastSyncAt !== null || enabled ? removeButton(status, actions) : null,
  ]);
}
