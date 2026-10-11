// 이 휴대폰에만 기억하는 편의 설정. 기록 데이터와는 따로 둔다.

import { BatterHand, DEFAULT_ANALYSIS_GAME_TYPES, GameType, STORED_GAME_TYPES } from './events';

export type Hand = 'right' | 'left';

export const DEFAULT_HAND: Hand = 'right';

const HAND_KEY = 'baseball-counter.hand';

/** 저장된 글자를 손 설정으로. 모르는 값이면 기본값(오른손) */
export function parseHand(raw: string | null): Hand {
  return raw === 'left' || raw === 'right' ? raw : DEFAULT_HAND;
}

export function loadHand(): Hand {
  try {
    return parseHand(localStorage.getItem(HAND_KEY));
  } catch {
    return DEFAULT_HAND;
  }
}

export function saveHand(hand: Hand): void {
  try {
    localStorage.setItem(HAND_KEY, hand);
  } catch {
    // 기억하지 못해도 이번에는 고른 손으로 쓴다.
  }
}

const TEAM_NAME_KEY = 'baseball-counter.team-name';

/** 새 경기에 넣을 우리 팀 이름. 경기마다 경기 정보에 함께 저장되므로, 바꿔도 예전 경기 이름은 그대로다. */
export function loadTeamName(): string {
  try {
    return localStorage.getItem(TEAM_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveTeamName(name: string): void {
  try {
    localStorage.setItem(TEAM_NAME_KEY, name);
  } catch {
    // 기억하지 못해도 이번 경기에는 쓴다.
  }
}

/** 화면 방향: 세로로 고정 / 돌려서 쓰기(가로 화면 · 분할 화면) */
export type OrientationMode = 'portrait' | 'any';

const ORIENTATION_KEY = 'baseball-counter.orientation';

export function parseOrientation(raw: string | null): OrientationMode {
  return raw === 'any' ? 'any' : 'portrait';
}

export function loadOrientation(): OrientationMode {
  try {
    return parseOrientation(localStorage.getItem(ORIENTATION_KEY));
  } catch {
    return 'portrait';
  }
}

export function saveOrientation(mode: OrientationMode): void {
  try {
    localStorage.setItem(ORIENTATION_KEY, mode);
  } catch {
    // 기억하지 못해도 이번에는 고른 방향으로 쓴다.
  }
}

const CHILD_BATTER_HAND_KEY = 'baseball-counter.child-batter-hand';

/** 우리 아이가 서는 타석(우타·좌타). 아이가 칠 때 존 그림에 표시해 매번 고르지 않게 한다. 정하지 않았으면 null */
export function loadChildBatterHand(): BatterHand | null {
  try {
    const raw = localStorage.getItem(CHILD_BATTER_HAND_KEY);
    return raw === 'right' || raw === 'left' ? raw : null;
  } catch {
    return null;
  }
}

export function saveChildBatterHand(hand: BatterHand | null): void {
  try {
    if (hand) localStorage.setItem(CHILD_BATTER_HAND_KEY, hand);
    else localStorage.removeItem(CHILD_BATTER_HAND_KEY);
  } catch {
    // 기억하지 못해도 이번에는 고른 값으로 쓴다.
  }
}

const ANALYSIS_TYPES_KEY = 'baseball-counter.analysis-game-types';

/** 저장된 글자를 분석 "전체"의 경기 구분으로. 처음이거나 읽을 수 없으면 기본값(미니게임·기타 뺌), 모르는 구분은 뺀다. */
export function parseAnalysisTypes(raw: string | null): GameType[] {
  if (raw === null) return [...DEFAULT_ANALYSIS_GAME_TYPES];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [...DEFAULT_ANALYSIS_GAME_TYPES];
    return STORED_GAME_TYPES.filter((t) => value.includes(t));
  } catch {
    return [...DEFAULT_ANALYSIS_GAME_TYPES];
  }
}

/** 분석 "전체"에서 지난번에 고른 경기 구분 */
export function loadAnalysisTypes(): GameType[] {
  try {
    return parseAnalysisTypes(localStorage.getItem(ANALYSIS_TYPES_KEY));
  } catch {
    return [...DEFAULT_ANALYSIS_GAME_TYPES];
  }
}

export function saveAnalysisTypes(types: readonly GameType[]): void {
  try {
    localStorage.setItem(ANALYSIS_TYPES_KEY, JSON.stringify(types));
  } catch {
    // 기억하지 못해도 이번에는 고른 구분으로 쓴다.
  }
}
