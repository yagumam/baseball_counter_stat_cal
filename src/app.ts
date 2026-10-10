// 앱 화면: 기록 입력 / 경기(경기 목록 · 경기 결과) / 분석(투수·타자·수비) / 설정
// 입력은 상황 기준 하나, 분석은 투수·타자로 나눈다. (CLAUDE.md 0.5)
// 여기서는 상태를 들고 화면을 다시 그리는 일만 한다. 각 화면은 *-view.ts에 있다.

import { batterAnalysisView } from './batter/analysis-view';
import { AnalysisScope, AnalysisTab } from './common/analysis-ui';
import { h, segmented } from './common/dom';
import { BaseIndex, BatterHand, FieldingCredit, HitType, OutType, PitchResult, Role, TEAM_NAME_MAX_LENGTH, UndoableEvent, activeEvents, playEvents } from './common/events';
import { outTypeOptions } from './common/bases';
import { mergeGames, mergeSummary, parseBackup } from './common/backup-import';
import { BACKUP_REMINDER_MIN_GAMES, backupBanner } from './common/backup-banner';
import { gamesChangedSince, loadLastBackup, saveLastBackup } from './common/backup-reminder';
import { downloadFile, shareFile } from './common/download';
import { backupFileName, backupJson, pitchesCsv, pitchesFileName } from './common/export';
import { EMPTY_PITCH_DETAIL, FieldDraft, PitchDetail, PitchSheet, isBattedResult } from './common/pitch-detail-view';
import {
  Hand,
  OrientationMode,
  loadChildBatterHand,
  loadHand,
  loadOrientation,
  loadTeamName,
  saveChildBatterHand,
  saveHand,
  saveOrientation,
  saveTeamName,
} from './common/settings';
import { applyOrientation } from './common/orientation';
import { FIELDING_PLAYS, PlayFieldingDraft } from './common/fielding-view';
import { BatterDraft } from './common/batter-info-view';
import { TipKey, hasSeenTip, markTipSeen } from './common/tips';
import { OUTS_PER_INNING } from './common/count';
import { settingsView } from './common/settings-view';
import {
  Game,
  GameInfo,
  addAdjust,
  addAppearance,
  addBatter,
  addExit,
  addGameEnd,
  addPitch,
  addPlay,
  addScore,
  addTeamTotal,
  addVoid,
  addEdit,
  addDetailEdit,
  countsInStats,
  createGame,
  defaultVenue,
  gameInfo,
  gameShortLabel,
  setGameInfo,
  today,
  OPPONENT_MAX_LENGTH,
} from './common/game';
import { GameForm, GameListView, gamesView } from './common/games-view';
import { sortGames } from './common/game-list';
import { Chooser, SituationDraft, inputView } from './common/input-view';
import {
  ANALYSIS_KIND_LABEL,
  APP_NAME,
  AnalysisKind,
  AppTab,
  ChildRunnerAction,
  RunnerAction,
  TAB_LABEL,
} from './common/labels';
import { lineScore, scoreEventIds, totalEventIds } from './common/line-score';
import { ScoreCellDraft, recordsView } from './common/records-view';
import { ActiveState, GameReplay, replayGame } from './common/replay';
import { SceneDraft, defaultRole, defaultSceneDraft } from './common/scene-setup-view';
import { GameForStats } from './common/stat-base';
import { hasSeenTutorial, loadGames, markTutorialSeen, saveGames } from './common/storage';
import { manualView, tutorialView } from './common/help-view';
import { pitcherAnalysisView } from './pitcher/analysis-view';
import { fielderAnalysisView } from './fielder/analysis-view';
import { batterLine } from './batter/summary';
import { pitcherLine } from './pitcher/summary';
import { fielderLine } from './fielder/summary';
import { monthOf } from './common/calendar';

const STORAGE_KEY = 'baseball-counter.games.v3';
const LEGACY_STORAGE_KEYS = ['baseball-counter.pitcher.games.v2', 'baseball-counter.pitcher.games.v1'];

type Tab = AppTab;

const TABS: readonly Tab[] = ['input', 'games', 'analysis', 'settings'];

const ANALYSIS_KINDS: readonly AnalysisKind[] = ['pitcher', 'batter', 'fielder'];

/** 분석 종류마다 화면이 따로 있다 (투수·타자·수비 계산을 섞지 않는다. CLAUDE.md 0.5) */
function analysisView(kind: AnalysisKind): typeof pitcherAnalysisView {
  if (kind === 'batter') return batterAnalysisView;
  return kind === 'fielder' ? fielderAnalysisView : pitcherAnalysisView;
}

interface State {
  games: Game[];
  currentGameId: string | null;
  tab: Tab;
  analysisTab: AnalysisTab;
  analysisScope: AnalysisScope;
  notice: string | null;
  situationDraft: SituationDraft | null;
  chooser: Chooser;
  sceneDraft: SceneDraft | null;
  /** 경기 결과에서 고치고 있는 스코어보드 칸 */
  cellDraft: ScoreCellDraft | null;
  /** 경기 결과의 장면별 기록에서 고치고 있는 기록 */
  editingEvent: UndoableEvent | null;
  /** 고치고 있는 공의 투구 상세 */
  editDetail: PitchDetail;
  form: GameForm | null;
  /** 도움말(사용 설명서)을 보고 있는지 */
  helpOpen: boolean;
  /** 처음 사용 안내의 몇 번째 단계인지. 닫혀 있으면 null */
  tutorialStep: number | null;
  /** 투구 상세(구종·존·구속)를 함께 기록하는지 */
  detailMode: boolean;
  pitchSheet: PitchSheet | null;
  fieldDraft: FieldDraft | null;
  /** 엄지가 닿는 쪽 (설정) */
  hand: Hand;
  /** 경기 목록 정렬·찾기 */
  gameList: GameListView;
  /** 수비 중 주자 상황에서 아이의 수비 기록을 고르는 중 */
  playFielding: PlayFieldingDraft | null;
  /** 상대 타자 정보를 고르는 중 */
  batterDraft: BatterDraft | null;
  /** 처음 한 번 보여주는 기록 요령. 닫으면 next로 하려던 기록을 이어서 한다. */
  tip: { key: TipKey; next: () => void } | null;
  /** "경기" 탭에서 결과를 보고 있는 경기. 목록이면 null */
  resultGameId: string | null;
  /** 지울지 묻고 있는 경기 */
  deletingId: string | null;
  /** 분석 "선택한 경기"에서 보는 경기. 없으면 지금 기록 중인 경기 */
  analysisGameId: string | null;
  /** 새 경기에 넣을 우리 팀 이름 (설정, 이 휴대폰에 기억) */
  teamName: string;
  /** 화면 방향 (설정, 이 휴대폰에 기억) */
  orientation: OrientationMode;
  /** 우리 아이가 서는 타석 (설정, 이 휴대폰에 기억) */
  childBatterHand: BatterHand | null;
  /** "분석" 탭에서 보고 있는 것 */
  analysisKind: AnalysisKind;
  /** 마지막으로 백업한 시각 (이 휴대폰에 기억) */
  lastBackupAt: string | null;
  /** 미니게임에서 경기 끝을 물어보는 중인지 */
  confirmEnd: boolean;
}

const DETAIL_MODE_KEY = 'baseball-counter.pitch-detail';

/** 투구 상세 켜짐/꺼짐은 이 휴대폰에만 기억한다 (편의 설정). */
function loadDetailMode(): boolean {
  try {
    return localStorage.getItem(DETAIL_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveDetailMode(on: boolean): void {
  try {
    localStorage.setItem(DETAIL_MODE_KEY, on ? '1' : '0');
  } catch {
    // 기억하지 못해도 이번에는 그대로 쓴다.
  }
}

/** 아이가 이 경기에서 주로 한 역할의 분석 (투수로 던졌으면 투수, 타석이 있으면 타자, 수비만 했으면 수비) */
function childMainRole(replay: GameReplay): AnalysisKind | null {
  const pas = replay.plateAppearances;
  if (pas.some((pa) => pa.fieldingPosition === 'pitcher')) return 'pitcher';
  if (pas.some((pa) => pa.actor === 'child')) return 'batter';
  return pas.some((pa) => pa.fieldingPosition !== null) ? 'fielder' : null;
}

/** 경기 묶음에서 아이가 한 것을 한 줄씩 (투수 · 타자 · 수비 계산은 각 폴더에 있다) */
function childSummary(games: readonly Game[]): string[] {
  const forStats = games.map((g) => ({ label: gameShortLabel(g), replay: replayOf(g) }));
  const lines: [string, string | null][] = [
    ['투수', pitcherLine(forStats)],
    ['타자', batterLine(forStats)],
    ['', fielderLine(forStats)],
  ];
  return lines.filter(([, line]) => line !== null).map(([role, line]) => (role ? `${role}: ${line}` : (line as string)));
}

export function replayOf(game: Game): GameReplay {
  const info = gameInfo(game);
  return replayGame(playEvents(activeEvents(game.events)), { battingFirst: info.battingFirst, miniGame: info.gameType === 'mini' });
}

const ERROR_REASON = '실책으로 바뀐 주자·아웃·점수를 맞춰 주세요. 바뀐 게 없으면 취소를 누르세요.';
const ROE_REASON = '실책으로 더 간 주자나, 그 뒤 아웃된 주자(타자 포함)가 있으면 맞춰 주세요. 그대로면 취소를 누르세요.';
const BLOCKED_ADVANCE_REASON = '다음 베이스에 주자가 있어요. 주자들이 어떻게 움직였는지 맞춰 주세요.';

function newGameForm(teamName: string): GameForm {
  return {
    gameId: null,
    info: { date: today(), opponent: '', gameType: 'practice', battingFirst: 'them', venue: defaultVenue('them'), ourTeam: teamName },
    error: null,
  };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validateInfo(info: GameInfo): string | null {
  if (!DATE_PATTERN.test(info.date)) return '경기 날짜를 골라 주세요.';
  if (info.opponent.trim().length > OPPONENT_MAX_LENGTH) return `상대팀 이름은 ${OPPONENT_MAX_LENGTH}자까지 넣을 수 있어요.`;
  if (info.ourTeam.trim().length > TEAM_NAME_MAX_LENGTH) return `우리 팀 이름은 ${TEAM_NAME_MAX_LENGTH}자까지 넣을 수 있어요.`;
  return null;
}

/** 주자인 아이를 한 칸 옮기거나 홈인·아웃시키는 고침 */
function childRunnerAdjust(state: ActiveState, action: 'advance' | 'scored' | 'out'): SituationDraft | 'blocked' {
  const base = state.childBase;
  const bases: [boolean, boolean, boolean] = [state.bases[0], state.bases[1], state.bases[2]];
  if (base !== null) bases[base] = false;
  const common = { inning: state.inning, reason: null };
  if (action === 'out') return { ...common, outs: state.outs + 1, bases, runs: 0, child: 'out' };
  if (action === 'scored' || base === 2) return { ...common, outs: state.outs, bases, runs: 1, child: 'scored' };
  const target = ((base ?? -1) + 1) as BaseIndex;
  if (state.bases[target]) return 'blocked';
  bases[target] = true;
  return { ...common, outs: state.outs, bases, runs: 0, child: target };
}

export function mountApp(root: HTMLElement): void {
  const loaded = loadGames(STORAGE_KEY, LEGACY_STORAGE_KEYS);
  const latest = loaded.games[loaded.games.length - 1];
  const teamName = loadTeamName();
  const state: State = {
    games: loaded.games,
    currentGameId: latest?.id ?? null,
    tab: latest ? 'input' : 'games',
    analysisTab: 'result',
    analysisScope: 'game',
    notice: loaded.ok ? null : loaded.message,
    situationDraft: null,
    chooser: null,
    sceneDraft: null,
    cellDraft: null,
    editingEvent: null,
    editDetail: EMPTY_PITCH_DETAIL,
    form: latest ? null : newGameForm(teamName),
    helpOpen: false,
    tutorialStep: hasSeenTutorial() ? null : 0,
    detailMode: loadDetailMode(),
    pitchSheet: null,
    fieldDraft: null,
    hand: loadHand(),
    gameList: {
      mode: 'list',
      order: 'newest',
      type: 'all',
      query: '',
      calendar: { month: monthOf(latest ? gameInfo(latest).date : today()), zoom: 'month', day: null },
    },
    playFielding: null,
    batterDraft: null,
    tip: null,
    resultGameId: null,
    deletingId: null,
    analysisGameId: null,
    teamName,
    orientation: loadOrientation(),
    childBatterHand: loadChildBatterHand(),
    analysisKind: 'pitcher',
    lastBackupAt: loadLastBackup(),
    confirmEnd: false,
  };

  const currentGame = (): Game | undefined => state.games.find((g) => g.id === state.currentGameId);

  const persist = (): void => {
    if (!saveGames(STORAGE_KEY, state.games)) state.notice = '기록을 저장하지 못했습니다. 저장 공간을 확인하세요.';
  };

  const replaceGame = (game: Game): void => {
    state.games = state.games.map((g) => (g.id === game.id ? game : g));
    persist();
    render();
  };

  const updateCurrent = (change: (g: Game) => Game): void => {
    const game = currentGame();
    if (game) replaceGame(change(game));
  };

  const go = (tab: Tab): void => {
    state.tab = tab;
    state.helpOpen = false;
    state.situationDraft = null;
    state.chooser = null;
    state.sceneDraft = null;
    state.cellDraft = null;
    state.editingEvent = null;
    state.deletingId = null;
    state.fieldDraft = null;
    state.pitchSheet = null;
    state.playFielding = null;
    state.batterDraft = null;
    state.tip = null;
    state.confirmEnd = false;
    render();
    window.scrollTo(0, 0);
  };

  /** 공 하나를 기록한다. 투구 상세 창에서 고른 구종·존·구속이 있으면 함께 남긴다. */
  const recordPitch = (
    result: PitchResult,
    extra: {
      hitType?: HitType;
      doublePlay?: BaseIndex;
      outType?: OutType | null;
      pitch: PitchDetail;
      battedBall?: FieldDraft | null;
      fielding?: readonly FieldingCredit[] | null;
    },
  ): void => {
    const detail = extra.pitch;
    const ball = extra.battedBall;
    state.pitchSheet = null;
    state.fieldDraft = null;
    state.chooser = null;
    updateCurrent((g) =>
      addPitch(g, result, {
        hitType: extra.hitType,
        doublePlay: extra.doublePlay,
        outType: extra.outType ?? undefined,
        pitchType: detail.pitchType ?? undefined,
        zone: detail.zone ?? undefined,
        speed: detail.speed ?? undefined,
        battedBall: ball ? { x: ball.x, y: ball.y, type: ball.type, strength: ball.strength } : undefined,
        fielding: extra.fielding ?? undefined,
      }),
    );
    // 실책 출루 뒤에는 더 간 주자나 아웃된 주자(3아웃 포함)를 바로 맞추게 한다.
    if (result === 'reachedOnError') openErrorAdjust(ROE_REASON);
  };

  const currentReplay = (): GameReplay | null => {
    const game = currentGame();
    return game ? replayOf(game) : null;
  };

  /** 실책 뒤 상황 고치기를 연다. 바뀐 게 없으면 사용자가 취소한다. */
  const openErrorAdjust = (reason: string): void => {
    const active = currentReplay()?.state;
    if (!active) return;
    state.situationDraft = {
      inning: active.inning,
      outs: active.outs,
      bases: active.bases,
      runs: 0,
      child: active.role === 'runner' ? active.childBase : null,
      reason,
    };
    render();
  };

  /** 아이가 수비 중인지 (투수 또는 수비수 장면) */
  const childIsFielding = (): boolean => {
    const role = currentReplay()?.state?.role;
    return role === 'pitcher' || role === 'fielder';
  };

  /** 친 공은 야구장 그림에서 낙구 지점과 질(수비 중이면 아이의 수비 기록도)을 고른 뒤 기록한다. 나머지는 바로 기록한다. */
  const afterPitchDetail = (result: PitchResult, hitType: HitType | undefined, pitch: PitchDetail, doublePlay?: BaseIndex): void => {
    if (isBattedResult(result)) {
      state.pitchSheet = null;
      const active = currentReplay()?.state;
      const outTypes = result === 'out' && doublePlay === undefined && active ? outTypeOptions(active.bases, active.outs) : [];
      state.fieldDraft = {
        result,
        hitType,
        doublePlay,
        x: null,
        y: null,
        type: null,
        strength: null,
        pitch,
        fielding: childIsFielding() ? [] : null,
        outType: null,
        outTypeOptions: outTypes,
      };
      render();
      return;
    }
    recordPitch(result, { hitType, pitch });
  };

  /** 주자 상황 기록. 실책 뒤에는 바로 상황 고치기를 열어 바뀐 주자·점수를 맞추게 한다. */
  const recordRunnerPlay = (action: RunnerAction, base: BaseIndex | undefined, fielding: readonly FieldingCredit[]): void => {
    updateCurrent((g) => addPlay(g, action, base, fielding));
    if (action === 'error') openErrorAdjust(ERROR_REASON);
  };

  /** 공 결과 단추를 누른 뒤: 투구 상세를 켜 두었으면 그 공의 구종·존·구속을 고르는 창부터 연다. */
  const recordPitchStart = (result: PitchResult, hitType?: HitType): void => {
    state.chooser = null;
    if (state.detailMode) {
      state.pitchSheet = { result, hitType, ...EMPTY_PITCH_DETAIL };
      render();
      return;
    }
    afterPitchDetail(result, hitType, EMPTY_PITCH_DETAIL);
  };

  /** 그 상황에 처음이면 기록 요령을 먼저 보여주고, 닫으면 기록한다. */
  const withTip = (result: PitchResult, record: () => void): void => {
    const active = currentReplay()?.state;
    const runners = active ? active.bases.some(Boolean) : false;
    const key: TipKey | null =
      runners && result === 'wildPitch' ? 'wildPitch' : runners && result === 'out' && active && active.outs < OUTS_PER_INNING - 1 ? 'fieldersChoice' : null;
    if (key && !hasSeenTip(key)) {
      state.tip = { key, next: record };
      render();
      return;
    }
    record();
  };

  const inputActions = {
    pitch: (result: PitchResult, hitType?: HitType) => withTip(result, () => recordPitchStart(result, hitType)),
    closeTip: () => {
      const tip = state.tip;
      if (!tip) return;
      markTipSeen(tip.key);
      state.tip = null;
      tip.next();
    },
    doublePlay: (base: BaseIndex) => {
      state.chooser = null;
      if (state.detailMode) {
        state.pitchSheet = { result: 'out', doublePlay: base, ...EMPTY_PITCH_DETAIL };
        render();
        return;
      }
      afterPitchDetail('out', undefined, EMPTY_PITCH_DETAIL, base);
    },
    toggleDetail: () => {
      state.detailMode = !state.detailMode;
      saveDetailMode(state.detailMode);
      render();
    },
    sheet: {
      change: (sheet: PitchSheet) => {
        state.pitchSheet = sheet;
        render();
      },
      changeSpeed: (speed: number | null) => {
        if (state.pitchSheet) state.pitchSheet = { ...state.pitchSheet, speed };
      },
      save: (sheet: PitchSheet) =>
        afterPitchDetail(sheet.result, sheet.hitType, { pitchType: sheet.pitchType, zone: sheet.zone, speed: sheet.speed }, sheet.doublePlay),
      skip: (sheet: PitchSheet) => afterPitchDetail(sheet.result, sheet.hitType, EMPTY_PITCH_DETAIL, sheet.doublePlay),
      cancel: () => {
        state.pitchSheet = null;
        render();
      },
      // 창을 닫지 않고 타자 정보(학년은 그대로)를 저장한다. 공보다 먼저 기록되므로 이 타석에 붙는다.
      batterHand: (sheet: PitchSheet, hand: BatterHand | null) => {
        state.pitchSheet = sheet;
        const grade = currentReplay()?.state?.batterGrade ?? null;
        updateCurrent((g) => addBatter(g, hand, grade));
      },
    },
    field: {
      change: (draft: FieldDraft) => {
        state.fieldDraft = draft;
        render();
      },
      save: (draft: FieldDraft) => recordPitch(draft.result, { ...draft, battedBall: draft }),
      // 낙구 지점·질만 건너뛴다. 고른 수비 기록·아웃 종류는 남긴다.
      skip: (draft: FieldDraft) => recordPitch(draft.result, { ...draft, battedBall: null }),
      cancel: () => {
        state.fieldDraft = null;
        render();
      },
    },
    runner: (action: RunnerAction, base?: BaseIndex) => {
      state.chooser = null;
      // 수비 중이면 아이가 잡거나 던졌는지(또는 실책인지) 먼저 묻는다.
      if (childIsFielding() && FIELDING_PLAYS.includes(action)) {
        state.playFielding = { action, base, fielding: [] };
        render();
        return;
      }
      recordRunnerPlay(action, base, []);
    },
    playFielding: {
      change: (draft: PlayFieldingDraft) => {
        state.playFielding = draft;
        render();
      },
      save: (draft: PlayFieldingDraft) => {
        state.playFielding = null;
        recordRunnerPlay(draft.action, draft.base, draft.fielding);
      },
      cancel: () => {
        state.playFielding = null;
        render();
      },
    },
    batter: {
      open: () => {
        const active = currentReplay()?.state;
        state.batterDraft = { hand: active?.batterHand ?? null, grade: active?.batterGrade ?? null };
        render();
      },
      change: (draft: BatterDraft) => {
        state.batterDraft = draft;
        render();
      },
      save: (draft: BatterDraft) => {
        state.batterDraft = null;
        updateCurrent((g) => addBatter(g, draft.hand, draft.grade));
      },
      cancel: () => {
        state.batterDraft = null;
        render();
      },
    },
    childRunner: (action: ChildRunnerAction) => {
      const active = currentReplay()?.state;
      if (!active || active.childBase === null) return;
      if (action === 'advance' || action === 'scored' || action === 'out') {
        const draft = childRunnerAdjust(active, action);
        if (draft === 'blocked') {
          state.situationDraft = {
            inning: active.inning,
            outs: active.outs,
            bases: active.bases,
            runs: 0,
            child: active.childBase,
            reason: BLOCKED_ADVANCE_REASON,
          };
          render();
          return;
        }
        updateCurrent((g) => addAdjust(g, { ...draft, child: draft.child ?? undefined }));
        return;
      }
      const base = active.childBase;
      updateCurrent((g) => addPlay(g, action, base));
    },
    choose: (chooser: Chooser) => {
      state.chooser = chooser;
      render();
    },
    undo: (targetId: string) => updateCurrent((g) => addVoid(g, targetId)),
    editSituation: (draft: SituationDraft | null) => {
      state.situationDraft = draft;
      render();
    },
    saveSituation: (draft: SituationDraft) => {
      state.situationDraft = null;
      updateCurrent((g) => addAdjust(g, { ...draft, child: draft.child ?? undefined }));
    },
    openScene: () => {
      const replay = currentReplay();
      if (!replay) return;
      state.sceneDraft = defaultSceneDraft(replay, defaultRole(replay));
      state.chooser = null;
      state.situationDraft = null;
      render();
    },
    askEndGame: (open: boolean) => {
      state.confirmEnd = open;
      state.chooser = null;
      state.situationDraft = null;
      render();
    },
    resumeGame: () => {
      const game = currentGame();
      if (!game) return;
      // 미니게임은 장면 설정 없이, "경기 끝" 기록을 취소해 멈춘 곳에서 이어 간다. (지우지 않고 취소 기록을 덧붙임)
      if (gameInfo(game).gameType === 'mini') {
        const lastEnd = [...activeEvents(game.events)].reverse().find((e) => e.kind === 'gameEnd');
        if (lastEnd) updateCurrent((g) => addVoid(g, lastEnd.id));
        return;
      }
      inputActions.openScene();
    },
    openGames: () => {
      state.resultGameId = null;
      go('games');
    },
    openScoreboard: () => {
      state.resultGameId = state.currentGameId;
      go('games');
    },
    scene: {
      change: (draft: SceneDraft) => {
        state.sceneDraft = draft;
        render();
      },
      changeRole: (role: Role) => {
        const replay = currentReplay();
        if (!replay) return;
        state.sceneDraft = defaultSceneDraft(replay, role);
        render();
      },
      start: (draft: SceneDraft) => {
        state.sceneDraft = null;
        updateCurrent((g) =>
          addAppearance(g, {
            role: draft.role,
            inning: draft.inning,
            outs: draft.outs,
            bases: draft.bases,
            balls: draft.balls,
            strikes: draft.strikes,
            childBase: draft.childBase ?? undefined,
            position: draft.position ?? undefined,
          }),
        );
      },
      cancel: () => {
        state.sceneDraft = null;
        render();
      },
      exit: () => {
        state.sceneDraft = null;
        updateCurrent((g) => addExit(g));
      },
      endGame: () => {
        state.sceneDraft = null;
        state.confirmEnd = false;
        updateCurrent((g) => addGameEnd(g));
      },
    },
  };

  const resultGame = (): Game | undefined => state.games.find((g) => g.id === state.resultGameId);

  const updateResultGame = (change: (g: Game) => Game): void => {
    const game = resultGame();
    if (game) replaceGame(change(game));
  };

  const resultActions = {
    back: () => {
      state.resultGameId = null;
      state.cellDraft = null;
      render();
      window.scrollTo(0, 0);
    },
    editCell: (draft: ScoreCellDraft | null) => {
      state.cellDraft = draft;
      render();
    },
    saveCell: (draft: ScoreCellDraft) => {
      state.cellDraft = null;
      const { team, target, value } = draft;
      updateResultGame((g) => (typeof target === 'number' ? addScore(g, team, target, value) : addTeamTotal(g, team, target, value)));
    },
    // 직접 넣은 점수를 지우지 않고 취소 기록을 덧붙여, 기록에서 센 점수로 돌아간다.
    resetCell: (draft: ScoreCellDraft) => {
      state.cellDraft = null;
      const { team, target } = draft;
      updateResultGame((g) => {
        const events = activeEvents(g.events);
        const ids = typeof target === 'number' ? scoreEventIds(events, team, target) : totalEventIds(events, team, target);
        return ids.reduce(addVoid, g);
      });
    },
    editEvent: (event: UndoableEvent | null) => {
      state.editingEvent = event;
      // 공이면 원래 투구 상세로 채워 두고 고친다.
      state.editDetail =
        event?.kind === 'pitch' ? { pitchType: event.pitchType ?? null, zone: event.zone ?? null, speed: event.speed ?? null } : EMPTY_PITCH_DETAIL;
      render();
    },
    eventEdit: {
      close: () => {
        state.editingEvent = null;
        render();
      },
      saveResult: (targetId: string, result: PitchResult, hitType?: HitType) => {
        state.editingEvent = null;
        state.notice = '고쳤어요. 뒤 기록의 카운트·주자·점수도 다시 계산했어요.';
        updateResultGame((g) => addEdit(g, targetId, result, hitType));
      },
      remove: (targetId: string) => {
        state.editingEvent = null;
        state.notice = '지웠어요. 원래 기록은 이력으로 남아요.';
        updateResultGame((g) => addVoid(g, targetId));
      },
      toggleDetail: () => inputActions.toggleDetail(),
      changeDetail: (detail: PitchDetail) => {
        state.editDetail = detail;
        render();
      },
      changeSpeed: (speed: number | null) => {
        state.editDetail = { ...state.editDetail, speed };
      },
      saveDetail: (targetId: string, detail: PitchDetail) => {
        state.editingEvent = null;
        state.notice = '투구 상세를 고쳤어요.';
        updateResultGame((g) => addDetailEdit(g, targetId, detail));
      },
    },
    openChildRecord: () => {
      const game = resultGame();
      if (!game) return;
      state.analysisGameId = game.id;
      state.analysisScope = 'game';
      state.analysisKind = childMainRole(replayOf(game)) ?? state.analysisKind;
      go('analysis');
    },
  };

  const gamesActions = {
    select: (id: string) => {
      state.currentGameId = id;
      go('input');
    },
    openResult: (id: string) => {
      state.resultGameId = id;
      render();
      window.scrollTo(0, 0);
    },
    askDelete: (id: string | null) => {
      state.deletingId = id;
      render();
    },
    confirmDelete: (id: string) => {
      state.deletingId = null;
      state.games = state.games.filter((g) => g.id !== id);
      if (state.currentGameId === id) state.currentGameId = state.games[state.games.length - 1]?.id ?? null;
      if (state.analysisGameId === id) state.analysisGameId = null;
      if (state.games.length === 0) state.form = newGameForm(state.teamName);
      state.notice = '경기를 지웠어요.';
      persist();
      render();
    },
    openNew: () => {
      state.form = newGameForm(state.teamName);
      render();
    },
    openEdit: (game: Game) => {
      state.form = { gameId: game.id, info: gameInfo(game), error: null };
      render();
    },
    changeForm: (form: GameForm) => {
      state.form = form;
    },
    cancelForm: () => {
      state.form = null;
      render();
    },
    saveForm: (form: GameForm) => {
      const error = validateInfo(form.info);
      if (error) {
        state.form = { ...form, error };
        render();
        return;
      }
      state.form = null;
      if (form.gameId === null) {
        const game = createGame(form.info);
        state.games = [...state.games, game];
        state.currentGameId = game.id;
        persist();
        go('input');
        return;
      }
      const game = state.games.find((g) => g.id === form.gameId);
      if (game) replaceGame(setGameInfo(game, form.info));
    },
    openSettings: () => {
      state.form = null;
      go('settings');
    },
    changeList: (list: GameListView) => {
      // 찾는 말은 목록만 바꿔 그리므로 여기서는 담기만 하고, 그 밖의 것(정렬·구분·달력)이 바뀌면 다시 그린다.
      const redraw = list.query === state.gameList.query;
      state.gameList = list;
      if (redraw) render();
    },
  };

  const analysisActions = {
    scope: (s: AnalysisScope) => {
      state.analysisScope = s;
      render();
    },
    tab: (t: AnalysisTab) => {
      state.analysisTab = t;
      render();
    },
    pickGame: (id: string) => {
      state.analysisGameId = id;
      render();
    },
  };

  /** 분석 "선택한 경기": 고른 경기가 없으면 지금 기록 중인 경기 */
  const analysisGame = (fallback: Game): Game => state.games.find((g) => g.id === state.analysisGameId) ?? fallback;

  // "전체"는 미니게임·기타를 빼고 센다. "선택한 경기"는 고른 경기 하나를 그대로 보여준다.
  const statsGames = (): Game[] => state.games.filter(countsInStats);

  const scopedGames = (game: Game): GameForStats[] =>
    state.analysisScope === 'game'
      ? [{ label: gameShortLabel(game), replay: replayOf(game) }]
      : statsGames().map((g) => ({ label: gameShortLabel(g), replay: replayOf(g) }));

  const helpActions = {
    close: () => {
      state.helpOpen = false;
      render();
    },
    openTutorial: () => {
      state.tutorialStep = 0;
      render();
    },
  };

  const tutorialActions = {
    go: (step: number) => {
      state.tutorialStep = step;
      render();
    },
    close: () => {
      state.tutorialStep = null;
      markTutorialSeen();
      render();
    },
  };

  /** 백업을 마쳤다고 기억하고 알린다. */
  const markBackedUp = (message: string): void => {
    const now = new Date().toISOString();
    saveLastBackup(now);
    state.lastBackupAt = now;
    state.notice = message;
    render();
  };

  const settingsActions = {
    hand: (hand: Hand) => {
      state.hand = hand;
      saveHand(hand);
      render();
    },
    childBatterHand: (hand: BatterHand | null) => {
      state.childBatterHand = hand;
      saveChildBatterHand(hand);
      render();
    },
    orientation: (mode: OrientationMode) => {
      state.orientation = mode;
      saveOrientation(mode);
      applyOrientation(mode);
      render();
    },
    // 칠 때마다 다시 그리면 키보드가 닫히므로 기억만 한다.
    teamName: (name: string) => {
      state.teamName = name;
      saveTeamName(name);
    },
    download: (kind: 'backup' | 'pitches') => {
      const file =
        kind === 'backup'
          ? { name: backupFileName(state.games, today(), 'json'), data: backupJson(state.games, new Date().toISOString()), type: 'application/json' }
          : { name: pitchesFileName(today()), data: pitchesCsv(state.games, replayOf), type: 'text/csv' };
      void downloadFile(file.name, file.data, file.type).then((result) => {
        if (result === 'saved') {
          // 백업 파일을 받았으면 백업한 것으로 본다. (표 파일은 다시 불러올 수 없으므로 백업이 아니다)
          if (kind === 'backup') markBackedUp('백업 파일을 저장했어요. 휴대폰의 "다운로드" 폴더에 있어요.');
          return;
        }
        state.notice = result === 'declined' ? '내려받기를 취소했습니다.' : '이 화면에서는 파일을 내려받을 수 없습니다. 휴대폰 브라우저에서 앱을 열어 다시 해 보세요.';
        render();
      });
    },
    backupNow: () => {
      const data = backupJson(state.games, new Date().toISOString());
      const names = { primary: backupFileName(state.games, today(), 'json'), fallback: backupFileName(state.games, today(), 'txt') };
      void shareFile(names, data).then((result) => {
        if (result === 'shared') {
          markBackedUp('백업 파일을 보냈어요. 보낸 곳(카카오톡·드라이브 등)에 잘 들어갔는지 확인하세요.');
          return;
        }
        if (result === 'declined') {
          state.notice = '백업을 취소했어요. 기록을 지키려면 꼭 백업해 두세요.';
          render();
          return;
        }
        // 공유를 못 쓰는 곳이면 파일로 내려받는다.
        settingsActions.download('backup');
      });
    },
    importBackup: (file: File) => {
      void file
        .text()
        .then((text) => {
          const parsed = parseBackup(text);
          if (!parsed.ok) {
            state.notice = parsed.message;
            render();
            return;
          }
          const merged = mergeGames(state.games, parsed.games);
          state.games = [...merged.games];
          // 첫 화면(경기가 하나도 없을 때)에서 불러왔다면 새 경기 입력 대신 경기 목록을 보여준다.
          if (state.form?.gameId === null && merged.games.length > 0) state.form = null;
          state.currentGameId ??= state.games[state.games.length - 1]?.id ?? null;
          state.notice = saveGames(STORAGE_KEY, state.games)
            ? mergeSummary(merged)
            : '불러온 기록을 저장하지 못했습니다. 저장 공간을 확인하세요. 앱을 닫으면 불러온 기록이 사라집니다.';
          render();
        })
        .catch(() => {
          state.notice = '파일을 열 수 없습니다. 다시 골라 주세요.';
          render();
        });
    },
  };

  const renderBody = (game: Game | undefined): HTMLElement => {
    if (state.helpOpen) return manualView(helpActions);
    if (state.tab === 'settings') return settingsView(state.hand, state.orientation, state.childBatterHand, state.teamName, state.games.length > 0, state.lastBackupAt, settingsActions);
    const shown = resultGame();
    if (state.tab === 'games' && shown && !state.form) {
      const shownReplay = replayOf(shown);
      return recordsView(
        {
          info: gameInfo(shown),
          replay: shownReplay,
          score: lineScore(shownReplay, activeEvents(shown.events)),
          cellDraft: state.cellDraft,
          editing: state.editingEvent,
          editDetail: { detailMode: state.detailMode, hand: state.hand, detail: state.editDetail },
        },
        resultActions,
      );
    }
    if (!game || state.form || state.tab === 'games') {
      return gamesView(state.games, state.currentGameId, state.form, state.gameList, state.deletingId, gamesActions, replayOf, childSummary);
    }
    const info = gameInfo(game);
    const replay = replayOf(game);
    const events = activeEvents(game.events);
    const score = lineScore(replay, events);
    switch (state.tab) {
      case 'input':
        return inputView(
          {
            game,
            info,
            replay,
            events,
            score,
            draft: state.situationDraft,
            chooser: state.chooser,
            sceneDraft: state.sceneDraft,
            detailMode: state.detailMode,
            pitchSheet: state.pitchSheet,
            hand: state.hand,
            fieldDraft: state.fieldDraft,
            playFielding: state.playFielding,
            batterDraft: state.batterDraft,
            tip: state.tip?.key ?? null,
            childBatterHand: state.childBatterHand,
            confirmEnd: state.confirmEnd,
          },
          inputActions,
        );
      case 'analysis': {
        const chosen = analysisGame(game);
        return h('div', { className: 'analysis-page' }, [
          segmented<AnalysisKind>(
            ANALYSIS_KINDS.map((k) => [k, ANALYSIS_KIND_LABEL[k]]),
            state.analysisKind,
            (k) => {
              state.analysisKind = k;
              render();
            },
            'kind-tabs',
          ),
          analysisView(state.analysisKind)(scopedGames(chosen), statsGames().length, state.analysisScope, state.analysisTab, {
            ...analysisActions,
            excludedGames: state.games.length - statsGames().length,
            gameOptions: sortGames(state.games, 'newest').map((g) => [g.id, gameShortLabel(g)]),
            selectedGameId: chosen.id,
          }),
        ]);
      }
    }
  };

  const render = (): void => {
    const game = currentGame();
    const unbacked = gamesChangedSince(state.games, state.lastBackupAt).length;
    const showBackupBanner = unbacked >= BACKUP_REMINDER_MIN_GAMES && state.tab !== 'input' && !state.helpOpen && !state.form;
    const children: (Node | null)[] = [
      h('header', { className: 'topbar' }, [
        h('h1', { text: APP_NAME }),
        h('button', {
          className: 'help-button',
          text: '도움말',
          onClick: () => {
            state.helpOpen = true;
            render();
            window.scrollTo(0, 0);
          },
        }),
      ]),
      showBackupBanner ? backupBanner(unbacked, state.lastBackupAt, settingsActions) : null,
      h('main', { className: 'content' }, [renderBody(game)]),
      h(
        'nav',
        { className: 'tabbar' },
        TABS.map((tab) =>
          h(
            'button',
            {
              className: state.tab === tab && !state.helpOpen ? 'active' : '',
              disabled: (tab === 'input' || tab === 'analysis') && !game,
              onClick: () => {
                // 아래 "경기" 탭은 언제나 경기 목록부터 보여준다.
                if (tab === 'games') state.resultGameId = null;
                go(tab);
              },
            },
            [
              TAB_LABEL[tab],
              // 기록 입력 화면에는 띠를 못 넣으므로 "경기" 탭에 백업 안 한 경기 수를 붙인다.
              tab === 'games' && unbacked >= BACKUP_REMINDER_MIN_GAMES
                ? h('span', { className: 'tab-badge', text: String(unbacked), attrs: { 'aria-label': `백업 안 한 경기 ${unbacked}개` } })
                : null,
            ],
          ),
        ),
      ),
    ];
    if (state.notice) {
      const dismiss = (): void => {
        state.notice = null;
        render();
      };
      children.splice(1, 0, h('p', { className: 'notice', text: state.notice, onClick: dismiss }));
    }
    if (state.tutorialStep !== null) children.push(tutorialView(state.tutorialStep, tutorialActions));
    // 손 설정에 따라 CSS가 자주 누르는 단추를 엄지 쪽으로 옮긴다.
    root.dataset.hand = state.hand;
    root.replaceChildren(...children.filter((c): c is Node => c !== null));
  };

  applyOrientation(state.orientation);
  render();
}
