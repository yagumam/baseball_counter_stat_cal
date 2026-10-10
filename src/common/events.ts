// 경기 기록은 덮어쓰지 않는 "이벤트 목록"으로 저장한다. (CLAUDE.md 5.3)
// 고치거나 취소할 때도 기존 이벤트를 지우지 않고 새 이벤트를 덧붙인다.
// 기록은 경기 상황 기준이고, 우리 아이의 역할은 "등장(appearance)" 이벤트로 장면마다 정한다. (CLAUDE.md 0.5)

import { MAX_BALLS_IN_COUNT, MAX_STRIKES_IN_COUNT, OUTS_PER_INNING } from './count';

export type PitchResult =
  | 'ball'
  | 'strike'
  | 'foul'
  | 'buntFoul'
  | 'wildPitch'
  | 'hit'
  | 'reachedOnError'
  | 'out'
  | 'hitByPitch';

export const PITCH_RESULTS: readonly PitchResult[] = [
  'ball',
  'strike',
  'foul',
  'buntFoul',
  'wildPitch',
  'hit',
  'reachedOnError',
  'out',
  'hitByPitch',
];

/** 안타 종류. 예전 기록처럼 종류가 없으면 1루타로 본다. */
export type HitType = 'single' | 'double' | 'triple' | 'homeRun';

export const HIT_TYPES: readonly HitType[] = ['single', 'double', 'triple', 'homeRun'];

/** 안타 종류별로 타자가 가는 베이스 수 (루타) */
export const HIT_BASES: Record<HitType, number> = { single: 1, double: 2, triple: 3, homeRun: 4 };

/**
 * 투구가 아닌 주자 상황. base는 그 주자가 있던 베이스다.
 * - stolenBase / caughtStealing: 도루 성공·실패 (base 0 = 1루 주자의 2루 도루, 2 = 3루 주자의 홈 도루)
 * - error: 수비 실책으로 주자가 움직임. 바뀐 상황은 이어서 "상황 고치기"로 맞춘다.
 * - runnerOut: 주루사. 안타·실책·볼넷 뒤 더 가다가(홈 포함) 베이스에서 아웃됨
 * - stolenSecond / caughtStealingSecond: 예전 기록용 (1루 주자의 2루 도루)
 */
export type PlayKind =
  | 'pickoff'
  | 'pickoffOut'
  | 'stolenBase'
  | 'caughtStealing'
  | 'error'
  | 'runnerOut'
  | 'stolenSecond'
  | 'caughtStealingSecond';

export const PLAY_KINDS: readonly PlayKind[] = [
  'pickoff',
  'pickoffOut',
  'stolenBase',
  'caughtStealing',
  'error',
  'runnerOut',
  'stolenSecond',
  'caughtStealingSecond',
];

/** 구종 */
export type PitchType = 'fastball' | 'curveball' | 'slider' | 'changeup' | 'splitter' | 'other';

export const PITCH_TYPES: readonly PitchType[] = ['fastball', 'curveball', 'slider', 'changeup', 'splitter', 'other'];

/**
 * 공이 지나간 곳. 스트라이크 존 그림 안의 위치를 0~1로 저장한다.
 * 그림 전체 중 x·y 모두 ZONE_MIN~ZONE_MAX 사이가 스트라이크 존이다. (y는 위가 0)
 */
export interface ZonePoint {
  readonly x: number;
  readonly y: number;
}

export const ZONE_MIN = 0.2;
export const ZONE_MAX = 0.8;

/** 구속으로 받을 수 있는 범위 (km/h, 입력 실수 방지) */
export const SPEED_MIN = 30;
export const SPEED_MAX = 180;

/** 타구 종류 */
export type BattedBallType = 'ground' | 'line' | 'fly' | 'popup';

export const BATTED_BALL_TYPES: readonly BattedBallType[] = ['ground', 'line', 'fly', 'popup'];

/** 타구 세기 */
export type BattedBallStrength = 'soft' | 'medium' | 'hard';

export const BATTED_BALL_STRENGTHS: readonly BattedBallStrength[] = ['soft', 'medium', 'hard'];

/** 친 공. 낙구 지점은 야구장 그림 안의 위치를 0~1로 저장한다. (홈플레이트가 아래 가운데) */
export interface BattedBall {
  readonly x: number | null;
  readonly y: number | null;
  readonly type: BattedBallType | null;
  readonly strength: BattedBallStrength | null;
}

/**
 * 아웃의 종류. 타자는 아웃됐지만 주자를 보낸 경우를 구분한다. (result가 'out'이고 병살이 아닐 때만)
 * - sacrificeBunt(희생번트) · sacrificeFly(희생플라이): 공식 기록 규칙상 타수에서 빠진다.
 * - productive(진루타): 공식 기록이 아니어서 타수는 그대로, 개수만 센다.
 */
export type OutType = 'sacrificeBunt' | 'sacrificeFly' | 'productive';

export const OUT_TYPES: readonly OutType[] = ['sacrificeBunt', 'sacrificeFly', 'productive'];

/** 0: 1루, 1: 2루, 2: 3루 */
export type BaseIndex = 0 | 1 | 2;

export type Bases = readonly [boolean, boolean, boolean];

/**
 * 경기 구분. mini(미니게임)는 아이와 1:1로 재미 삼아 하는 경기라 장면 설정 없이 1회부터 기록한다.
 * league(리그경기)는 이제 고를 수 없지만 예전 기록을 읽기 위해 남긴다.
 */
export type GameType = 'practice' | 'tournament' | 'mini' | 'other' | 'league';

/** 새로 고를 수 있는 경기 구분 */
export const GAME_TYPES: readonly GameType[] = ['practice', 'tournament', 'mini', 'other'];

/** 저장된 기록에 있을 수 있는 경기 구분 (예전 리그경기 포함) */
export const STORED_GAME_TYPES: readonly GameType[] = [...GAME_TYPES, 'league'];

/** 통계(분석 "전체")에서 빼는 경기 구분: 재미로 한 미니게임과 기타 */
export const STATS_EXCLUDED_GAME_TYPES: readonly GameType[] = ['mini', 'other'];

export type Team = 'us' | 'them';

/** 우리 팀이 홈인지 원정인지. 아마추어는 동전 던지기로 선후공을 정하기도 해서 선공/후공과 따로 둔다. */
export type Venue = 'home' | 'away';

/** 우리 팀 이름 최대 글자 수 */
export const TEAM_NAME_MAX_LENGTH = 30;

/** 초(top) / 말(bottom) */
export type Half = 'top' | 'bottom';

/** 장면에서 우리 아이의 역할 */
export type Role = 'pitcher' | 'batter' | 'runner' | 'fielder';

export const ROLES: readonly Role[] = ['pitcher', 'batter', 'runner', 'fielder'];

/** 투수를 뺀 수비 포지션 (투수는 역할 'pitcher') */
export type Position =
  | 'catcher'
  | 'firstBase'
  | 'secondBase'
  | 'thirdBase'
  | 'shortstop'
  | 'leftField'
  | 'centerField'
  | 'rightField';

export const POSITIONS: readonly Position[] = [
  'catcher',
  'firstBase',
  'secondBase',
  'thirdBase',
  'shortstop',
  'leftField',
  'centerField',
  'rightField',
];

/** 수비 중인 아이의 자리. 투수 장면은 'pitcher' */
export type FieldingPosition = 'pitcher' | Position;

/**
 * 수비 중인 우리 아이가 그 플레이에서 받은 기록 (공식 기록 규칙의 자살·보살·실책).
 * - putout(자살): 공을 잡고 직접 아웃시킴 (뜬공 잡기, 베이스 밟기, 태그)
 * - assist(보살): 던지거나 굴절시켜 아웃을 도움
 * - error(실책): 놓치거나 잘못 던져 살려 주거나 더 가게 함
 */
export type FieldingCredit = 'putout' | 'assist' | 'error';

export const FIELDING_CREDITS: readonly FieldingCredit[] = ['putout', 'assist', 'error'];

function isFieldingCredits(value: unknown): boolean {
  return Array.isArray(value) && value.every((c) => FIELDING_CREDITS.includes(c as FieldingCredit)) && new Set(value).size === value.length;
}

/** 주자 역할에서 우리 아이의 위치. 베이스, 득점, 아웃 */
export type ChildPosition = BaseIndex | 'scored' | 'out';

interface EventBase {
  readonly id: string;
  readonly createdAt: string;
  readonly author: string;
}

export interface PitchEvent extends EventBase {
  readonly kind: 'pitch';
  readonly result: PitchResult;
  /** result가 'hit'일 때 안타 종류 */
  readonly hitType?: HitType;
  /** 투구 상세 (켜 두었을 때만): 구종, 존 통과 지점, 구속(km/h) */
  readonly pitchType?: PitchType;
  readonly zone?: ZonePoint;
  readonly speed?: number;
  /** 친 공(안타·아웃·실책 출루)의 낙구 지점과 질 */
  readonly battedBall?: BattedBall;
  /** 수비 중인 우리 아이가 이 타구에서 받은 기록 (고른 것만) */
  readonly fielding?: readonly FieldingCredit[];
  /** 병살: result가 'out'일 때 타자와 함께 아웃된 주자가 있던 베이스 */
  readonly doublePlay?: BaseIndex;
  /** 희생번트·희생플라이·진루타: result가 'out'일 때 아웃의 종류 */
  readonly outType?: OutType;
}

export interface PlayEvent extends EventBase {
  readonly kind: 'play';
  readonly play: PlayKind;
  /** 견제한 베이스, 또는 도루한 주자가 있던 베이스 */
  readonly base?: BaseIndex;
  /** 수비 중인 우리 아이가 이 플레이에서 받은 기록 (고른 것만) */
  readonly fielding?: readonly FieldingCredit[];
}

/** 사용자가 이닝·아웃·주자를 직접 고친 기록 */
export interface AdjustEvent extends EventBase {
  readonly kind: 'adjust';
  readonly inning: number;
  readonly outs: number;
  readonly bases: Bases;
  /** 고치는 동안 홈에 들어온 점수 (예: 실책으로 주자 득점) */
  readonly runs?: number;
  /** 주자 장면에서 우리 아이가 어디로 갔는지 */
  readonly child?: ChildPosition;
}

/** 우리 아이가 장면에 등장. 그때의 이닝·아웃·주자·카운트로 상황을 맞추고 시작한다. */
export interface AppearanceEvent extends EventBase {
  readonly kind: 'appearance';
  readonly role: Role;
  readonly inning: number;
  readonly outs: number;
  readonly bases: Bases;
  readonly balls: number;
  readonly strikes: number;
  /** 주자 역할일 때 아이가 있는 베이스 */
  readonly childBase?: BaseIndex;
  /** 수비 역할일 때 포지션 */
  readonly position?: Position;
}

/** 타자가 서는 쪽: 오른쪽 타석(우타) / 왼쪽 타석(좌타) */
export type BatterHand = 'right' | 'left';

export const BATTER_HANDS: readonly BatterHand[] = ['right', 'left'];

/** 학년으로 고를 수 있는 범위 (초등 1~6, 중·고 1~3을 함께 쓴다) */
export const GRADE_MIN = 1;
export const GRADE_MAX = 6;

/** 지금 타석에 선 타자 정보 (상대 타자). 고른 것만 남기고, 모르면 비운다. 다음 타자에게는 이어지지 않는다. */
export interface BatterEvent extends EventBase {
  readonly kind: 'batter';
  readonly hand?: BatterHand;
  readonly grade?: number;
}

/** 경기 기록을 마침 (4~5회에 끝나는 경기 등). 뒤에 새 장면을 시작하면 다시 이어서 기록한다. */
export interface GameEndEvent extends EventBase {
  readonly kind: 'gameEnd';
}

/** 우리 아이가 교체되어 빠짐. 지금 장면의 기록을 끝낸다. */
export interface ExitEvent extends EventBase {
  readonly kind: 'exit';
}

/** 스코어보드에 직접 넣은 점수. 같은 팀·이닝은 마지막 값을 쓴다. */
export interface ScoreEvent extends EventBase {
  readonly kind: 'score';
  readonly team: Team;
  readonly inning: number;
  readonly runs: number;
}

/** 스코어보드 합계 칸(R 점수 · H 안타 · E 실책)에 직접 넣은 값. 넣으면 기록에서 센 값보다 우선한다. */
export type TotalField = 'runs' | 'hits' | 'errors';

export const TOTAL_FIELDS: readonly TotalField[] = ['runs', 'hits', 'errors'];

export interface TeamTotalEvent extends EventBase {
  readonly kind: 'teamTotal';
  readonly team: Team;
  readonly field: TotalField;
  readonly value: number;
}

export interface GameInfoEvent extends EventBase {
  readonly kind: 'gameInfo';
  /** YYYY-MM-DD */
  readonly date: string;
  readonly opponent: string;
  readonly gameType: GameType;
  /** 예전 기록용: 아이가 던지기 시작한 이닝 */
  readonly startInning?: number;
  /** 우리 팀이 먼저 공격(초)인지. 없으면 후공으로 본다. */
  readonly battingFirst?: Team;
  /** 홈 / 원정. 없으면 선공은 원정, 후공은 홈으로 본다. */
  readonly venue?: Venue;
  /** 우리 팀 이름. 없거나 비어 있으면 "우리 팀" */
  readonly ourTeam?: string;
}

export interface VoidEvent extends EventBase {
  readonly kind: 'void';
  readonly targetId: string;
}

/**
 * 지난 공을 고친 기록. 원래 공은 그대로 두고 이 기록을 덧붙인다. (CLAUDE.md 5.3)
 * 다시 계산할 때 원래 공에 고친 기록을 순서대로 겹쳐 쓴다.
 * - result(·hitType): 결과를 고침. 없으면 결과는 그대로
 * - pitchType · zone · speed: 투구 상세를 고침. 없으면 그대로, null이면 지움
 */
export interface EditEvent extends EventBase {
  readonly kind: 'edit';
  readonly targetId: string;
  readonly result?: PitchResult;
  readonly hitType?: HitType;
  readonly pitchType?: PitchType | null;
  readonly zone?: ZonePoint | null;
  readonly speed?: number | null;
}

export type LogEvent =
  | PitchEvent
  | PlayEvent
  | AdjustEvent
  | AppearanceEvent
  | ExitEvent
  | BatterEvent
  | GameEndEvent
  | ScoreEvent
  | TeamTotalEvent
  | GameInfoEvent
  | VoidEvent
  | EditEvent;

/** 경기 진행에 영향을 주는 이벤트 */
export type PlayLogEvent = PitchEvent | PlayEvent | AdjustEvent | AppearanceEvent | ExitEvent | BatterEvent | GameEndEvent;

/** 취소할 수 있는 이벤트 */
export type UndoableEvent = PlayLogEvent | ScoreEvent | TeamTotalEvent;

/** 투구 상세 고침: 넣은 값은 바꾸고, null은 지우고, 없는 항목은 그대로 둔다. */
function applyDetailEdit(pitch: PitchEvent, edit: EditEvent): PitchEvent {
  const next: Record<string, unknown> = { ...pitch };
  for (const key of ['pitchType', 'zone', 'speed'] as const) {
    const value = edit[key];
    if (value === null) delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  return next as unknown as PitchEvent;
}

/** 고친 공: 결과·안타 종류를 바꾸고, 바뀐 결과와 맞지 않는 정보(병살·아웃 종류·타구)는 뺀다. */
function applyEdit(pitch: PitchEvent, edit: EditEvent): PitchEvent {
  const detailed = applyDetailEdit(pitch, edit);
  if (edit.result === undefined) return detailed;
  return applyResultEdit(detailed, { ...edit, result: edit.result });
}

function applyResultEdit(pitch: PitchEvent, edit: EditEvent & { result: PitchResult }): PitchEvent {
  const { hitType: _hit, doublePlay, outType, battedBall, ...rest } = pitch;
  const stillOut = edit.result === 'out' && pitch.result === 'out';
  const batted = edit.result === 'hit' || edit.result === 'out' || edit.result === 'reachedOnError';
  return {
    ...rest,
    result: edit.result,
    ...(edit.result === 'hit' ? { hitType: edit.hitType ?? 'single' } : {}),
    ...(stillOut && doublePlay !== undefined ? { doublePlay } : {}),
    ...(stillOut && outType !== undefined ? { outType } : {}),
    ...(batted && battedBall !== undefined ? { battedBall } : {}),
  };
}

/** 취소되지 않은 이벤트(경기 정보·취소·고침 제외)만 입력 순서대로 돌려준다. 고친 공은 고친 결과로 바꿔 준다. */
export function activeEvents(events: readonly LogEvent[]): UndoableEvent[] {
  const voided = new Set(
    events.filter((e): e is VoidEvent => e.kind === 'void').map((e) => e.targetId),
  );
  // 같은 공을 여러 번 고치면(결과 · 상세 따로) 입력 순서대로 겹쳐 쓴다.
  const edits = new Map<string, EditEvent[]>();
  for (const e of events) if (e.kind === 'edit' && !voided.has(e.id)) edits.set(e.targetId, [...(edits.get(e.targetId) ?? []), e]);
  return events
    .filter((e): e is UndoableEvent => e.kind !== 'gameInfo' && e.kind !== 'void' && e.kind !== 'edit' && !voided.has(e.id))
    .map((e) => (e.kind === 'pitch' ? (edits.get(e.id) ?? []).reduce(applyEdit, e) : e));
}

export function playEvents(events: readonly UndoableEvent[]): PlayLogEvent[] {
  return events.filter((e): e is PlayLogEvent => e.kind !== 'score' && e.kind !== 'teamTotal');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCount(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export const MAX_INNING = 30;
/** 한 번에 넣을 수 있는 점수의 상한 (입력 실수 방지) */
export const MAX_RUNS = 99;

function isBases(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'boolean');
}

function isUnit(value: unknown): boolean {
  return typeof value === 'number' && value >= 0 && value <= 1;
}

function isUnitPoint(value: unknown): boolean {
  return isObject(value) && isUnit(value.x) && isUnit(value.y);
}

function isBattedBall(value: unknown): boolean {
  return (
    isObject(value) &&
    (value.x === null || isUnit(value.x)) &&
    (value.y === null || isUnit(value.y)) &&
    (value.type === null || BATTED_BALL_TYPES.includes(value.type as BattedBallType)) &&
    (value.strength === null || BATTED_BALL_STRENGTHS.includes(value.strength as BattedBallStrength))
  );
}

function isChildPosition(value: unknown): boolean {
  return value === 'scored' || value === 'out' || isCount(value, 0, 2);
}


/** 저장소에서 읽은 값이 올바른 이벤트인지 확인한다. (CLAUDE.md 4.2) */
export function isLogEvent(value: unknown): value is LogEvent {
  if (!isObject(value)) return false;
  if (typeof value.id !== 'string' || typeof value.createdAt !== 'string' || typeof value.author !== 'string') {
    return false;
  }
  switch (value.kind) {
    case 'pitch':
      return (
        PITCH_RESULTS.includes(value.result as PitchResult) &&
        (value.hitType === undefined || HIT_TYPES.includes(value.hitType as HitType)) &&
        (value.pitchType === undefined || PITCH_TYPES.includes(value.pitchType as PitchType)) &&
        (value.zone === undefined || isUnitPoint(value.zone)) &&
        (value.speed === undefined || isCount(value.speed, SPEED_MIN, SPEED_MAX)) &&
        (value.battedBall === undefined || isBattedBall(value.battedBall)) &&
        (value.fielding === undefined || isFieldingCredits(value.fielding)) &&
        (value.doublePlay === undefined || (value.result === 'out' && isCount(value.doublePlay, 0, 2))) &&
        (value.outType === undefined ||
          (value.result === 'out' && value.doublePlay === undefined && OUT_TYPES.includes(value.outType as OutType)))
      );
    case 'play':
      return (
        PLAY_KINDS.includes(value.play as PlayKind) &&
        (value.base === undefined || isCount(value.base, 0, 2)) &&
        (value.fielding === undefined || isFieldingCredits(value.fielding))
      );
    case 'adjust':
      return (
        isCount(value.inning, 1, MAX_INNING) &&
        isCount(value.outs, 0, OUTS_PER_INNING) &&
        isBases(value.bases) &&
        (value.runs === undefined || isCount(value.runs, 0, MAX_RUNS)) &&
        (value.child === undefined || isChildPosition(value.child))
      );
    case 'appearance':
      return (
        ROLES.includes(value.role as Role) &&
        isCount(value.inning, 1, MAX_INNING) &&
        isCount(value.outs, 0, OUTS_PER_INNING - 1) &&
        isBases(value.bases) &&
        isCount(value.balls, 0, MAX_BALLS_IN_COUNT) &&
        isCount(value.strikes, 0, MAX_STRIKES_IN_COUNT) &&
        (value.childBase === undefined || isCount(value.childBase, 0, 2)) &&
        (value.position === undefined || POSITIONS.includes(value.position as Position))
      );
    case 'exit':
    case 'gameEnd':
      return true;
    case 'batter':
      return (
        (value.hand === undefined || BATTER_HANDS.includes(value.hand as BatterHand)) &&
        (value.grade === undefined || isCount(value.grade, GRADE_MIN, GRADE_MAX))
      );
    case 'score':
      return (
        (value.team === 'us' || value.team === 'them') &&
        isCount(value.inning, 1, MAX_INNING) &&
        isCount(value.runs, 0, MAX_RUNS)
      );
    case 'teamTotal':
      return (
        (value.team === 'us' || value.team === 'them') &&
        TOTAL_FIELDS.includes(value.field as TotalField) &&
        isCount(value.value, 0, MAX_RUNS)
      );
    case 'gameInfo':
      return (
        typeof value.date === 'string' &&
        typeof value.opponent === 'string' &&
        STORED_GAME_TYPES.includes(value.gameType as GameType) &&
        (value.startInning === undefined || isCount(value.startInning, 1, MAX_INNING)) &&
        (value.battingFirst === undefined || value.battingFirst === 'us' || value.battingFirst === 'them') &&
        (value.venue === undefined || value.venue === 'home' || value.venue === 'away') &&
        (value.ourTeam === undefined || (typeof value.ourTeam === 'string' && value.ourTeam.length <= TEAM_NAME_MAX_LENGTH))
      );
    case 'void':
      return typeof value.targetId === 'string';
    case 'edit':
      return (
        typeof value.targetId === 'string' &&
        (value.result === undefined || PITCH_RESULTS.includes(value.result as PitchResult)) &&
        (value.hitType === undefined || (value.result === 'hit' && HIT_TYPES.includes(value.hitType as HitType))) &&
        (value.pitchType === undefined || value.pitchType === null || PITCH_TYPES.includes(value.pitchType as PitchType)) &&
        (value.zone === undefined || value.zone === null || isUnitPoint(value.zone)) &&
        (value.speed === undefined || value.speed === null || isCount(value.speed, SPEED_MIN, SPEED_MAX))
      );
    default:
      return false;
  }
}
