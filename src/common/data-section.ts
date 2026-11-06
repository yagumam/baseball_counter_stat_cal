// 데이터 관리(내려받기·불러오기) 화면 조각. 설정 탭에서 쓴다.

import { h } from './dom';
import { dateLabel } from './game';
import { ANALYSIS_DOWNLOAD_LABEL, BACKUP_NOW_LABEL, DOWNLOAD_LABEL, IMPORT_LABEL } from './labels';

export type DownloadKind = 'backup' | 'pitches' | 'analysisPitches' | 'analysisGames' | 'codebook';

export interface DataActions {
  download: (kind: DownloadKind) => void;
  importBackup: (file: File) => void;
  /** 공유 창으로 백업 파일 보내기 (안 되면 내려받기) */
  backupNow: () => void;
}

/** 백업 알림 띠와 데이터 관리에 함께 쓰는 "마지막 백업" 문구 */
export function lastBackupText(lastBackupAt: string | null): string {
  if (lastBackupAt === null) return '아직 백업한 적이 없어요';
  const d = new Date(lastBackupAt);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `마지막 백업: ${dateLabel(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 한 번 눌러 백업하는 단추 */
export function backupNowButton(actions: DataActions, className = 'primary'): HTMLElement {
  return h('button', { className: `${className} backup-now`, onClick: actions.backupNow }, [
    h('strong', { text: BACKUP_NOW_LABEL }),
    h('small', { text: '카카오톡 나에게 보내기 · 구글 드라이브 등으로 저장' }),
  ]);
}

/** 숨긴 파일 선택 칸을 버튼으로 연다. */
function importButton(actions: DataActions): HTMLElement {
  const input = h('input', { className: 'visually-hidden', attrs: { type: 'file', accept: '.json,.txt,application/json,text/plain', tabindex: '-1', 'aria-hidden': 'true' } });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) actions.importBackup(file);
    input.value = '';
  });
  return h('div', {}, [
    input,
    h('button', { className: 'secondary', onClick: () => input.click() }, [
      h('strong', { text: IMPORT_LABEL }),
      h('small', { text: '지금 기록은 지우지 않고 합칩니다' }),
    ]),
  ]);
}

export function dataSection(hasGames: boolean, lastBackupAt: string | null, actions: DataActions): HTMLElement {
  return h('div', { className: 'settings-item data-section' }, [
    h('h3', { text: '데이터 관리' }),
    h('p', { className: 'help last-backup', text: lastBackupText(lastBackupAt) }),
    hasGames ? backupNowButton(actions) : null,
    h('h4', { text: '데이터 내려받기' }),
    hasGames
      ? h('p', { className: 'help', text: '모든 경기 기록을 파일로 저장합니다. 휴대폰을 바꾸거나 브라우저 데이터를 지우기 전에 백업해 두세요.' })
      : h('p', { className: 'help', text: '아직 기록한 경기가 없어 내려받을 게 없습니다.' }),
    h('button', { className: 'secondary', disabled: !hasGames, onClick: () => actions.download('backup') }, [
      h('strong', { text: DOWNLOAD_LABEL.json }),
      h('small', { text: '모든 기록을 그대로 저장 (보관·옮기기용)' }),
    ]),
    h('button', { className: 'secondary', disabled: !hasGames, onClick: () => actions.download('pitches') }, [
      h('strong', { text: DOWNLOAD_LABEL.csv }),
      h('small', { text: '공 하나당 한 줄 · 엑셀·구글 시트에서 열기' }),
    ]),
    h('h4', { text: ANALYSIS_DOWNLOAD_LABEL.title }),
    h('p', {
      className: 'help',
      text: '통계 프로그램(R·Python·SPSS·SAS 등)으로 직접 분석하고 싶을 때 씁니다. 영어 열 이름과 영어 코드로 된 표입니다. 각 열과 코드의 뜻은 "변수 설명서"에 있습니다.',
    }),
    h('button', { className: 'secondary', disabled: !hasGames, onClick: () => actions.download('analysisPitches') }, [
      h('strong', { text: ANALYSIS_DOWNLOAD_LABEL.pitches }),
      h('small', { text: '공 하나당 한 줄 · 던지기 전 상황과 결과' }),
    ]),
    h('button', { className: 'secondary', disabled: !hasGames, onClick: () => actions.download('analysisGames') }, [
      h('strong', { text: ANALYSIS_DOWNLOAD_LABEL.games }),
      h('small', { text: '경기 하나당 한 줄 · 날짜·상대·점수' }),
    ]),
    h('button', { className: 'secondary', onClick: () => actions.download('codebook') }, [
      h('strong', { text: ANALYSIS_DOWNLOAD_LABEL.codebook }),
      h('small', { text: '열 이름·뜻·단위·코드 설명' }),
    ]),
    h('h4', { text: '백업 불러오기' }),
    h('p', { className: 'help', text: '내려받아 둔 백업 파일(JSON)에서 기록을 가져옵니다. 지금 기록은 지우지 않고, 이미 있는 경기는 늘어난 기록만 덧붙입니다.' }),
    importButton(actions),
  ]);
}
