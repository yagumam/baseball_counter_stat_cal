// 등장 설정: 우리 아이가 어떤 역할로, 어떤 상황(이닝·아웃·주자·카운트)에 나오는지 정하고 시작한다.
// 선발이면 기본값 그대로 "시작", 중계·대타·대주자면 그 장면을 맞춘다. (CLAUDE.md 0.5)

import { BASE_NAMES } from './bases';
import { MAX_BALLS_IN_COUNT, MAX_STRIKES_IN_COUNT, OUTS_PER_INNING } from './count';
import { diamond } from './diamond';
import { h } from './dom';
import { BaseIndex, Bases, ExitReason, MAX_INNING, POSITIONS, Position, ROLES, Role, Team } from './events';
import { halfForRole, halfInningLabel, nextInningFor } from './innings';
import { EXIT_REASON_LABEL, POSITION_LABEL, ROLE_LABEL, SCENE_END_BUTTON } from './labels';
import { GameReplay } from './replay';

export interface SceneDraft {
  readonly role: Role;
  readonly inning: number;
  readonly outs: number;
  readonly bases: Bases;
  readonly balls: number;
  readonly strikes: number;
  readonly childBase: BaseIndex | null;
  readonly position: Position | null;
}

export interface SceneSetupActions {
  change: (draft: SceneDraft) => void;
  changeRole: (role: Role) => void;
  start: (draft: SceneDraft) => void;
  cancel: (() => void) | null;
  /** 장면 끝내기. 까닭이 있으면 교체(대주자·대타·투수 교체·수비 교체)로 남긴다. */
  exit: ((reason?: ExitReason) => void) | null;
  /** 지금 역할에서 고를 수 있는 교체 까닭. 진행 중인 장면이 없으면 null */
  replaceReason: ExitReason | null;
  /** 경기 기록 마치기 (기록이 하나라도 있을 때) */
  endGame: (() => void) | null;
}

const ROLE_HINT: Record<Role, string> = {
  pitcher: '공을 던짐',
  batter: '타석 · 대타',
  runner: '베이스 · 대주자',
  fielder: '투수 외 수비',
};

const EMPTY: Bases = [false, false, false];

/** 다음 장면의 기본 역할: 방금 던졌으면 타자, 방금 쳤으면 (던진 적이 있으면) 투수 */
export function defaultRole(replay: GameReplay): Role {
  const last = replay.state?.role ?? replay.scenes[replay.scenes.length - 1]?.role;
  if (!last) return 'pitcher';
  if (last === 'pitcher') return 'batter';
  return replay.scenes.some((s) => s.role === 'pitcher') ? 'pitcher' : 'batter';
}

/**
 * 역할에 맞는 기본 상황. 지금 장면과 같은 쪽(초/말)이면 그 상황을 이어받고,
 * 아니면 마지막으로 기록한 타석 다음에 오는 그쪽 이닝의 처음.
 * (투수 장면은 3아웃이면 다음 이닝으로 넘어가 있으므로, 지금 상황이 아니라 마지막 기록을 기준으로 한다.)
 */
export function defaultSceneDraft(replay: GameReplay, role: Role): SceneDraft {
  const half = halfForRole(role, replay.battingFirst);
  const state = replay.state;
  const lastScene = replay.scenes[replay.scenes.length - 1];
  const base: SceneDraft = {
    role,
    inning: 1,
    outs: 0,
    bases: EMPTY,
    balls: 0,
    strikes: 0,
    childBase: role === 'runner' ? 0 : null,
    position: null,
  };
  if (state && state.half === half) {
    return { ...base, inning: state.inning, outs: state.outs, bases: state.bases };
  }
  const lastPa = replay.plateAppearances[replay.plateAppearances.length - 1];
  const from = lastPa ?? state ?? lastScene;
  if (!from) return base;
  return { ...base, inning: nextInningFor(half, { inning: from.inning, half: from.half }) };
}

function stepper(label: string, value: string, onMinus: (() => void) | null, onPlus: (() => void) | null): HTMLElement {
  return h('div', { className: 'stepper' }, [
    h('span', { text: label }),
    h('button', { text: '−', disabled: !onMinus, onClick: () => onMinus?.(), attrs: { 'aria-label': `${label} 줄이기` } }),
    h('strong', { text: value }),
    h('button', { text: '+', disabled: !onPlus, onClick: () => onPlus?.(), attrs: { 'aria-label': `${label} 늘리기` } }),
  ]);
}

export function sceneSetupView(
  draft: SceneDraft,
  battingFirst: Team,
  actions: SceneSetupActions,
  current: string | null,
): HTMLElement {
  const set = (change: Partial<SceneDraft>): void => actions.change({ ...draft, ...change });
  const half = halfForRole(draft.role, battingFirst);
  const toggleBase = (b: BaseIndex): void => {
    const bases: [boolean, boolean, boolean] = [draft.bases[0], draft.bases[1], draft.bases[2]];
    bases[b] = !bases[b];
    // 아이가 있는 베이스는 비울 수 없다.
    if (draft.childBase === b) bases[b] = true;
    set({ bases });
  };
  const chooseChildBase = (b: BaseIndex): void => {
    const bases: [boolean, boolean, boolean] = [draft.bases[0], draft.bases[1], draft.bases[2]];
    bases[b] = true;
    set({ childBase: b, bases });
  };
  const needsCount = draft.role === 'pitcher' || draft.role === 'batter';
  const missingPosition = draft.role === 'fielder' && draft.position === null;
  const bases: Bases =
    draft.childBase === null
      ? draft.bases
      : (draft.bases.map((on, i) => on || i === draft.childBase) as unknown as Bases);

  return h('section', { className: 'scene-setup' }, [
    h('p', { className: 'section-title', text: current ? `지금: ${current}` : '아이가 어떻게 나오나요?' }),
    h(
      'div',
      { className: 'role-picker' },
      ROLES.map((role) =>
        h('button', { className: role === draft.role ? 'active' : '', onClick: () => actions.changeRole(role) }, [
          h('strong', { text: ROLE_LABEL[role] }),
          h('small', { text: ROLE_HINT[role] }),
        ]),
      ),
    ),
    draft.role === 'fielder'
      ? h(
          'div',
          { className: 'position-picker' },
          POSITIONS.map((p) =>
            h('button', { className: p === draft.position ? 'active' : '', text: POSITION_LABEL[p], onClick: () => set({ position: p }) }),
          ),
        )
      : null,
    h('div', { className: 'editor-grid' }, [
      h('div', { className: 'editor-fields' }, [
        stepper(
          '이닝',
          halfInningLabel(draft.inning, half),
          draft.inning > 1 ? () => set({ inning: draft.inning - 1 }) : null,
          draft.inning < MAX_INNING ? () => set({ inning: draft.inning + 1 }) : null,
        ),
        h('div', { className: 'outs-picker' }, [
          h('span', { text: '아웃' }),
          ...Array.from({ length: OUTS_PER_INNING }, (_, n) =>
            h('button', { className: draft.outs === n ? 'active' : '', text: `${n}`, onClick: () => set({ outs: n }) }),
          ),
        ]),
        needsCount
          ? stepper(
              '볼',
              `${draft.balls}`,
              draft.balls > 0 ? () => set({ balls: draft.balls - 1 }) : null,
              draft.balls < MAX_BALLS_IN_COUNT ? () => set({ balls: draft.balls + 1 }) : null,
            )
          : null,
        needsCount
          ? stepper(
              '스트라이크',
              `${draft.strikes}`,
              draft.strikes > 0 ? () => set({ strikes: draft.strikes - 1 }) : null,
              draft.strikes < MAX_STRIKES_IN_COUNT ? () => set({ strikes: draft.strikes + 1 }) : null,
            )
          : null,
      ]),
      h('div', { className: 'diamond-field' }, [diamond(bases, toggleBase, draft.childBase), h('small', { text: '눌러서 주자 넣기·빼기' })]),
    ]),
    draft.role === 'runner'
      ? h('div', { className: 'child-base-picker' }, [
          h('span', { text: '아이가 있는 베이스' }),
          ...([0, 1, 2] as const).map((b) =>
            h('button', { className: draft.childBase === b ? 'active' : '', text: BASE_NAMES[b], onClick: () => chooseChildBase(b) }),
          ),
        ])
      : null,
    missingPosition ? h('p', { className: 'help', text: '포지션을 골라 주세요.' }) : null,
    h('div', { className: 'confirm-buttons' }, [
      actions.cancel ? h('button', { className: 'secondary', text: '닫기', onClick: actions.cancel }) : null,
      h('button', { className: 'primary', text: '이 장면으로 시작', disabled: missingPosition, onClick: () => actions.start(draft) }),
    ]),
    // 아이가 빠지는 교체: 지금 역할에 맞는 교체(주자면 대주자, 타석이면 대타 …)를 바로 고른다.
    actions.exit && actions.replaceReason
      ? h('button', {
          className: 'secondary danger replace-button',
          text: EXIT_REASON_LABEL[actions.replaceReason],
          onClick: () => actions.exit?.(actions.replaceReason ?? undefined),
        })
      : null,
    actions.exit || actions.endGame
      ? h('div', { className: 'confirm-buttons scene-end-buttons' }, [
          actions.exit ? h('button', { className: 'secondary danger', text: SCENE_END_BUTTON.exit, onClick: () => actions.exit?.() }) : null,
          actions.endGame ? h('button', { className: 'secondary', text: SCENE_END_BUTTON.gameEnd, onClick: actions.endGame }) : null,
        ])
      : null,
  ]);
}
