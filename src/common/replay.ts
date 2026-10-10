// 이벤트 목록을 처음부터 다시 따라가며 장면, 타석, 이닝, 아웃, 주자(우리 아이 포함), 점수를 계산한다.
// 화면과 통계는 저장된 값이 아니라 항상 이 결과를 쓴다. (기록과 가공 결과 분리, CLAUDE.md 5.3)
//
// 장면 = 우리 아이의 등장 하나.
// - 투수: 상대 타자들의 타석을 기록한다. 3아웃이면 다음 이닝 같은 쪽(초/말)으로 이어진다.
// - 타자: 아이의 타석을 기록하고, 살아나가면 그대로 주자로 이어진다.
// - 주자: 아이가 베이스에 있는 동안. 뒤 타자의 공도 기록하면 아이가 자동으로 진루한다.
// - 수비: 투수 장면처럼 상대 타자들의 타석을 기록한다(투구는 우리 팀 다른 투수). 아이가 처리한 플레이는
//   투구·주자 기록에 붙은 수비 기록(자살·보살·실책)으로 남는다.
// 공격 장면(타자·주자)은 아이가 아웃되거나 득점하거나 3아웃이 되면 끝난다.
//
// 미니게임(아이와 1:1): 등장 기록 없이 1회초부터 초·말마다 장면이 저절로 열린다.
// 상대 공격이면 아이가 투수, 우리 공격이면 아이가 매번 타자다. 3아웃이면 다음 초·말로 넘어간다.

import {
  BALLS_FOR_WALK,
  Count,
  FIRST_PITCH_COUNT,
  MAX_BALLS_IN_COUNT,
  MAX_STRIKES_IN_COUNT,
  OUTS_PER_INNING,
  STRIKES_FOR_STRIKEOUT,
} from './count';
import {
  Advance,
  Runners,
  advanceRunners,
  outTypeAdvance,
  batterAdvance,
  childBaseOf,
  forceAdvance,
  fromBases,
  keepErrorMarks,
  removeRunner,
  stealAdvance,
  toBases,
} from './bases';
import {
  AdjustEvent,
  AppearanceEvent,
  BaseIndex,
  BatterEvent,
  BatterHand,
  Bases,
  HIT_BASES,
  FieldingPosition,
  Half,
  HitType,
  PitchEvent,
  PitchResult,
  PlayEvent,
  PlayLogEvent,
  Position,
  Role,
  Team,
} from './events';
import { halfForRole, isOffenseRole, offensiveHalf } from './innings';

export type PlateAppearanceOutcome =
  | 'walk'
  | 'strikeout'
  | 'hit'
  | 'reachedOnError'
  | 'out'
  | 'hitByPitch'
  /** 타석 도중 이닝이 끝남 (예: 도루 실패로 세 번째 아웃). 같은 타자가 다음 이닝에 다시 친다. */
  | 'inningEnded'
  /** 타석 도중 아이가 교체되거나 다른 장면으로 넘어감 */
  | 'sceneEnded';

/** 타석의 타자가 누구인지 */
export type Actor = 'opponent' | 'child' | 'teammate';

export function isInterrupted(outcome: PlateAppearanceOutcome | null): boolean {
  return outcome === 'inningEnded' || outcome === 'sceneEnded';
}

export interface PlateAppearance {
  /** 경기 안에서 몇 번째로 기록한 타석인지 (1부터) */
  readonly number: number;
  /** 이 타석을 기록한 장면 (등장 이벤트 id) */
  readonly sceneId: string;
  readonly actor: Actor;
  /** 이 타석 동안 아이의 수비 자리. 아이가 공격 중이면 null */
  readonly fieldingPosition: FieldingPosition | null;
  readonly inning: number;
  readonly half: Half;
  readonly outsBefore: number;
  readonly basesBefore: Bases;
  /** 기록을 시작한 카운트 (중간 등판·대타면 0-0이 아닐 수 있음) */
  readonly startCount: Count;
  readonly pitches: readonly PitchEvent[];
  /** 이 타석 동안 일어난 투구·주자 상황·고침을 순서대로 */
  readonly timeline: readonly PlayLogEvent[];
  /** 마지막 공을 던지기 직전의 카운트. 끝나지 않았거나 중단되면 null */
  readonly endCount: Count | null;
  /** 진행 중이면 null */
  readonly outcome: PlateAppearanceOutcome | null;
  readonly currentCount: Count;
  /** 이 타석 동안 수비가 잡은 아웃 수 */
  readonly outsRecorded: number;
  /** 이 타석 동안 일어난 주자 상황 (견제, 도루 등) */
  readonly plays: readonly PlayEvent[];
  readonly hitType: HitType | null;
  /** 이 타석 동안 홈에 들어온 점수 */
  readonly runs: number;
  /** 그중 타석을 끝낸 공(안타·볼넷·희생타 등)으로 들어온 점수 (타점 계산용) */
  readonly runsOnResult: number;
  /** 타석이 끝난 뒤 다음 타자 전에 "상황 고치기"로 넣은 점수 (예: 안타 때 2루 주자도 홈인) */
  readonly runsAfterEnd: number;
  /**
   * 이 타석 동안 들어온 점수 중 비자책점. 간단한 규칙으로 센다:
   * 실책으로 나간 주자의 득점, 실책 출루·실책 진루 때(바로 이어 고친 상황 포함) 들어온 점수.
   */
  readonly unearnedRuns: number;
  /** 이 타석 동안 나온 수비 실책 수 */
  readonly errors: number;
  /** 타자가 선 쪽 (고른 경우만) */
  readonly batterHand: BatterHand | null;
  /** 타자 학년 (고른 경우만) */
  readonly batterGrade: number | null;
}

/** 주자로서 우리 아이에게 일어난 일 */
export type RunnerEventKind = 'stolenBase' | 'caughtStealing' | 'pickoff' | 'pickedOff' | 'scored' | 'out' | 'stranded';

export interface RunnerEvent {
  readonly kind: RunnerEventKind;
  readonly sceneId: string;
  readonly inning: number;
  readonly half: Half;
  /** 일이 생길 때 아이가 있던 베이스 */
  readonly base: BaseIndex | null;
  /** 그때 진행 중이던(또는 방금 끝난) 타석 번호 */
  readonly plateAppearance: number;
}

export type SceneEnd = 'exit' | 'next' | 'childDone' | 'halfOver' | 'gameEnd';

export interface Scene {
  readonly id: string;
  readonly role: Role;
  readonly inning: number;
  readonly half: Half;
  readonly outs: number;
  readonly bases: Bases;
  readonly count: Count;
  readonly childBase: BaseIndex | null;
  readonly position: Position | null;
  /** 아직 진행 중이면 null */
  readonly endedBy: SceneEnd | null;
}

/** 지금 진행 중인 장면의 상황 */
export interface ActiveState {
  readonly sceneId: string;
  /** 지금 아이의 역할. 타자 장면에서 살아나가면 'runner'가 된다. */
  readonly role: Role;
  readonly inning: number;
  readonly half: Half;
  readonly outs: number;
  readonly bases: Bases;
  readonly count: Count;
  /** 우리 아이가 있는 베이스 (주자일 때) */
  readonly childBase: BaseIndex | null;
  readonly position: Position | null;
  /** 지금 타자의 정보 (고른 경우만) */
  readonly batterHand: BatterHand | null;
  readonly batterGrade: number | null;
}

export interface HalfTotals {
  readonly runs: number;
  readonly hits: number;
  /** 수비 팀의 실책 */
  readonly errors: number;
}

export interface GameReplay {
  readonly plateAppearances: readonly PlateAppearance[];
  readonly scenes: readonly Scene[];
  readonly runnerEvents: readonly RunnerEvent[];
  /** 진행 중인 장면이 없으면 null */
  readonly state: ActiveState | null;
  /** 기록한 초·말별 점수·안타·실책. 키는 halfKey */
  readonly halves: ReadonlyMap<string, HalfTotals>;
  readonly battingFirst: Team;
  /** "기록 종료"를 눌렀고 그 뒤에 새 장면이 없는지 */
  readonly gameEnded: boolean;
}

export interface ReplaySettings {
  readonly battingFirst: Team;
  /** 미니게임이면 장면 설정 없이 1회초부터 초·말마다 장면을 연다. */
  readonly miniGame?: boolean;
}

export function halfKey(inning: number, half: Half): string {
  return `${inning}${half === 'top' ? 'T' : 'B'}`;
}

interface PitchApplied {
  readonly next: Count;
  readonly outcome: PlateAppearanceOutcome | null;
}

/** 공 하나가 카운트에 주는 영향. 주자 이동은 replayGame에서 처리한다. */
export function applyPitch(count: Count, result: PitchResult): PitchApplied {
  switch (result) {
    case 'ball':
    case 'wildPitch': {
      const balls = count.balls + 1;
      return balls >= BALLS_FOR_WALK
        ? { next: count, outcome: 'walk' }
        : { next: { ...count, balls }, outcome: null };
    }
    case 'strike':
    // 번트 파울은 2스트라이크에서도 스트라이크다. 그래서 2스트라이크 번트 파울은 삼진 (쓰리번트 아웃).
    case 'buntFoul': {
      const strikes = count.strikes + 1;
      return strikes >= STRIKES_FOR_STRIKEOUT
        ? { next: count, outcome: 'strikeout' }
        : { next: { ...count, strikes }, outcome: null };
    }
    case 'foul':
      // 2스트라이크 이후 일반 파울은 카운트가 그대로다.
      return count.strikes < MAX_STRIKES_IN_COUNT
        ? { next: { ...count, strikes: count.strikes + 1 }, outcome: null }
        : { next: count, outcome: null };
    case 'hit':
    case 'reachedOnError':
    case 'out':
    case 'hitByPitch':
      return { next: count, outcome: result };
  }
}

interface OpenPlateAppearance {
  sceneId: string;
  actor: Actor;
  fieldingPosition: FieldingPosition | null;
  inning: number;
  half: Half;
  outsBefore: number;
  basesBefore: Bases;
  startCount: Count;
  pitches: PitchEvent[];
  timeline: PlayLogEvent[];
  plays: PlayEvent[];
  count: Count;
  outsRecorded: number;
  runs: number;
  runsOnResult: number;
  unearnedRuns: number;
  errors: number;
  batterHand: BatterHand | null;
  batterGrade: number | null;
}

type MutablePlateAppearance = { -readonly [K in keyof PlateAppearance]: PlateAppearance[K] } & {
  timeline: PlayLogEvent[];
};

type MutableScene = { -readonly [K in keyof Scene]: Scene[K] };

interface OpenScene {
  record: MutableScene;
  role: Role;
  inning: number;
  half: Half;
  outs: number;
  runners: Runners;
  current: OpenPlateAppearance | null;
  childBatting: boolean;
  /** 이 장면에서 닫힌 마지막 타석 */
  lastClosed: MutablePlateAppearance | null;
  /** 방금 실책(실책 출루·실책 진루)이 있었는지. 다음 공·주자 상황 전까지 고친 점수는 비자책점이다. */
  errorPending: boolean;
  /** 미니게임 공격 장면: 타자는 늘 아이이고, 나가 있는 주자는 아이로 따로 세지 않는다. */
  childAlwaysBats: boolean;
}

type Totals = { runs: number; hits: number; errors: number };

function clampCount(balls: number, strikes: number): Count {
  return { balls: Math.min(balls, MAX_BALLS_IN_COUNT), strikes: Math.min(strikes, MAX_STRIKES_IN_COUNT) };
}

export function replayGame(events: readonly PlayLogEvent[], settings: ReplaySettings): GameReplay {
  const { battingFirst } = settings;
  const miniGame = settings.miniGame === true;
  const pas: MutablePlateAppearance[] = [];
  const scenes: MutableScene[] = [];
  const runnerEvents: RunnerEvent[] = [];
  const halves = new Map<string, Totals>();
  let scene: OpenScene | null = null;
  let gameEnded = false;
  /** 미니게임에서 다음에 저절로 열 초·말. 장면이 진행 중이거나 열 필요가 없으면 null */
  let nextMiniHalf: { inning: number; half: Half } | null = miniGame ? { inning: 1, half: 'top' } : null;

  const totals = (s: OpenScene): Totals => {
    const key = halfKey(s.inning, s.half);
    const t = halves.get(key) ?? { runs: 0, hits: 0, errors: 0 };
    halves.set(key, t);
    return t;
  };

  const actorFor = (s: OpenScene): Actor => {
    if (!isOffenseRole(s.role)) return 'opponent';
    return s.childBatting ? 'child' : 'teammate';
  };

  const fieldingPositionOf = (s: OpenScene): FieldingPosition | null => {
    if (s.role === 'pitcher') return 'pitcher';
    return s.role === 'fielder' ? s.record.position : null;
  };

  const openPa = (s: OpenScene, count: Count = FIRST_PITCH_COUNT): OpenPlateAppearance => ({
    sceneId: s.record.id,
    actor: actorFor(s),
    fieldingPosition: fieldingPositionOf(s),
    inning: s.inning,
    half: s.half,
    outsBefore: s.outs,
    basesBefore: toBases(s.runners),
    startCount: count,
    pitches: [],
    timeline: [],
    plays: [],
    count,
    outsRecorded: 0,
    runs: 0,
    runsOnResult: 0,
    unearnedRuns: 0,
    errors: 0,
    batterHand: null,
    batterGrade: null,
  });

  /** 공이나 주자 상황이 하나라도 있으면 타석으로 남긴다. */
  const started = (pa: OpenPlateAppearance | null): boolean =>
    pa !== null && (pa.pitches.length > 0 || pa.plays.length > 0);

  const toRecord = (
    pa: OpenPlateAppearance,
    outcome: PlateAppearanceOutcome | null,
    endCount: Count | null,
  ): MutablePlateAppearance => ({
    number: pas.length + 1,
    sceneId: pa.sceneId,
    actor: pa.actor,
    fieldingPosition: pa.fieldingPosition,
    inning: pa.inning,
    half: pa.half,
    outsBefore: pa.outsBefore,
    basesBefore: pa.basesBefore,
    startCount: pa.startCount,
    pitches: pa.pitches,
    timeline: pa.timeline,
    endCount,
    outcome,
    currentCount: pa.count,
    outsRecorded: pa.outsRecorded,
    plays: pa.plays,
    hitType: outcome === 'hit' ? (pa.pitches[pa.pitches.length - 1]?.hitType ?? 'single') : null,
    runs: pa.runs,
    runsOnResult: pa.runsOnResult,
    runsAfterEnd: 0,
    unearnedRuns: pa.unearnedRuns,
    errors: pa.errors,
    batterHand: pa.batterHand,
    batterGrade: pa.batterGrade,
  });

  const closePa = (s: OpenScene, outcome: PlateAppearanceOutcome, endCount: Count | null): void => {
    if (!s.current) return;
    const record = toRecord(s.current, outcome, endCount);
    pas.push(record);
    s.lastClosed = record;
    s.current = openPa(s);
  };

  /** 진행 중이거나 방금 끝난 타석 번호 (주자 기록의 출처) */
  const currentPaNumber = (s: OpenScene): number =>
    started(s.current) ? pas.length + 1 : (s.lastClosed?.number ?? pas.length + 1);

  const childEvent = (s: OpenScene, kind: RunnerEventKind, base: BaseIndex | null): void => {
    runnerEvents.push({ kind, sceneId: s.record.id, inning: s.inning, half: s.half, base, plateAppearance: currentPaNumber(s) });
  };

  /** 주자 이동 결과를 반영하고 점수를 센다. allUnearned: 실책 플레이로 들어온 점수라 모두 비자책 */
  const applyAdvance = (s: OpenScene, advance: Advance, owner: { runs: number; unearnedRuns: number }, allUnearned = false): void => {
    const childBefore = childBaseOf(s.runners);
    s.runners = advance.runners;
    if (advance.runs > 0) {
      totals(s).runs += advance.runs;
      owner.runs += advance.runs;
      owner.unearnedRuns += allUnearned ? advance.runs : advance.unearnedRuns;
    }
    if (advance.childScored) childEvent(s, 'scored', childBefore);
  };

  const endScene = (s: OpenScene, reason: SceneEnd): void => {
    if (started(s.current)) closePa(s, 'sceneEnded', null);
    s.record.endedBy = reason;
    scene = null;
  };

  /** 공격 장면에서 아이가 아웃·득점으로 베이스에 없으면 장면이 끝난다. */
  const endIfChildDone = (s: OpenScene): void => {
    if (scene !== s || !isOffenseRole(s.role) || s.childBatting) return;
    if (childBaseOf(s.runners) === null) endScene(s, 'childDone');
  };

  /** 3아웃 처리. 수비 장면은 다음 이닝으로 이어지고, 공격 장면은 끝난다. 미니게임은 다음 초·말 장면으로 넘어간다. */
  const endHalfIfOver = (s: OpenScene): void => {
    if (scene !== s || s.outs < OUTS_PER_INNING) return;
    if (started(s.current)) closePa(s, 'inningEnded', null);
    if (miniGame) {
      endScene(s, 'halfOver');
      nextMiniHalf = s.half === 'top' ? { inning: s.inning, half: 'bottom' } : { inning: s.inning + 1, half: 'top' };
      return;
    }
    if (isOffenseRole(s.role)) {
      const childBase = childBaseOf(s.runners);
      if (childBase !== null) childEvent(s, 'stranded', childBase);
      endScene(s, 'halfOver');
      return;
    }
    s.inning += 1;
    s.outs = 0;
    s.runners = [];
    s.current = openPa(s);
  };

  const openScene = (record: MutableScene, childAlwaysBats: boolean): void => {
    scenes.push(record);
    const s: OpenScene = {
      record,
      role: record.role,
      inning: record.inning,
      half: record.half,
      outs: Math.min(record.outs, OUTS_PER_INNING - 1),
      runners: fromBases(record.bases, record.childBase),
      current: null,
      childBatting: record.role === 'batter',
      lastClosed: null,
      errorPending: false,
      childAlwaysBats,
    };
    s.current = openPa(s, record.count);
    scene = s;
  };

  const startScene = (event: AppearanceEvent): void => {
    if (scene) endScene(scene, 'next');
    nextMiniHalf = null;
    const childBase = event.role === 'runner' ? (event.childBase ?? 0) : null;
    const bases: [boolean, boolean, boolean] = [event.bases[0], event.bases[1], event.bases[2]];
    if (childBase !== null) bases[childBase] = true;
    openScene(
      {
        id: event.id,
        role: event.role,
        inning: event.inning,
        half: halfForRole(event.role, battingFirst),
        outs: event.outs,
        bases,
        count: clampCount(event.balls, event.strikes),
        childBase,
        position: event.position ?? null,
        endedBy: null,
      },
      false,
    );
  };

  /** 미니게임: 진행 중인 장면이 없으면 다음 초·말 장면을 연다. 우리 공격이면 아이가 타자, 상대 공격이면 투수. */
  const openMiniSceneIfNeeded = (): void => {
    if (scene || !nextMiniHalf || gameEnded) return;
    const { inning, half } = nextMiniHalf;
    nextMiniHalf = null;
    const role: Role = half === offensiveHalf(battingFirst) ? 'batter' : 'pitcher';
    openScene(
      {
        // 등장 기록이 없으므로 초·말과 순서로 장면 id를 만든다.
        id: `mini-${halfKey(inning, half)}-${scenes.length + 1}`,
        role,
        inning,
        half,
        outs: 0,
        bases: [false, false, false],
        count: FIRST_PITCH_COUNT,
        childBase: null,
        position: null,
        endedBy: null,
      },
      role === 'batter',
    );
  };

  const onPitch = (s: OpenScene, pa: OpenPlateAppearance, event: PitchEvent): void => {
    // 기록이 있는 초·말은 점수가 없어도 0점으로 스코어보드에 남긴다.
    totals(s);
    s.errorPending = false;
    pa.timeline.push(event);
    pa.pitches.push(event);
    if (event.result === 'wildPitch') applyAdvance(s, advanceRunners(s.runners, 1), pa);
    const applied = applyPitch(pa.count, event.result);
    if (!applied.outcome) {
      pa.count = applied.next;
      endIfChildDone(s);
      return;
    }
    // 미니게임은 아이가 매번 치므로, 나간 주자를 아이로 표시하지 않는다.
    const batterIsChild = pa.actor === 'child' && !s.childAlwaysBats;
    const runsBefore = pa.runs;
    switch (applied.outcome) {
      case 'walk':
      case 'hitByPitch':
        applyAdvance(s, forceAdvance(s.runners, batterIsChild), pa);
        break;
      case 'hit':
        totals(s).hits += 1;
        applyAdvance(s, batterAdvance(s.runners, HIT_BASES[event.hitType ?? 'single'], batterIsChild), pa);
        break;
      case 'reachedOnError':
        // 실책 출루는 1루타처럼 한 베이스씩 옮긴다. 더 간 경우는 사용자가 고친다.
        totals(s).errors += 1;
        pa.errors += 1;
        applyAdvance(s, batterAdvance(s.runners, HIT_BASES.single, batterIsChild, true), pa, true);
        s.errorPending = true;
        break;
      default:
        // 희생타·진루타는 주자가 먼저 움직이고 타자가 아웃된다.
        if (event.outType !== undefined) applyAdvance(s, outTypeAdvance(s.runners, event.outType), pa);
        s.outs += 1;
        pa.outsRecorded += 1;
        if (event.doublePlay !== undefined) doubledUp(s, pa, event.doublePlay);
    }
    pa.runsOnResult = pa.runs - runsBefore;
    if (batterIsChild) s.childBatting = false;
    closePa(s, applied.outcome, pa.count);
    endHalfIfOver(s);
    endIfChildDone(s);
  };

  /** 병살의 두 번째 아웃: 그 베이스의 주자를 아웃시킨다. 다른 주자는 그대로 두고, 더 간 경우는 사용자가 고친다. */
  const doubledUp = (s: OpenScene, pa: OpenPlateAppearance, base: BaseIndex): void => {
    if (s.outs >= OUTS_PER_INNING || !toBases(s.runners)[base]) return;
    if (childBaseOf(s.runners) === base) childEvent(s, 'out', base);
    s.runners = removeRunner(s.runners, base).runners;
    s.outs += 1;
    pa.outsRecorded += 1;
  };

  const onPlay = (s: OpenScene, pa: OpenPlateAppearance, event: PlayEvent): void => {
    totals(s);
    // 실책 진루 뒤에 이어진 주루 아웃까지는 같은 실책 플레이로 본다.
    if (event.play === 'error') s.errorPending = true;
    else if (event.play !== 'runnerOut') s.errorPending = false;
    pa.timeline.push(event);
    pa.plays.push(event);
    const legacySecond = event.play === 'stolenSecond' || event.play === 'caughtStealingSecond';
    const base: BaseIndex = legacySecond ? 0 : (event.base ?? 0);
    const isChild = childBaseOf(s.runners) === base;
    switch (event.play) {
      case 'pickoff':
        if (isChild) childEvent(s, 'pickoff', base);
        break;
      case 'runnerOut':
        if (isChild) childEvent(s, 'out', base);
        s.runners = removeRunner(s.runners, base).runners;
        s.outs += 1;
        pa.outsRecorded += 1;
        break;
      case 'pickoffOut':
      case 'caughtStealing':
      case 'caughtStealingSecond':
        if (isChild) childEvent(s, event.play === 'pickoffOut' ? 'pickedOff' : 'caughtStealing', base);
        s.runners = removeRunner(s.runners, base).runners;
        s.outs += 1;
        pa.outsRecorded += 1;
        break;
      case 'stolenBase':
      case 'stolenSecond':
        if (isChild) childEvent(s, 'stolenBase', base);
        applyAdvance(s, stealAdvance(s.runners, base), pa);
        break;
      case 'error':
        pa.errors += 1;
        totals(s).errors += 1;
        break;
    }
    endHalfIfOver(s);
    endIfChildDone(s);
  };

  const onAdjust = (s: OpenScene, event: AdjustEvent): void => {
    // 다음 타자의 첫 공 전에 고친 것은 방금 끝난 타석의 결과로 본다. (예: 병살의 두 번째 아웃)
    const owner = started(s.current) || !s.lastClosed ? s.current : s.lastClosed;
    owner?.timeline.push(event);

    const childBefore = childBaseOf(s.runners);
    let childBase: BaseIndex | null = childBefore !== null && event.bases[childBefore] ? childBefore : null;
    if (event.child === 'scored' || event.child === 'out') {
      childEvent(s, event.child, childBefore);
      childBase = null;
    } else if (event.child !== undefined) {
      childBase = event.child;
    }
    const bases: [boolean, boolean, boolean] = [event.bases[0], event.bases[1], event.bases[2]];
    if (childBase !== null) bases[childBase] = true;

    if (event.inning !== s.inning) {
      // 이닝을 직접 바꾼 경우: 아웃은 수비가 잡은 것으로 세지 않는다.
      if (started(s.current)) closePa(s, 'inningEnded', null);
      s.inning = event.inning;
    } else {
      // 장면의 첫 기록 전에 고친 것은 시작 상황이므로 잡은 아웃으로 세지 않는다.
      const isStartingSituation = !started(s.current) && !s.lastClosed;
      if (event.outs > s.outs && !isStartingSituation && owner) owner.outsRecorded += event.outs - s.outs;
    }
    const runs = event.runs ?? 0;
    if (runs > 0) {
      totals(s).runs += runs;
      if (owner) owner.runs += runs;
      if (owner && owner === s.lastClosed) s.lastClosed.runsAfterEnd += runs;
      if (owner && s.errorPending) owner.unearnedRuns += runs;
    }
    s.outs = event.outs;
    s.runners = keepErrorMarks(s.runners, fromBases(bases, childBase));
    if (s.current && !started(s.current)) {
      s.current.inning = s.inning;
      s.current.outsBefore = s.outs;
      s.current.basesBefore = toBases(s.runners);
    }
    endHalfIfOver(s);
    endIfChildDone(s);
  };

  /** 타자 정보는 지금 타석(아직 공이 없으면 다음 타자)에 붙는다. 다시 고르면 바꾼다. */
  const onBatter = (s: OpenScene, event: BatterEvent): void => {
    if (!s.current) return;
    s.current.batterHand = event.hand ?? null;
    s.current.batterGrade = event.grade ?? null;
  };

  for (const event of events) {
    if (event.kind === 'appearance') {
      gameEnded = false;
      startScene(event);
      continue;
    }
    if (event.kind === 'gameEnd') {
      if (scene) endScene(scene, 'gameEnd');
      gameEnded = true;
      continue;
    }
    openMiniSceneIfNeeded();
    // scene은 위의 함수들 안에서 바뀌므로 타입을 직접 밝힌다.
    const s = scene as OpenScene | null;
    if (!s) continue;
    if (event.kind === 'exit') {
      endScene(s, 'exit');
      continue;
    }
    if (event.kind === 'adjust') {
      onAdjust(s, event);
      continue;
    }
    if (event.kind === 'batter') {
      onBatter(s, event);
      continue;
    }
    if (!s.current) continue;
    if (event.kind === 'pitch') onPitch(s, s.current, event);
    else onPlay(s, s.current, event);
  }

  openMiniSceneIfNeeded();
  const active = scene as OpenScene | null;
  if (active?.current && started(active.current)) pas.push(toRecord(active.current, null, null));

  return {
    plateAppearances: pas,
    scenes,
    runnerEvents,
    state: active ? activeState(active) : null,
    halves,
    battingFirst,
    gameEnded,
  };
}

function activeState(s: OpenScene): ActiveState {
  const role: Role = s.role === 'batter' && !s.childBatting ? 'runner' : s.role;
  return {
    sceneId: s.record.id,
    role,
    inning: s.inning,
    half: s.half,
    outs: s.outs,
    bases: toBases(s.runners),
    count: s.current?.count ?? FIRST_PITCH_COUNT,
    childBase: childBaseOf(s.runners),
    position: s.record.position,
    batterHand: s.current?.batterHand ?? null,
    batterGrade: s.current?.batterGrade ?? null,
  };
}
