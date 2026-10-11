// 백업 알림 띠: 백업 안 한 경기가 있으면 백업할 때까지 기록 입력 밖의 화면 위에 보여준다. "무시하기"를 누르면 새 기록이 생길 때까지 숨긴다.
// (기록 입력 화면은 한 화면에 들어가야 하므로 띠 대신 아래 "경기" 탭에 숫자만 붙인다. CLAUDE.md 0.4)

import { DataActions, lastBackupText } from './data-section';
import { h } from './dom';
import { BACKUP_DISMISS_LABEL, BACKUP_NOW_LABEL } from './labels';

/** 이만큼 백업 안 한 경기가 생기면 알린다 */
export const BACKUP_REMINDER_MIN_GAMES = 1;

/** 한 줄 띠: 왼쪽에 백업 안 한 경기 수, 오른쪽에 "무시하기" · "지금 백업하기". 화면을 적게 차지하게 설명은 도움말에 둔다. */
export function backupBanner(unbacked: number, lastBackupAt: string | null, actions: DataActions, onDismiss: () => void): HTMLElement {
  return h('section', { className: 'backup-banner', attrs: { role: 'status', 'aria-label': `백업 안 한 경기 ${unbacked}개, ${lastBackupText(lastBackupAt)}` } }, [
    h('p', {}, [h('strong', { text: `백업 안 한 경기 ${unbacked}개` }), h('small', { text: ' · 휴대폰에만 있어요' })]),
    h('button', { className: 'secondary backup-now compact', text: BACKUP_DISMISS_LABEL, onClick: onDismiss }),
    h('button', { className: 'primary backup-now compact', text: BACKUP_NOW_LABEL, onClick: actions.backupNow }),
  ]);
}
