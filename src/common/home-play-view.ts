// 와일드피치·포일 때 3루 주자가 홈으로 뛰었는지 묻는 창. 홈인이면 1점, 홈에서 아웃이면 점수 없이 아웃 하나.

import { h } from './dom';
import { FieldingCredit, PitchResult } from './events';
import { fieldingChips } from './fielding-view';
import { HOME_PLAY_LABEL, PITCH_LABEL } from './labels';
import { PitchDetail } from './pitch-detail-view';
import { popup } from './popup';

/** 3루 주자가 있을 때 와일드피치·포일을 누른 뒤, 기록하기 전 */
export interface HomePlayDraft {
  readonly result: PitchResult;
  readonly pitch: PitchDetail;
  /** 아이가 수비 중일 때만 고른다(홈 아웃일 때 붙는다). 공격 중이면 null */
  readonly fielding: readonly FieldingCredit[] | null;
}

export interface HomePlayActions {
  change: (draft: HomePlayDraft) => void;
  scored: (draft: HomePlayDraft) => void;
  out: (draft: HomePlayDraft) => void;
  cancel: () => void;
}

export function homePlayPopup(draft: HomePlayDraft, actions: HomePlayActions): HTMLElement {
  const title = `${PITCH_LABEL[draft.result]} · ${HOME_PLAY_LABEL.question}`;
  return popup('home-play', title, actions.cancel, [
    h('div', { className: 'sheet-head' }, [
      h('p', { className: 'section-title', text: title }),
      h('button', { className: 'link-button', text: '← 돌아가기', attrs: { 'aria-label': '돌아가기 (기록하지 않음)' }, onClick: actions.cancel }),
    ]),
    h('p', { className: 'help', text: '공이 빠진 사이 3루 주자가 홈으로 뛰었나요? 다른 주자는 어느 쪽이든 한 칸씩 갑니다.' }),
    draft.fielding !== null
      ? fieldingChips(draft.fielding, (fielding) => actions.change({ ...draft, fielding }))
      : null,
    draft.fielding !== null ? h('p', { className: 'help', text: '우리 아이 수비는 홈에서 아웃일 때만 함께 기록합니다.' }) : null,
    h('div', { className: 'confirm-buttons sheet-buttons' }, [
      h('button', { className: 'secondary', text: HOME_PLAY_LABEL.scored, onClick: () => actions.scored(draft) }),
      h('button', { className: 'primary', text: HOME_PLAY_LABEL.out, onClick: () => actions.out(draft) }),
    ]),
  ]);
}
