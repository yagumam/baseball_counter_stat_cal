import {
  AdjustEvent,
  AppearanceEvent,
  BatterEvent,
  BatterHand,
  BaseIndex,
  Bases,
  ChildPosition,
  ExitEvent,
  ExitReason,
  GameEndEvent,
  HitType,
  PitchEvent,
  PitchResult,
  PlayEvent,
  PlayKind,
  FieldingCredit,
  Position,
  Role,
  ScoreEvent,
  TeamTotalEvent,
  TotalField,
  Team,
} from './events';
import { ReplaySettings } from './replay';

let seq = 0;

function base(): { id: string; createdAt: string; author: string } {
  seq += 1;
  return { id: `e${seq}`, createdAt: '2026-10-04T00:00:00.000Z', author: '테스트' };
}

/** 기본: 후공(우리 팀 수비가 초) */
export function settings(battingFirst: Team = 'them'): ReplaySettings {
  return { battingFirst };
}

/** 테스트용 투구 이벤트 목록 */
export function pitches(...results: PitchResult[]): PitchEvent[] {
  return results.map((result) => ({ kind: 'pitch', ...base(), result }));
}

/** 구종·존·구속·타구 등 상세가 있는 투구 */
export function pitchWith(result: PitchResult, details: Omit<PitchEvent, 'kind' | 'id' | 'createdAt' | 'author' | 'result'>): PitchEvent {
  return { kind: 'pitch', ...base(), result, ...details };
}

export function hit(hitType: HitType): PitchEvent {
  return { kind: 'pitch', ...base(), result: 'hit', hitType };
}

export function play(kind: PlayKind, baseIndex?: BaseIndex, fielding?: readonly FieldingCredit[]): PlayEvent {
  return { kind: 'play', ...base(), play: kind, ...(baseIndex === undefined ? {} : { base: baseIndex }), ...(fielding ? { fielding } : {}) };
}

export function adjust(inning: number, outs: number, bases: Bases, runs?: number, child?: ChildPosition): AdjustEvent {
  return {
    kind: 'adjust',
    ...base(),
    inning,
    outs,
    bases,
    ...(runs === undefined ? {} : { runs }),
    ...(child === undefined ? {} : { child }),
  };
}

interface AppearanceOptions {
  inning?: number;
  outs?: number;
  bases?: Bases;
  balls?: number;
  strikes?: number;
  childBase?: BaseIndex;
  position?: Position;
}

export function appear(role: Role, options: AppearanceOptions = {}): AppearanceEvent {
  return {
    kind: 'appearance',
    ...base(),
    role,
    inning: options.inning ?? 1,
    outs: options.outs ?? 0,
    bases: options.bases ?? [false, false, false],
    balls: options.balls ?? 0,
    strikes: options.strikes ?? 0,
    ...(options.childBase === undefined ? {} : { childBase: options.childBase }),
    ...(options.position === undefined ? {} : { position: options.position }),
  };
}

export function exit(reason?: ExitReason): ExitEvent {
  return { kind: 'exit', ...base(), ...(reason ? { reason } : {}) };
}

export function score(team: Team, inning: number, runs: number): ScoreEvent {
  return { kind: 'score', ...base(), team, inning, runs };
}

export function batter(hand: BatterHand | null, grade: number | null): BatterEvent {
  return { kind: 'batter', ...base(), ...(hand === null ? {} : { hand }), ...(grade === null ? {} : { grade }) };
}

export function gameEnd(): GameEndEvent {
  return { kind: 'gameEnd', ...base() };
}

export function total(team: Team, field: TotalField, value: number): TeamTotalEvent {
  return { kind: 'teamTotal', ...base(), team, field, value };
}
