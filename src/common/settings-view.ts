// 설정 화면: 이 휴대폰에서 쓰는 편의 설정

import { DataActions, dataSection } from './data-section';
import { h } from './dom';
import { BATTER_HANDS, BatterHand, TEAM_NAME_MAX_LENGTH } from './events';
import { DEFAULT_TEAM_NAME } from './game';
import { APP_NAME, BATTER_HAND_LABEL, HAND_LABEL, ORIENTATION_LABEL, PITCH_DETAIL_LABEL } from './labels';
import { SheetSyncActions, SheetSyncStatus, sheetSyncSection } from './sheet-sync-section';
import { APP_VERSION } from './version';
import { Hand, OrientationMode } from './settings';

export interface SettingsActions extends DataActions {
  hand: (hand: Hand) => void;
  orientation: (mode: OrientationMode) => void;
  childBatterHand: (hand: BatterHand | null) => void;
  teamName: (name: string) => void;
}

const HANDS: readonly Hand[] = ['right', 'left'];

/** 기록 함께 모으기: 보낼 시트 주소가 빌드에 들어 있을 때만 보인다. */
export interface SheetSyncView {
  readonly status: SheetSyncStatus;
  readonly actions: SheetSyncActions;
}

export function settingsView(
  hand: Hand,
  orientation: OrientationMode,
  childHand: BatterHand | null,
  teamName: string,
  hasGames: boolean,
  lastBackupAt: string | null,
  actions: SettingsActions,
  sheetSync: SheetSyncView | null,
): HTMLElement {
  const teamInput = h('input', {
    attrs: {
      id: 'team-name',
      type: 'text',
      value: teamName,
      placeholder: `예: ○○초 (비우면 "${DEFAULT_TEAM_NAME}")`,
      autocomplete: 'off',
      enterkeyhint: 'done',
      maxlength: String(TEAM_NAME_MAX_LENGTH),
    },
  });
  teamInput.addEventListener('input', () => actions.teamName(teamInput.value.trim()));
  return h('section', { className: 'settings' }, [
    h('h2', { text: '설정' }),
    h('div', { className: 'settings-item' }, [
      h('h3', {}, [h('label', { text: '우리 팀 이름', attrs: { for: 'team-name' } })]),
      h('p', { className: 'help', text: '새 경기를 만들 때 자동으로 들어가고, 스코어보드와 경기 목록에 보여요. 이미 만든 경기는 "정보 고치기"에서 바꿉니다.' }),
      teamInput,
    ]),
    h('div', { className: 'settings-item' }, [
      h('h3', { text: '우리 아이 타석' }),
      h('p', { className: 'help', text: '아이가 칠 때 투구 상세 창의 존 그림에 아이가 서는 쪽을 표시해요. 한 번 정하면 매번 고르지 않아도 돼요.' }),
      h(
        'div',
        { className: 'hand-picker three' },
        ([...BATTER_HANDS, null] as const).map((option) =>
          h('button', {
            className: option === childHand ? 'active' : '',
            text: option ? `${BATTER_HAND_LABEL[option]} (${option === 'right' ? '오른쪽 타석' : '왼쪽 타석'})` : '안 정함',
            attrs: { 'aria-pressed': option === childHand ? 'true' : 'false' },
            onClick: () => actions.childBatterHand(option),
          }),
        ),
      ),
    ]),
    h('div', { className: 'settings-item' }, [
      h('h3', { text: '휴대폰을 드는 손' }),
      h('p', { className: 'help', text: `자주 누르는 "${PITCH_DETAIL_LABEL}" 켜고 끄기 단추, 존 그림, 기록 단추를 엄지가 닿는 쪽에 둡니다.` }),
      h(
        'div',
        { className: 'hand-picker' },
        HANDS.map((option) =>
          h('button', {
            className: option === hand ? 'active' : '',
            text: HAND_LABEL[option],
            attrs: { 'aria-pressed': option === hand ? 'true' : 'false' },
            onClick: () => actions.hand(option),
          }),
        ),
      ),
    ]),
    h('div', { className: 'settings-item' }, [
      h('h3', { text: '화면 방향' }),
      h('p', {
        className: 'help',
        text: '중계 화면을 보면서 기록하려면 "돌려서 쓰기"를 고르세요. 가로로 돌리면 왼쪽 상황판에 이번 타석 공과 스코어보드가 더 나오고, 화면 분할(두 앱 같이 보기)에서는 상황판이 작아집니다.',
      }),
      h(
        'div',
        { className: 'hand-picker' },
        (['portrait', 'any'] as const).map((option) =>
          h('button', {
            className: option === orientation ? 'active' : '',
            text: ORIENTATION_LABEL[option],
            attrs: { 'aria-pressed': option === orientation ? 'true' : 'false' },
            onClick: () => actions.orientation(option),
          }),
        ),
      ),
      h('p', { className: 'help', text: '세로 고정은 홈 화면에 설치한 앱(안드로이드)에서 됩니다. 브라우저나 아이폰에서는 휴대폰의 "화면 자동 회전" 설정을 따릅니다.' }),
    ]),
    h('p', { className: 'help', text: '팀 이름 · 아이 타석 · 화면 방향 · 손 설정은 이 휴대폰에만 저장됩니다. 기록에는 영향이 없습니다.' }),
    dataSection(hasGames, lastBackupAt, actions),
    sheetSync ? sheetSyncSection(sheetSync.status, sheetSync.actions) : null,
    h('p', { className: 'app-version', text: `${APP_NAME} ${APP_VERSION}` }),
  ]);
}
