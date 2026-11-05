// 주자 이동 규칙. 주자 하나하나를 따라가서 "우리 아이"가 어디 있는지도 함께 계산한다.
// 확실히 정해지는 이동(밀어내기, 안타 종류만큼 진루, 와일드피치 한 베이스, 도루)만 자동으로 처리하고,
// 그 밖의 경우(주자가 더 뛴 경우, 실책 등)는 사용자가 "상황 고치기"로 맞춘다.

import { OUTS_PER_INNING } from './count';
import { BaseIndex, Bases, OutType } from './events';

/** 3루 다음은 홈 */
const HOME = 3;
const FIRST_BASE: BaseIndex = 0;

export interface Runner {
  readonly base: BaseIndex;
  /** 우리 아이인지 */
  readonly child: boolean;
  /** 실책으로 나간 주자인지. 이 주자의 득점은 비자책점이다. */
  readonly byError?: boolean;
}

export type Runners = readonly Runner[];

export interface Advance {
  readonly runners: Runners;
  /** 홈에 들어온 주자 수 */
  readonly runs: number;
  /** 그중 실책으로 나간 주자의 득점 (비자책점) */
  readonly unearnedRuns: number;
  readonly childScored: boolean;
}

export function toBases(runners: Runners): Bases {
  return [0, 1, 2].map((b) => runners.some((r) => r.base === b)) as unknown as Bases;
}

/** 베이스 상태에서 주자 목록을 만든다. childBase에 있는 주자가 우리 아이다. */
export function fromBases(bases: Bases, childBase: BaseIndex | null = null): Runners {
  return ([0, 1, 2] as const).filter((b) => bases[b]).map((b) => ({ base: b, child: b === childBase }));
}

export function childBaseOf(runners: Runners): BaseIndex | null {
  return runners.find((r) => r.child)?.base ?? null;
}

/** 주자를 지정한 만큼 옮긴다. 홈을 지나면 득점 */
function move(runners: Runners, shouldMove: (r: Runner) => boolean, count: number): Advance {
  const next: Runner[] = [];
  let runs = 0;
  let unearnedRuns = 0;
  let childScored = false;
  for (const r of runners) {
    if (!shouldMove(r)) {
      next.push(r);
      continue;
    }
    const target = r.base + count;
    if (target >= HOME) {
      runs += 1;
      if (r.byError) unearnedRuns += 1;
      childScored ||= r.child;
    } else {
      next.push({ ...r, base: target as BaseIndex });
    }
  }
  next.sort((a, b) => a.base - b.base);
  return { runners: next, runs, unearnedRuns, childScored };
}

function addBatter(advance: Advance, base: number, batterIsChild: boolean, byError = false): Advance {
  if (base >= HOME) {
    return {
      runners: advance.runners,
      runs: advance.runs + 1,
      unearnedRuns: advance.unearnedRuns + (byError ? 1 : 0),
      childScored: advance.childScored || batterIsChild,
    };
  }
  const batter: Runner = byError ? { base: base as BaseIndex, child: batterIsChild, byError } : { base: base as BaseIndex, child: batterIsChild };
  const runners = [...advance.runners, batter].sort((a, b) => a.base - b.base);
  return { ...advance, runners };
}

/** 타자가 1루로 나갈 때 밀려나는 주자만 한 베이스씩 이동한다. (볼넷·몸에 맞는 공) */
export function forceAdvance(runners: Runners, batterIsChild = false): Advance {
  const on = (b: number): boolean => runners.some((r) => r.base === b);
  const forced = new Set<number>();
  if (on(0)) {
    forced.add(0);
    if (on(1)) {
      forced.add(1);
      if (on(2)) forced.add(2);
    }
  }
  return addBatter(move(runners, (r) => forced.has(r.base), 1), FIRST_BASE, batterIsChild);
}

/** 모든 주자가 count 베이스씩 이동한다. (와일드피치는 1) */
export function advanceRunners(runners: Runners, count: number): Advance {
  return move(runners, () => true, count);
}

/** 타자가 batterBases 베이스를 가고, 주자도 같은 수만큼 간다. (안타 종류, 실책 출루: byError) */
export function batterAdvance(runners: Runners, batterBases: number, batterIsChild = false, byError = false): Advance {
  return addBatter(advanceRunners(runners, batterBases), batterBases - 1, batterIsChild, byError);
}

/** 상황 고치기로 베이스를 다시 정할 때, 같은 베이스에 남은 주자의 "실책으로 나감" 표시는 이어 준다. */
export function keepErrorMarks(previous: Runners, next: Runners): Runners {
  return next.map((r) => (previous.some((p) => p.base === r.base && p.byError) ? { ...r, byError: true } : r));
}

/**
 * 희생타·진루타로 아웃될 때 주자 이동.
 * - 희생플라이: 3루 주자가 홈인 (희생플라이의 정의). 다른 주자는 그대로
 * - 희생번트·진루타: 모든 주자가 한 베이스씩. 다르게 움직였으면 사용자가 "상황 고치기"로 맞춘다.
 */
export function outTypeAdvance(runners: Runners, outType: OutType): Advance {
  if (outType === 'sacrificeFly') return move(runners, (r) => r.base === 2, 1);
  return advanceRunners(runners, 1);
}

/** 고를 수 있는 아웃 종류: 2아웃이면 없음(타자 아웃으로 이닝 끝), 희생플라이는 3루 주자가 있을 때만 */
export function outTypeOptions(bases: Bases, outs: number): OutType[] {
  if (outs >= OUTS_PER_INNING - 1 || !hasRunner(bases)) return [];
  return bases[2] ? ['sacrificeBunt', 'sacrificeFly', 'productive'] : ['sacrificeBunt', 'productive'];
}

/** 도루 성공: 그 주자만 한 베이스 이동. 3루 주자면 홈 도루로 득점. */
export function stealAdvance(runners: Runners, base: BaseIndex): Advance {
  return move(runners, (r) => r.base === base, 1);
}

export function removeRunner(runners: Runners, base: BaseIndex): { runners: Runners; removedChild: boolean } {
  return {
    runners: runners.filter((r) => r.base !== base),
    removedChild: runners.some((r) => r.base === base && r.child),
  };
}

export function hasRunner(bases: Bases): boolean {
  return bases.some(Boolean);
}

/** 이 주자 바로 앞에 이어 서 있는 주자들 (앞 주자 먼저). 예: 1·2루에서 1루 주자 → [2루] */
export function runnersAhead(bases: Bases, base: BaseIndex): BaseIndex[] {
  const ahead: BaseIndex[] = [];
  for (let b = base + 1; b <= 2 && bases[b]; b += 1) ahead.unshift(b as BaseIndex);
  return ahead;
}

/**
 * 도루(성공·실패) 기록을 주자별로 나눈다. 다음 베이스에 주자가 있으면 그 앞 주자들도 함께 뛴 더블스틸·트리플스틸로 보고,
 * 앞 주자부터 차례로 도루 성공을 남긴 뒤 이 주자의 도루(성공 또는 실패)를 남긴다. (앞 주자가 먼저 비켜야 뒤 주자가 갈 수 있다)
 * 예: 1·2루에서 1루 주자 도루 → [2루 주자 도루, 1루 주자 도루]
 */
export function stealPlays(bases: Bases, base: BaseIndex, play: 'stolenBase' | 'caughtStealing'): { play: 'stolenBase' | 'caughtStealing'; base: BaseIndex }[] {
  return [...runnersAhead(bases, base).map((b) => ({ play: 'stolenBase' as const, base: b })), { play, base }];
}

export function occupiedBases(bases: Bases): BaseIndex[] {
  return ([0, 1, 2] as const).filter((b) => bases[b]);
}

export const BASE_NAMES: Record<BaseIndex, string> = { 0: '1루', 1: '2루', 2: '3루' };

/** 도루 방향. 예: "1루 → 2루", "3루 → 홈" */
export const STEAL_NAMES: Record<BaseIndex, string> = { 0: '1루 → 2루', 1: '2루 → 3루', 2: '3루 → 홈' };

/** 화면용 주자 상황. 예: "주자 1·3루", "주자 없음", "만루" */
export function basesLabel(bases: Bases): string {
  const occupied = occupiedBases(bases);
  if (occupied.length === 0) return '주자 없음';
  if (occupied.length === 3) return '만루';
  return `주자 ${occupied.map((b) => b + 1).join('·')}루`;
}
