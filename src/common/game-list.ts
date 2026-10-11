// 경기 목록의 정렬과 찾기. 화면과 떼어 두어 테스트로 확인한다.

import { GameType } from './events';
import { GAME_TYPE_LABEL, Game, dateLabel, gameInfo } from './game';

export type GameOrder = 'newest' | 'oldest' | 'opponent';

export const GAME_ORDERS: readonly GameOrder[] = ['newest', 'oldest', 'opponent'];

/** 경기 구분으로 거르기. 'all'이면 모두 */
export type GameTypeFilter = GameType | 'all';

/** 날짜가 같으면 먼저 만든 경기가 먼저 (그날 1경기·2경기 순서) */
function byDate(a: Game, b: Game): number {
  return gameInfo(a).date.localeCompare(gameInfo(b).date) || a.createdAt.localeCompare(b.createdAt);
}

export function sortGames(games: readonly Game[], order: GameOrder): Game[] {
  const sorted = [...games];
  if (order === 'oldest') return sorted.sort(byDate);
  if (order === 'opponent') {
    // 상대팀 가나다순. 이름이 없는 경기는 맨 뒤, 같은 팀끼리는 최근 경기 먼저
    return sorted.sort((a, b) => {
      const x = gameInfo(a).opponent.trim();
      const y = gameInfo(b).opponent.trim();
      if (x === '' || y === '') return (x === '' ? 1 : 0) - (y === '' ? 1 : 0) || byDate(b, a);
      return x.localeCompare(y, 'ko') || byDate(b, a);
    });
  }
  return sorted.sort((a, b) => byDate(b, a));
}

/** 띄어쓰기·대소문자를 무시하고 비교한다. ("서울 A초" = "서울a초") */
function normalize(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

/** 찾는 말이 상대팀·날짜(2026-10-05, 10월 5일)·경기 구분 중 어디에든 들어 있으면 남긴다. */
export function filterGames(games: readonly Game[], query: string, type: GameTypeFilter): Game[] {
  const words = query.split(/\s+/).map(normalize).filter((w) => w !== '');
  return games.filter((game) => {
    const info = gameInfo(game);
    if (type !== 'all' && info.gameType !== type) return false;
    const haystack = normalize([info.opponent, info.place, info.date, dateLabel(info.date), GAME_TYPE_LABEL[info.gameType]].join(' '));
    return words.every((w) => haystack.includes(w));
  });
}
