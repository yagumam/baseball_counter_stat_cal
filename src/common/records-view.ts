// 경기 결과 화면 (공통): 스코어보드와 장면별 기록

import { basesLabel } from './bases';
import { countLabel } from './count';
import { h } from './dom';
import { MAX_RUNS, Team, UndoableEvent } from './events';
import { GAME_TYPE_LABEL, GameInfo, dateLabel, opponentLabel, orderLabel, ourTeamLabel } from './game';
import { ACTOR_LABEL, GAME_RESULT_LABEL, RUNNER_EVENT_LABEL, SCORE_CELL_LABEL, TOTAL_FIELD_LABEL, eventLabel, outcomeLabel, sceneTitle } from './labels';
import { popup } from './popup';
import { EditDetailOptions, EventEditActions, eventEditPopup } from './event-edit-view';
import { LineScore } from './line-score';
import { ScoreCellTarget, lineScoreTable } from './line-score-view';
import { GameReplay, PlateAppearance, Scene, SceneEnd } from './replay';

const END_LABEL: Record<SceneEnd, string> = {
  exit: '교체 아웃',
  gameEnd: '경기 끝',
  next: '다음 장면으로',
  childDone: '아이 차례 끝',
  halfOver: '3아웃',
};

/** 누르면 그 기록을 고치는 창이 뜬다. */
function chip(event: UndoableEvent, onEdit: (event: UndoableEvent) => void): HTMLElement {
  const kindClass = event.kind === 'pitch' ? event.result : event.kind;
  return h('button', { className: `chip editable ${kindClass}`, text: eventLabel(event), attrs: { 'aria-label': `${eventLabel(event)}, 눌러서 고치기` }, onClick: () => onEdit(event) });
}

function paCard(pa: PlateAppearance, onEdit: (event: UndoableEvent) => void): HTMLElement {
  const runs = pa.runs > 0 ? ` · ${pa.runs}점` : '';
  return h('article', { className: `pa ${pa.actor}${pa.outcome === null ? ' current' : ''}` }, [
    h('h3', { text: `${pa.number}번째 타석 · ${ACTOR_LABEL[pa.actor]} · ${outcomeLabel(pa)}${runs}` }),
    h('p', { className: 'sub', text: `${pa.inning}회 시작: ${basesLabel(pa.basesBefore)} · ${pa.outsBefore}아웃 · 투구 ${pa.pitches.length}` }),
    pa.endCount ? h('p', { className: 'sub', text: `${countLabel(pa.endCount)}에서 끝남` }) : null,
    h('p', { className: 'chips' }, pa.timeline.map((e) => chip(e, onEdit))),
  ]);
}

function sceneBlock(scene: Scene, replay: GameReplay, onEdit: (event: UndoableEvent) => void): HTMLElement {
  const pas = replay.plateAppearances.filter((pa) => pa.sceneId === scene.id);
  const runs = replay.runnerEvents.filter((e) => e.sceneId === scene.id);
  const start = `시작: ${scene.outs}아웃 · ${basesLabel(scene.bases)}${scene.count.balls || scene.count.strikes ? ` · ${countLabel(scene.count)}` : ''}`;
  return h('section', { className: 'scene-block' }, [
    h('h2', { className: 'inning-title', text: sceneTitle(scene.role, scene.inning, scene.half, scene.position) }),
    h('p', { className: 'sub', text: `${start}${scene.endedBy ? ` · 끝: ${END_LABEL[scene.endedBy]}` : ' · 진행 중'}` }),
    runs.length > 0
      ? h('p', { className: 'chips' }, runs.map((e) => h('span', { className: 'chip runner', text: `아이 ${RUNNER_EVENT_LABEL[e.kind]} (${e.inning}회)` })))
      : null,
    ...pas.map((pa) => paCard(pa, onEdit)),
  ]);
}

/** 스코어보드 칸 하나를 고치는 중 */
export interface ScoreCellDraft {
  readonly team: Team;
  /** 이닝 점수 칸이면 이닝, 합계 칸이면 R·H·E */
  readonly target: ScoreCellTarget;
  readonly value: number;
  /** 이미 직접 넣은 값이 있는 칸인지 (있으면 "기록대로 되돌리기"를 보여준다) */
  readonly manual: boolean;
  /** 창을 막 열었는지. 처음 누른 숫자는 원래 값을 바꾸고, 그다음 숫자는 뒤에 붙는다(두 자리). */
  readonly fresh: boolean;
}

export interface ResultActions {
  back: () => void;
  editCell: (draft: ScoreCellDraft | null) => void;
  saveCell: (draft: ScoreCellDraft) => void;
  resetCell: (draft: ScoreCellDraft) => void;
  openChildRecord: () => void;
  /** 장면별 기록에서 기록 하나를 눌러 고치기 (null이면 닫기) */
  editEvent: (event: UndoableEvent | null) => void;
  eventEdit: EventEditActions;
}

const DIGIT_BASE = 10;

/** 숫자 단추를 눌렀을 때의 값: 막 열었으면 그 숫자, 아니면 뒤에 붙인다. 두 자리(99)를 넘으면 그 숫자부터 다시. */
export function typeDigit(value: number, fresh: boolean, digit: number): number {
  if (fresh) return digit;
  const joined = value * DIGIT_BASE + digit;
  return joined <= MAX_RUNS ? joined : digit;
}

function cellTitle(draft: ScoreCellDraft, teamName: string): string {
  return typeof draft.target === 'number' ? `${draft.target}회 ${teamName} 점수` : `${teamName} ${TOTAL_FIELD_LABEL[draft.target]} 합계`;
}

/** 키보드 대신 0~9 단추로 두 자리까지 넣는 창. −/+ 로 하나씩도 고친다. */
function scoreCellPopup(draft: ScoreCellDraft, teamName: string, actions: ResultActions): HTMLElement {
  const set = (value: number, fresh = false): void => actions.editCell({ ...draft, value: Math.min(MAX_RUNS, Math.max(0, value)), fresh });
  const title = cellTitle(draft, teamName);
  return popup('score-cell-popup', title, () => actions.editCell(null), [
    h('div', { className: 'sheet-head' }, [
      h('p', { className: 'section-title', text: title }),
      h('button', { className: 'link-button', text: '← 돌아가기', onClick: () => actions.editCell(null) }),
    ]),
    h('div', { className: 'score-cell-value' }, [
      h('button', { text: '−', disabled: draft.value <= 0, attrs: { 'aria-label': '1 빼기' }, onClick: () => set(draft.value - 1) }),
      h('strong', { className: draft.fresh ? 'fresh' : '', text: String(draft.value) }),
      h('button', { text: '+', disabled: draft.value >= MAX_RUNS, attrs: { 'aria-label': '1 더하기' }, onClick: () => set(draft.value + 1) }),
    ]),
    h(
      'div',
      { className: 'score-keypad', attrs: { role: 'group', 'aria-label': '숫자 넣기' } },
      [
        ...Array.from({ length: DIGIT_BASE }, (_, n) => h('button', { text: String(n), onClick: () => set(typeDigit(draft.value, draft.fresh, n)) })),
      ],
    ),
    h('p', { className: 'help', text: '숫자를 이어서 누르면 두 자리(최대 99)까지 들어가요. 예: 1 → 2 누르면 12' }),
    h('div', { className: 'confirm-buttons sheet-buttons' }, [
      draft.manual ? h('button', { className: 'secondary', text: SCORE_CELL_LABEL.reset, onClick: () => actions.resetCell(draft) }) : h('button', { className: 'secondary', text: SCORE_CELL_LABEL.clear, onClick: () => set(0, true) }),
      h('button', { className: 'primary', text: SCORE_CELL_LABEL.save, onClick: () => actions.saveCell(draft) }),
    ]),
  ]);
}

export interface ResultModel {
  readonly info: GameInfo;
  readonly replay: GameReplay;
  readonly score: LineScore;
  readonly cellDraft: ScoreCellDraft | null;
  /** 고치고 있는 기록 */
  readonly editing: UndoableEvent | null;
  /** 고치기 창의 투구 상세 (기록 입력과 같은 켜짐/꺼짐 설정) */
  readonly editDetail: EditDetailOptions;
}

/** 경기 결과: 스코어보드 · 내 아이 기록 보기 · 장면별 기록 */
export function recordsView(model: ResultModel, actions: ResultActions): HTMLElement {
  const { info, replay, score } = model;
  const names = { us: ourTeamLabel(info), them: opponentLabel(info.opponent) };
  const scenes = [...replay.scenes].reverse();
  return h('section', { className: 'records' }, [
    h('button', { className: 'link-button back-button', text: GAME_RESULT_LABEL.back, onClick: actions.back }),
    h('p', { className: 'game-title', text: `${dateLabel(info.date)} · ${names.us} vs ${names.them} · ${GAME_TYPE_LABEL[info.gameType]} · ${orderLabel(info)}${info.place.trim() ? ` · ${info.place.trim()}` : ''}` }),
    h('h2', { className: 'inning-title', attrs: { id: 'scoreboard' }, text: GAME_RESULT_LABEL.scoreboard }),
    lineScoreTable(score, names, replay.state?.inning ?? null, (team, target) => {
      if (typeof target === 'number') {
        const i = score.innings.indexOf(target);
        actions.editCell({ team, target, value: score.runs[team][i] ?? 0, manual: score.manual[team][i], fresh: true });
        return;
      }
      const values = { runs: score.totalRuns, hits: score.hits, errors: score.errors }[target];
      actions.editCell({ team, target, value: values[team], manual: score.manualTotals[team][target], fresh: true });
    }),
    h('button', { className: 'primary child-record', text: GAME_RESULT_LABEL.childRecord, onClick: actions.openChildRecord }),
    h('h2', { className: 'inning-title', text: '장면별 기록' }),
    scenes.length === 0 ? h('p', { className: 'empty', text: '아직 기록이 없습니다. 기록 입력에서 아이가 나오는 장면을 시작하세요.' }) : null,
    scenes.length > 0 ? h('p', { className: 'help', text: '공이나 기록을 누르면 고치거나 지울 수 있어요.' }) : null,
    ...scenes.map((scene) => sceneBlock(scene, replay, actions.editEvent)),
    model.cellDraft ? scoreCellPopup(model.cellDraft, names[model.cellDraft.team], actions) : null,
    model.editing ? eventEditPopup(model.editing, model.editDetail, actions.eventEdit) : null,
  ]);
}
