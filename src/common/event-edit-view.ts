// 경기 결과의 이닝별 기록에서 지난 기록 하나를 고치거나 지우는 창.
// 고쳐도 원래 기록은 남고 고침·취소 기록이 덧붙는다. 뒤 기록의 카운트·주자·점수는 다시 계산된다.

import { h } from './dom';
import { HitType, PITCH_TYPES, PitchEvent, PitchResult, UndoableEvent } from './events';
import { isInZone } from './field';
import { zoneSvg } from './field-view';
import { PitchDetail, pitchDetailToggle } from './pitch-detail-view';
import { Hand } from './settings';
import { speedDial } from './speed-dial';
import { EDIT_EVENT_LABEL, HIT_BUTTONS, PITCH_LABEL, PITCH_TYPE_LABEL, eventLabel } from './labels';
import { popup } from './popup';

export interface EventEditActions {
  close: () => void;
  saveResult: (targetId: string, result: PitchResult, hitType?: HitType) => void;
  remove: (targetId: string) => void;
  /** 기록 입력의 "투구 상세" 켜고 끄기와 같은 설정 */
  toggleDetail: () => void;
  changeDetail: (detail: PitchDetail) => void;
  /** 다이얼은 돌릴 때마다 다시 그리면 멈추므로 값만 담는다. */
  changeSpeed: (speed: number | null) => void;
  saveDetail: (targetId: string, detail: PitchDetail) => void;
}

/** 고치기 창의 투구 상세 부분: 켜져 있으면 구종·존·구속을 고친다. */
export interface EditDetailOptions {
  readonly detailMode: boolean;
  readonly hand: Hand;
  /** 고르고 있는 투구 상세 (공을 열 때 원래 값으로 채운다) */
  readonly detail: PitchDetail;
}

function detailEditor(event: PitchEvent, options: EditDetailOptions, actions: EventEditActions): HTMLElement {
  const { detail, hand } = options;
  // 다이얼 값은 다시 그리지 않고 담기만 하므로, 다른 값을 고르거나 저장할 때 최신 구속을 함께 넘긴다.
  let speed = detail.speed;
  const latest = (change: Partial<PitchDetail> = {}): PitchDetail => ({ ...detail, speed, ...change });
  const set = (change: Partial<PitchDetail>): void => actions.changeDetail(latest(change));
  return h('div', { className: 'edit-detail' }, [
    h(
      'div',
      { className: 'pitch-type-row' },
      PITCH_TYPES.map((t) =>
        h('button', { className: detail.pitchType === t ? 'active' : '', text: PITCH_TYPE_LABEL[t], onClick: () => set({ pitchType: detail.pitchType === t ? null : t }) }),
      ),
    ),
    h('div', { className: 'sheet-body' }, [
      h('div', { className: 'sheet-zone' }, [
        h('div', { className: 'zone-pick' }, [
          zoneSvg({ picked: detail.zone, onPick: (x, y) => set({ zone: { x, y } }), label: '스트라이크 존 (포수 쪽에서 본 모습). 공이 지나간 곳을 누르세요', batters: { highlight: null } }),
        ]),
        h('p', { className: 'zone-caption' }, [
          detail.zone ? (isInZone(detail.zone) ? '존 안' : '존 밖') : '공이 지나간 곳을 누르세요',
          detail.zone ? h('button', { className: 'link-button', text: '지우기', onClick: () => set({ zone: null }) }) : null,
        ]),
      ]),
      speedDial(detail.speed, hand, (value) => {
        speed = value;
        actions.changeSpeed(value);
      }),
    ]),
    h('button', { className: 'primary', text: EDIT_EVENT_LABEL.saveDetail, onClick: () => actions.saveDetail(event.id, latest()) }),
  ]);
}

/** 공 결과로 고를 수 있는 것 (안타는 종류별로) */
const RESULT_CHOICES: readonly { result: PitchResult; hitType?: HitType; label: string }[] = [
  { result: 'ball', label: PITCH_LABEL.ball },
  { result: 'strike', label: PITCH_LABEL.strike },
  { result: 'foul', label: PITCH_LABEL.foul },
  { result: 'buntFoul', label: PITCH_LABEL.buntFoul },
  { result: 'wildPitch', label: PITCH_LABEL.wildPitch },
  { result: 'passedBall', label: PITCH_LABEL.passedBall },
  { result: 'hitByPitch', label: PITCH_LABEL.hitByPitch },
  ...HIT_BUTTONS.map((b) => ({ result: 'hit' as const, hitType: b.hitType, label: b.label })),
  { result: 'out', label: PITCH_LABEL.out },
  { result: 'reachedOnError', label: PITCH_LABEL.reachedOnError },
];

export function eventEditPopup(event: UndoableEvent, options: EditDetailOptions, actions: EventEditActions): HTMLElement {
  const isPitch = event.kind === 'pitch';
  const current = (c: (typeof RESULT_CHOICES)[number]): boolean =>
    isPitch && event.result === c.result && (c.result !== 'hit' || (event.hitType ?? 'single') === c.hitType);
  return popup('edit-popup', EDIT_EVENT_LABEL.title, actions.close, [
    h('div', { className: 'sheet-head' }, [
      h('p', { className: 'section-title', text: `${EDIT_EVENT_LABEL.title}: ${eventLabel(event)}` }),
      h('button', { className: 'link-button', text: '← 돌아가기', onClick: actions.close }),
    ]),
    isPitch
      ? h(
          'div',
          { className: 'edit-results', attrs: { role: 'group', 'aria-label': '이 공의 결과' } },
          RESULT_CHOICES.map((c) =>
            h('button', {
              className: current(c) ? 'active' : '',
              text: c.label,
              disabled: current(c),
              onClick: () => actions.saveResult(event.id, c.result, c.hitType),
            }),
          ),
        )
      : null,
    isPitch ? pitchDetailToggle(options.detailMode, actions.toggleDetail) : null,
    isPitch && options.detailMode ? detailEditor(event, options, actions) : null,
    h('p', {
      className: 'help',
      text: `${isPitch ? '다른 결과를 누르면 바로 고쳐져요. ' : ''}뒤 기록의 카운트·주자·점수는 다시 계산돼요. 기록 입력에서 그대로 이어서 기록하면 돼요. 원래 기록은 이력으로 남아요.`,
    }),
    h('div', { className: 'confirm-buttons sheet-buttons' }, [
      h('button', { className: 'secondary danger', text: EDIT_EVENT_LABEL.remove, onClick: () => actions.remove(event.id) }),
      h('button', { className: 'secondary', text: '닫기', onClick: actions.close }),
    ]),
  ]);
}
