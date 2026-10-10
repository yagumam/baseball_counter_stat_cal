// 기록 입력 화면 (투수·타자 공통, 상황 기준 하나 — CLAUDE.md 0.5)
// 상황판(이닝·아웃·카운트·주자·점수·투구 수)은 위에 고정하고, 버튼은 스크롤 없이 한 화면에 들어가게 한다. (0.4)

import { BASE_NAMES, STEAL_NAMES, basesLabel, hasRunner, occupiedBases, stealableBases } from './bases';
import { MAX_BALLS_IN_COUNT, MAX_STRIKES_IN_COUNT, OUTS_PER_INNING } from './count';
import { diamond } from './diamond';
import { h } from './dom';
import { BaseIndex, Bases, BatterHand, ChildPosition, HitType, MAX_INNING, MAX_RUNS, PitchResult, UndoableEvent } from './events';
import { Game, GameInfo, dateLabel, opponentLabel, ourTeamLabel } from './game';
import { lineScoreTable } from './line-score-view';
import { halfInningLabel } from './innings';
import {
  CHILD_RUNNER_BUTTONS,
  CHOOSER_QUESTION,
  DOUBLE_PLAY_BUTTON,
  ChildRunnerAction,
  EXTRA_PITCH_BUTTONS,
  HIT_BUTTONS,
  MAIN_PITCH_BUTTONS,
  POSITION_LABEL,
  PitchButton,
  ROLE_LABEL,
  OTHER_RUNNER_OUT_LABEL,
  GAME_OVER_LABEL,
  MINI_GAME_LABEL,
  SCENE_END_BUTTON,
  RUNNER_BUTTONS,
  RunnerAction,
  eventLabel,
  outcomeLabel,
} from './labels';
import { LineScore } from './line-score';
import { ActiveState, GameReplay } from './replay';
import { SceneDraft, SceneSetupActions, defaultRole, defaultSceneDraft, sceneSetupView } from './scene-setup-view';
import { PlayFieldingActions, PlayFieldingDraft, playFieldingPopup } from './fielding-view';
import { Hand } from './settings';
import { BatterActions, BatterDraft, batterPill, batterPopup } from './batter-info-view';
import { TipKey, tipPopup } from './tips';
import { FieldActions, FieldDraft, PitchSheet, PitchSheetActions, SheetBatter, fieldPanel, pitchDetailToggle, pitchSheetView } from './pitch-detail-view';

export interface SituationDraft {
  readonly inning: number;
  readonly outs: number;
  readonly bases: Bases;
  readonly runs: number;
  /** 주자 장면에서 아이 위치 */
  readonly child: ChildPosition | null;
  /** 왜 고치는지 안내 (예: 실책 뒤) */
  readonly reason: string | null;
}

/** 지금 열려 있는 고르기 화면 */
export type Chooser = 'hit' | 'doublePlay' | 'otherRunner' | Exclude<RunnerAction, 'error'> | null;

export interface InputActions {
  pitch: (result: PitchResult, hitType?: HitType) => void;
  /** 병살: base는 타자와 함께 아웃된 주자가 있던 베이스 */
  doublePlay: (base: BaseIndex) => void;
  runner: (action: RunnerAction, base?: BaseIndex) => void;
  childRunner: (action: ChildRunnerAction) => void;
  choose: (chooser: Chooser) => void;
  undo: (targetId: string) => void;
  editSituation: (draft: SituationDraft | null) => void;
  saveSituation: (draft: SituationDraft) => void;
  openScene: () => void;
  /** 미니게임: 경기 끝을 물어보는 창 열기·닫기 */
  askEndGame: (open: boolean) => void;
  /** 경기 끝 뒤 다시 이어서 기록 (미니게임은 장면 설정 없이 이어 간다) */
  resumeGame: () => void;
  openGames: () => void;
  openScoreboard: () => void;
  scene: SceneSetupActions;
  toggleDetail: () => void;
  playFielding: PlayFieldingActions;
  sheet: PitchSheetActions;
  field: FieldActions;
  batter: BatterActions;
  closeTip: () => void;
}

export interface InputModel {
  readonly game: Game;
  readonly info: GameInfo;
  readonly replay: GameReplay;
  readonly events: readonly UndoableEvent[];
  readonly score: LineScore;
  readonly draft: SituationDraft | null;
  readonly chooser: Chooser;
  /** 등장 설정이 열려 있으면 그 값 */
  readonly sceneDraft: SceneDraft | null;
  readonly detailMode: boolean;
  /** 투구 상세 창이 열려 있으면 그 값 */
  readonly pitchSheet: PitchSheet | null;
  /** 손 설정: 구속 다이얼을 오른쪽/왼쪽 반원으로 그린다 */
  readonly hand: Hand;
  /** 친 공의 낙구 지점·질을 고르는 중이면 그 값 */
  readonly fieldDraft: FieldDraft | null;
  /** 수비 중 주자 상황에서 아이의 수비 기록을 고르는 중이면 그 값 */
  readonly playFielding: PlayFieldingDraft | null;
  /** 상대 타자 정보를 고르는 중이면 그 값 */
  readonly batterDraft: BatterDraft | null;
  /** 처음 한 번 보여주는 기록 요령 */
  readonly tip: TipKey | null;
  /** 설정: 우리 아이가 서는 타석 */
  readonly childBatterHand: BatterHand | null;
  /** 미니게임에서 경기 끝을 물어보는 중인지 */
  readonly confirmEnd: boolean;
}

function dots(filled: number, total: number, kind: string, label: string): HTMLElement {
  return h(
    'span',
    { className: `dots ${kind}`, attrs: { role: 'img', 'aria-label': `${label} ${filled}` } },
    Array.from({ length: total }, (_, i) => h('span', { className: i < filled ? 'dot on' : 'dot' })),
  );
}

function roleText(state: ActiveState): string {
  if (state.role === 'fielder' && state.position) return `${POSITION_LABEL[state.position]} 수비`;
  if (state.role === 'runner' && state.childBase !== null) return `${BASE_NAMES[state.childBase]} 주자`;
  return ROLE_LABEL[state.role];
}

/** 상황판 아래 숫자: 투수면 투구 수, 타자면 이번 타석 본 공 */
function workloadPill(replay: GameReplay, state: ActiveState): HTMLElement | null {
  const pas = replay.plateAppearances;
  if (state.role === 'pitcher') {
    const mine = pas.filter((pa) => pa.fieldingPosition === 'pitcher');
    const total = mine.reduce((n, pa) => n + pa.pitches.length, 0);
    const inning = mine.filter((pa) => pa.inning === state.inning && pa.half === state.half).reduce((n, pa) => n + pa.pitches.length, 0);
    return h('span', { className: 'pill' }, [h('small', { text: '투구 ' }), `${total}`, h('small', { text: ` (이번 회 ${inning})` })]);
  }
  if (state.role === 'fielder') {
    // 다른 투수가 던지는 동안이라 경기 전체 투구 수는 모른다. 이번 회 기록한 공만 보여준다.
    const inning = pas
      .filter((pa) => pa.sceneId === state.sceneId && pa.inning === state.inning && pa.half === state.half)
      .reduce((n, pa) => n + pa.pitches.length, 0);
    return h('span', { className: 'pill' }, [h('small', { text: '이번 회 투구 ' }), `${inning}`]);
  }
  if (state.role === 'batter') {
    const current = pas[pas.length - 1];
    const seen = current && current.outcome === null && current.actor === 'child' ? current.pitches.length : 0;
    return h('span', { className: 'pill' }, [h('small', { text: '이번 타석 본 공 ' }), `${seen}`]);
  }
  return null;
}

const END_REASON = { exit: '교체 아웃', next: '다음 장면으로', childDone: '아이 차례 끝', halfOver: '3아웃', gameEnd: '경기 끝' } as const;

function message(replay: GameReplay): string {
  const state = replay.state;
  const lastScene = replay.scenes[replay.scenes.length - 1];
  if (!state) {
    if (!lastScene) return '아이가 나오는 장면을 정하고 시작하세요.';
    const lastRun = replay.runnerEvents[replay.runnerEvents.length - 1];
    const scored = lastRun?.sceneId === lastScene.id && lastRun.kind === 'scored';
    const reason = scored ? '아이 홈인!' : END_REASON[lastScene.endedBy ?? 'next'];
    return `장면 끝 (${reason}). 다음에 아이가 나오면 장면을 시작하세요.`;
  }
  // 지금 장면에서 기록한 것만 본다.
  const pas = replay.plateAppearances.filter((pa) => pa.sceneId === state.sceneId);
  const last = pas[pas.length - 1];
  // 미니게임은 3아웃이면 다음 초·말 장면이 저절로 열린다.
  const previous = replay.scenes[replay.scenes.length - 2];
  if (!last && previous?.endedBy === 'halfOver' && lastScene?.id === state.sceneId) {
    return `3아웃! 이제 ${halfInningLabel(state.inning, state.half)} · 아이가 ${roleText(state)}`;
  }
  if (!last) return state.role === 'runner' ? '아이에게 일어난 일이나 지금 타자의 공을 기록하세요.' : '공마다 결과 버튼을 누르세요.';
  if (last.outcome === null) {
    const lastEvent = last.timeline[last.timeline.length - 1];
    return lastEvent ? `방금: ${eventLabel(lastEvent)}` : '공마다 결과 버튼을 누르세요.';
  }
  const runs = last.runs > 0 ? ` ${last.runs}점.` : '';
  const who = last.actor === 'child' ? '아이 타석' : `${last.number}번째 타석`;
  const text = `${who}: ${outcomeLabel(last)}.${runs}`;
  return state.inning !== last.inning ? `${text} 3아웃! 이제 ${halfInningLabel(state.inning, state.half)}` : text;
}

/** 위에 고정되는 상황판 */
function board(model: InputModel, actions: InputActions): HTMLElement {
  const { replay, info, score } = model;
  const state = replay.state;

  // 미니게임은 장면 설정이 없으므로 그 자리에 경기 끝 단추를 둔다. (진행 중일 때만)
  const sceneButton =
    info.gameType === 'mini' && state
      ? h('button', { className: 'board-scene', text: MINI_GAME_LABEL.end, onClick: () => actions.askEndGame(true) })
      : h('button', { className: 'board-scene', text: '장면 바꾸기 ›', onClick: actions.openScene });
  const head = h('div', { className: 'board-head' }, [
    h('button', { className: 'board-game', onClick: actions.openGames }, [`${dateLabel(info.date)} · ${opponentLabel(info.opponent)}`]),
    sceneButton,
  ]);
  const scorePill = h('button', { className: 'pill score', onClick: actions.openScoreboard }, [
    h('small', { text: '상대 ' }),
    `${score.totalRuns.them} : ${score.totalRuns.us}`,
    h('small', { text: ' 우리 ›' }),
  ]);

  if (!state) {
    return h('div', { className: 'board' }, [
      head,
      h('div', { className: 'board-stats' }, [scorePill]),
      h('p', { className: 'message', text: message(replay), attrs: { 'aria-live': 'polite' } }),
    ]);
  }

  const { inning, half, outs, bases, count } = state;
  return h('div', { className: 'board' }, [
    head,
    h('div', { className: 'board-main' }, [
      h('div', { className: 'board-left' }, [
        h('p', { className: 'inning' }, [
          h('strong', { text: halfInningLabel(inning, half) }),
          h('span', { className: `role-badge ${state.role}`, text: roleText(state) }),
          // 상대 타자를 상대할 때(투수·수비)만 타자 정보를 고른다.
          state.role === 'pitcher' || state.role === 'fielder' ? batterPill(state.batterHand, state.batterGrade, actions.batter.open) : null,
        ]),
        h('div', { className: 'count-row' }, [h('span', { text: '볼' }), dots(count.balls, MAX_BALLS_IN_COUNT, 'ball', '볼')]),
        h('div', { className: 'count-row' }, [
          h('span', { text: '스트라이크' }),
          dots(count.strikes, MAX_STRIKES_IN_COUNT, 'strike', '스트라이크'),
        ]),
        h('div', { className: 'count-row' }, [h('span', { text: '아웃' }), dots(outs, OUTS_PER_INNING - 1, 'out', '아웃')]),
      ]),
      h('div', { className: 'board-right' }, [
        diamond(bases, undefined, state.childBase),
        h('p', { className: 'bases-text', text: basesLabel(bases) }),
      ]),
    ]),
    h('div', { className: 'board-stats' }, [workloadPill(replay, state), scorePill]),
    // 장면 중에는 아래 "↶ 취소" 단추가 방금 기록을 보여 주므로, 높이가 낮은 화면에서는 CSS로 숨긴다.
    h('p', { className: 'message live', text: message(replay), attrs: { 'aria-live': 'polite' } }),
    boardMore(model),
  ]);
}

/**
 * 가로 화면에서만 보이는 상황판 덧붙임: 이번 타석에 던진 공과 스코어보드.
 * 세로 화면은 스크롤 없이 한 화면에 들어가야 해서 CSS로 숨긴다.
 */
function boardMore(model: InputModel): HTMLElement {
  const { replay, info, score } = model;
  const last = replay.plateAppearances[replay.plateAppearances.length - 1];
  const current = last && last.outcome === null ? last : null;
  return h('div', { className: 'board-more', attrs: { 'aria-hidden': 'true' } }, [
    h('p', { className: 'board-more-title', text: current ? `이번 타석 공 ${current.pitches.length}개` : '이번 타석: 아직 공 없음' }),
    current ? h('p', { className: 'chips' }, current.pitches.map((p) => h('span', { className: `chip ${p.result}`, text: eventLabel(p) }))) : null,
    lineScoreTable(score, { us: ourTeamLabel(info), them: opponentLabel(info.opponent) }, replay.state?.inning ?? null),
  ]);
}

function pitchButton(b: PitchButton, onClick: () => void, extra = false): HTMLElement {
  return h('button', { className: `pitch ${b.result}${extra ? ' extra' : ''}`, onClick }, [
    h('strong', { text: b.label }),
    h('small', { text: b.hint }),
  ]);
}

/** 병살이 될 수 있는 주자 베이스. 2아웃이면 타자만 잡아도 이닝이 끝나므로 병살이 없다. */
function doublePlayBases(state: ActiveState): BaseIndex[] {
  return state.outs < OUTS_PER_INNING - 1 ? occupiedBases(state.bases) : [];
}

function pitchPad(actions: InputActions, chooser: Chooser, title: string | null, dpBases: readonly BaseIndex[]): HTMLElement {
  if (chooser === 'doublePlay') {
    return h('section', { className: 'chooser' }, [
      h('p', { className: 'section-title', text: '타자와 함께 아웃된 주자는?' }),
      h('div', { className: 'choice-row' }, [
        ...dpBases.map((b) => h('button', { className: 'play', text: `${BASE_NAMES[b]} 주자`, onClick: () => actions.doublePlay(b) })),
        h('button', { className: 'secondary', text: '취소', onClick: () => actions.choose(null) }),
      ]),
    ]);
  }
  if (chooser === 'hit') {
    return h('section', { className: 'chooser' }, [
      h('p', { className: 'section-title', text: '어떤 안타인가요?' }),
      h(
        'div',
        { className: 'hit-grid' },
        HIT_BUTTONS.map((b) =>
          h('button', { className: 'pitch hit', onClick: () => actions.pitch('hit', b.hitType) }, [
            h('strong', { text: b.label }),
            h('small', { text: b.hint }),
          ]),
        ),
      ),
      h('button', { className: 'secondary', text: '취소', onClick: () => actions.choose(null) }),
    ]);
  }
  return h('div', { className: 'pitch-pad' }, [
    title ? h('p', { className: 'pad-title', text: title }) : null,
    h(
      'div',
      { className: 'pitch-buttons' },
      MAIN_PITCH_BUTTONS.map((b) => pitchButton(b, () => (b.result === 'hit' ? actions.choose('hit') : actions.pitch(b.result)))),
    ),
    h('div', { className: 'extra-buttons' }, [
      ...EXTRA_PITCH_BUTTONS.map((b) => pitchButton(b, () => actions.pitch(b.result), true)),
      // 주자가 한 명이면 바로, 여럿이면 누가 아웃됐는지 고른다.
      h(
        'button',
        {
          className: 'pitch out extra double-play',
          disabled: dpBases.length === 0,
          onClick: () => (dpBases.length === 1 ? actions.doublePlay(dpBases[0]) : actions.choose('doublePlay')),
        },
        [h('strong', { text: DOUBLE_PLAY_BUTTON.label }), h('small', { text: DOUBLE_PLAY_BUTTON.hint })],
      ),
    ]),
  ]);
}

/** 이 동작을 할 수 있는 베이스 */
function basesFor(action: RunnerAction, bases: Bases): BaseIndex[] {
  if (action === 'stolenBase' || action === 'caughtStealing') return stealableBases(bases);
  return occupiedBases(bases);
}

function baseChoiceLabel(action: RunnerAction, base: BaseIndex): string {
  return action === 'stolenBase' || action === 'caughtStealing' ? STEAL_NAMES[base] : BASE_NAMES[base];
}

/** 투수·타자 장면: 다른 주자들에 대한 기록 */
function runnerPad(bases: Bases, chooser: Chooser, actions: InputActions, onEdit: () => void): HTMLElement {
  if (chooser && chooser !== 'hit' && chooser !== 'doublePlay' && chooser !== 'otherRunner') {
    return h('section', { className: 'runner-section' }, [
      h('p', { className: 'section-title', text: CHOOSER_QUESTION[chooser] }),
      h('div', { className: 'choice-row' }, [
        ...basesFor(chooser, bases).map((b) =>
          h('button', { className: 'play', text: baseChoiceLabel(chooser, b), onClick: () => actions.runner(chooser, b) }),
        ),
        h('button', { className: 'secondary', text: '취소', onClick: () => actions.choose(null) }),
      ]),
    ]);
  }

  const onRunner = (action: RunnerAction): void => {
    if (action === 'error') return actions.runner('error');
    const choices = basesFor(action, bases);
    if (choices.length === 1) actions.runner(action, choices[0]);
    else actions.choose(action);
  };

  return h('section', { className: 'runner-section' }, [
    h('p', { className: 'section-title' }, [
      '주자 상황',
      h('small', { text: hasRunner(bases) ? ` · ${basesLabel(bases)}` : ' · 주자가 있을 때 눌러요' }),
    ]),
    h('div', { className: 'play-grid' }, [
      ...RUNNER_BUTTONS.map((b) =>
        h('button', { className: 'play', disabled: basesFor(b.action, bases).length === 0, onClick: () => onRunner(b.action) }, [
          h('strong', { text: b.label }),
          h('small', { text: b.hint }),
        ]),
      ),
      h('button', { className: 'play edit', onClick: onEdit }, [h('strong', { text: '상황 고치기' }), h('small', { text: '주자·아웃·점수' })]),
    ]),
  ]);
}

/** 주자 장면: 우리 아이에 대한 기록 */
/** 아이가 주자일 때 다른 주자가 아웃된 경우 (예: 아이 볼넷 뒤 앞 주자 견제 아웃) */
function otherRunnerChooser(state: ActiveState, actions: InputActions): HTMLElement {
  const others = occupiedBases(state.bases).filter((b) => b !== state.childBase);
  return h('section', { className: 'runner-section' }, [
    h('p', { className: 'section-title', text: '어느 주자가 어떻게 아웃됐나요?' }),
    h('div', { className: 'choice-row' }, [
      ...others.flatMap((b) => [
        h('button', { className: 'play', text: `${BASE_NAMES[b]} 주자 견제 아웃`, onClick: () => actions.runner('pickoffOut', b) }),
        h('button', { className: 'play', text: `${BASE_NAMES[b]} 주자 주루 아웃`, onClick: () => actions.runner('runnerOut', b) }),
      ]),
      h('button', { className: 'secondary', text: '취소', onClick: () => actions.choose(null) }),
    ]),
  ]);
}

function childRunnerPad(state: ActiveState, chooser: Chooser, actions: InputActions, onEdit: () => void): HTMLElement {
  if (chooser === 'otherRunner') return otherRunnerChooser(state, actions);
  const base = state.childBase;
  const hasOthers = occupiedBases(state.bases).some((b) => b !== base);
  const canSteal = base !== null && (base === 2 || !state.bases[base + 1]);
  const enabled: Record<ChildRunnerAction, boolean> = {
    stolenBase: canSteal,
    caughtStealing: canSteal,
    pickoff: true,
    pickoffOut: true,
    advance: true,
    scored: true,
    out: true,
  };
  return h('section', { className: 'runner-section child' }, [
    h('p', { className: 'section-title' }, [
      '우리 아이 주루',
      h('small', { text: base === null ? '' : ` · 지금 ${BASE_NAMES[base]}` }),
    ]),
    h('div', { className: 'child-grid' }, [
      ...CHILD_RUNNER_BUTTONS.map((b) =>
        h('button', { className: 'play', text: b.label, disabled: !enabled[b.action], onClick: () => actions.childRunner(b.action) }),
      ),
      h('button', { className: 'play', text: OTHER_RUNNER_OUT_LABEL, disabled: !hasOthers, onClick: () => actions.choose('otherRunner') }),
      h('button', { className: 'play edit', text: '상황 고치기', onClick: onEdit }),
    ]),
  ]);
}

function stepper(label: string, value: string, onMinus: (() => void) | null, onPlus: (() => void) | null): HTMLElement {
  return h('div', { className: 'stepper' }, [
    h('span', { text: label }),
    h('button', { text: '−', disabled: !onMinus, onClick: () => onMinus?.(), attrs: { 'aria-label': `${label} 줄이기` } }),
    h('strong', { text: value }),
    h('button', { text: '+', disabled: !onPlus, onClick: () => onPlus?.(), attrs: { 'aria-label': `${label} 늘리기` } }),
  ]);
}

function situationEditor(draft: SituationDraft, actions: InputActions): HTMLElement {
  const set = (change: Partial<SituationDraft>): void => actions.editSituation({ ...draft, ...change });
  const childOnBase = typeof draft.child === 'number' ? draft.child : null;
  const toggleBase = (b: BaseIndex): void => {
    const bases: [boolean, boolean, boolean] = [draft.bases[0], draft.bases[1], draft.bases[2]];
    bases[b] = !bases[b];
    if (childOnBase === b) bases[b] = true;
    set({ bases });
  };
  const childOptions: { value: ChildPosition; label: string }[] = [
    { value: 0, label: '1루' },
    { value: 1, label: '2루' },
    { value: 2, label: '3루' },
    { value: 'scored', label: '홈인' },
    { value: 'out', label: '아웃' },
  ];
  const setChild = (child: ChildPosition): void => {
    const bases: [boolean, boolean, boolean] = [draft.bases[0], draft.bases[1], draft.bases[2]];
    if (typeof childOnBase === 'number') bases[childOnBase] = false;
    if (typeof child === 'number') bases[child] = true;
    set({ child, bases });
  };

  return h('section', { className: 'situation-editor' }, [
    h('p', { className: 'section-title', text: '상황 고치기' }),
    h('p', { className: 'help', text: draft.reason ?? '실제 경기와 다르면 맞춰 주세요. 베이스를 누르면 주자를 넣거나 뺍니다.' }),
    h('div', { className: 'editor-grid' }, [
      h('div', { className: 'editor-fields' }, [
        stepper(
          '이닝',
          `${draft.inning}회`,
          draft.inning > 1 ? () => set({ inning: draft.inning - 1 }) : null,
          draft.inning < MAX_INNING ? () => set({ inning: draft.inning + 1 }) : null,
        ),
        h('div', { className: 'outs-picker' }, [
          h('span', { text: '아웃' }),
          ...Array.from({ length: OUTS_PER_INNING + 1 }, (_, n) =>
            h('button', { className: draft.outs === n ? 'active' : '', text: `${n}`, onClick: () => set({ outs: n }) }),
          ),
        ]),
        stepper(
          '들어온 점수',
          `${draft.runs}점`,
          draft.runs > 0 ? () => set({ runs: draft.runs - 1 }) : null,
          draft.runs < MAX_RUNS ? () => set({ runs: draft.runs + 1 }) : null,
        ),
      ]),
      diamond(draft.bases, toggleBase, childOnBase),
    ]),
    draft.child !== null
      ? h('div', { className: 'child-base-picker' }, [
          h('span', { text: '아이 위치' }),
          ...childOptions.map((o) =>
            h('button', { className: draft.child === o.value ? 'active' : '', text: o.label, onClick: () => setChild(o.value) }),
          ),
        ])
      : null,
    draft.outs === OUTS_PER_INNING
      ? h('p', { className: 'help', text: '3아웃으로 저장하면 이 이닝 쪽(초/말)이 끝납니다.' })
      : null,
    h('div', { className: 'confirm-buttons' }, [
      h('button', { className: 'secondary', text: '취소', onClick: () => actions.editSituation(null) }),
      h('button', { className: 'primary', text: '저장', onClick: () => actions.saveSituation(draft) }),
    ]),
  ]);
}

function undoButton(events: readonly UndoableEvent[], actions: InputActions): HTMLElement {
  const lastEvent = events[events.length - 1];
  return h('button', {
    className: 'undo',
    text: lastEvent ? `↶ 취소: ${eventLabel(lastEvent)}` : '↶ 마지막 기록 취소',
    disabled: !lastEvent,
    onClick: () => lastEvent && actions.undo(lastEvent.id),
  });
}

function controls(model: InputModel, actions: InputActions): HTMLElement {
  const { replay, events, draft, chooser, sceneDraft, info } = model;
  const state = replay.state;

  // "경기 끝"을 눌렀으면 끝난 화면을 보여준다. 새 장면을 시작하면 다시 이어서 기록한다.
  if (!sceneDraft && !state && replay.gameEnded) {
    return h('div', { className: 'controls' }, [
      h('section', { className: 'game-over' }, [
        h('p', { className: 'section-title', text: '이 경기 기록을 마쳤어요' }),
        h('p', { className: 'help', text: '결과에서 스코어보드와 장면별 기록을 보고, 고칠 공이 있으면 눌러서 고칠 수 있어요.' }),
        h('div', { className: 'confirm-buttons' }, [
          h('button', { className: 'secondary', text: GAME_OVER_LABEL.resume, onClick: actions.resumeGame }),
          h('button', { className: 'primary', text: GAME_OVER_LABEL.result, onClick: actions.openScoreboard }),
        ]),
      ]),
      undoButton(events, actions),
    ]);
  }

  // 진행 중인 장면이 없으면 바로 다음 장면 설정을 보여준다.
  if (sceneDraft || !state) {
    const draftToShow = sceneDraft ?? defaultSceneDraft(replay, defaultRole(replay));
    const current = state ? `${halfInningLabel(state.inning, state.half)} ${roleText(state)} 중` : null;
    const canClose = sceneDraft !== null && state !== null;
    const sceneActions: SceneSetupActions = {
      ...actions.scene,
      cancel: canClose ? actions.scene.cancel : null,
      exit: state ? actions.scene.exit : null,
      endGame: replay.scenes.length > 0 ? actions.scene.endGame : null,
    };
    return h('div', { className: 'controls' }, [
      sceneSetupView(draftToShow, info.battingFirst, sceneActions, current),
      undoButton(events, actions),
    ]);
  }

  if (draft) return h('div', { className: 'controls' }, [situationEditor(draft, actions)]);

  if (model.confirmEnd) {
    return h('div', { className: 'controls' }, [
      h('section', { className: 'game-over' }, [
        h('p', { className: 'section-title', text: '이 경기 기록을 마칠까요?' }),
        h('p', { className: 'help', text: '마친 뒤에도 "다시 이어서 기록"으로 이어 갈 수 있어요.' }),
        h('div', { className: 'confirm-buttons' }, [
          h('button', { className: 'secondary', text: MINI_GAME_LABEL.keepGoing, onClick: () => actions.askEndGame(false) }),
          h('button', { className: 'primary', text: SCENE_END_BUTTON.gameEnd, onClick: () => actions.scene.endGame?.() }),
        ]),
      ]),
    ]);
  }


  const detail = pitchDetailToggle(model.detailMode, actions.toggleDetail);

  const openEditor = (): void =>
    actions.editSituation({
      inning: state.inning,
      outs: state.outs,
      bases: state.bases,
      runs: 0,
      child: state.role === 'runner' ? state.childBase : null,
      reason: null,
    });

  if (state.role === 'runner') {
    return h('div', { className: 'controls' }, [
      childRunnerPad(state, chooser, actions, openEditor),
      detail,
      pitchPad(actions, chooser, '지금 타자의 공 (기록하면 아이가 자동으로 진루)', doublePlayBases(state)),
      undoButton(events, actions),
    ]);
  }

  return h('div', { className: 'controls' }, [
    detail,
    pitchPad(actions, chooser, null, doublePlayBases(state)),
    runnerPad(state.bases, chooser, actions, openEditor),
    undoButton(events, actions),
  ]);
}

/** 투구 상세 창 존 그림의 타자: 상대 타자(투수·수비 장면)는 창에서 고르고, 우리 아이가 칠 때는 설정의 아이 타석을 쓴다. */
function sheetBatter(model: InputModel): SheetBatter {
  const state = model.replay.state;
  if (state?.role === 'pitcher' || state?.role === 'fielder') return { hand: state.batterHand, editable: true };
  return { hand: state?.role === 'batter' ? model.childBatterHand : null, editable: false };
}

export function inputView(model: InputModel, actions: InputActions): HTMLElement {
  return h('section', { className: 'input' }, [
    h('div', { className: 'board-sticky' }, [board(model, actions)]),
    controls(model, actions),
    model.pitchSheet ? pitchSheetView(model.pitchSheet, model.hand, actions.sheet, sheetBatter(model)) : null,
    // 친 공은 야구장 그림 창에서 낙구 지점과 질을 고른 뒤 기록한다.
    model.fieldDraft ? fieldPanel(model.fieldDraft, actions.field) : null,
    model.playFielding ? playFieldingPopup(model.playFielding, actions.playFielding) : null,
    model.batterDraft ? batterPopup(model.batterDraft, actions.batter) : null,
    model.tip ? tipPopup(model.tip, actions.closeTip) : null,
  ]);
}
