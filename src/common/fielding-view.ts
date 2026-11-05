// 수비 중인 우리 아이의 기록(잡아서 아웃 · 던져서 아웃 도움 · 실책)을 고르는 화면 조각

import { h } from './dom';
import { BaseIndex, FIELDING_CREDITS, FieldingCredit } from './events';
import { FIELDING_CREDIT_HINT, FIELDING_CREDIT_LABEL, PLAY_FIELDING_LABEL, RUNNER_BUTTONS, RunnerAction } from './labels';
import { popup } from './popup';

/** 아이가 수비 기록을 받을 수 있는 주자 상황 (견제 아웃·도루 실패는 잡거나 던져서, 실책 진루는 실책) */
export const FIELDING_PLAYS: readonly RunnerAction[] = ['pickoffOut', 'caughtStealing', 'error', 'runnerOut', 'outAtHome'];

/** 여러 개를 함께 고를 수 있다. (예: 병살에서 2루 베이스를 밟고(자살) 1루로 던짐(보살)) */
export function fieldingChips(selected: readonly FieldingCredit[], onChange: (fielding: readonly FieldingCredit[]) => void): HTMLElement {
  const toggle = (credit: FieldingCredit): void =>
    onChange(selected.includes(credit) ? selected.filter((c) => c !== credit) : FIELDING_CREDITS.filter((c) => c === credit || selected.includes(c)));
  return h('div', { className: 'fielding-pick' }, [
    h('p', { className: 'fielding-title' }, ['우리 아이 수비', h('small', { text: ' · 아이가 공을 만졌을 때만 (여러 개 가능)' })]),
    h(
      'div',
      { className: 'fielding-row', attrs: { role: 'group', 'aria-label': '우리 아이 수비' } },
      FIELDING_CREDITS.map((credit) =>
        h(
          'button',
          {
            className: `credit-${credit}${selected.includes(credit) ? ' active' : ''}`,
            attrs: { 'aria-pressed': selected.includes(credit) ? 'true' : 'false' },
            onClick: () => toggle(credit),
          },
          [h('strong', { text: FIELDING_CREDIT_LABEL[credit] }), h('small', { text: FIELDING_CREDIT_HINT[credit] })],
        ),
      ),
    ),
  ]);
}

/** 수비 중 주자 상황을 기록하기 전, 아이가 관여했는지 고르는 중 */
export interface PlayFieldingDraft {
  readonly action: RunnerAction;
  readonly base?: BaseIndex;
  readonly fielding: readonly FieldingCredit[];
}

export interface PlayFieldingActions {
  change: (draft: PlayFieldingDraft) => void;
  save: (draft: PlayFieldingDraft) => void;
  cancel: () => void;
}

export function playFieldingPopup(draft: PlayFieldingDraft, actions: PlayFieldingActions): HTMLElement {
  const label = RUNNER_BUTTONS.find((b) => b.action === draft.action)?.label ?? '';
  return popup('play-fielding', `${label} · 우리 아이 수비`, actions.cancel, [
    h('div', { className: 'sheet-head' }, [
      h('p', { className: 'section-title', text: label }),
      h('button', { className: 'link-button', text: '← 돌아가기', attrs: { 'aria-label': '돌아가기 (기록하지 않음)' }, onClick: actions.cancel }),
    ]),
    fieldingChips(draft.fielding, (fielding) => actions.change({ ...draft, fielding })),
    h('div', { className: 'confirm-buttons sheet-buttons' }, [
      h('button', { className: 'secondary', text: PLAY_FIELDING_LABEL.none, onClick: () => actions.save({ ...draft, fielding: [] }) }),
      h('button', { className: 'primary', text: PLAY_FIELDING_LABEL.save, onClick: () => actions.save(draft) }),
    ]),
  ]);
}
