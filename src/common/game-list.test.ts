import { describe, expect, it } from 'vitest';
import { GameType } from './events';
import { Game, createGame, gameInfo } from './game';
import { filterGames, sortGames } from './game-list';

function game(date: string, opponent: string, gameType: GameType = 'practice'): Game {
  return createGame({ date, opponent, gameType, battingFirst: 'them', venue: 'home', ourTeam: '' });
}

const a = game('2026-09-01', '서울 가초', 'tournament');
const b = game('2026-10-05', '부산 나초');
const c = game('2026-09-20', '');
const d = game('2026-08-10', '서울 가초', 'mini');
const opponents = (games: Game[]) => games.map((g) => gameInfo(g).opponent);

describe('경기 정렬', () => {
  it('최근 경기 먼저 / 오래된 경기 먼저', () => {
    expect(sortGames([a, b, c, d], 'newest')).toEqual([b, c, a, d]);
    expect(sortGames([a, b, c, d], 'oldest')).toEqual([d, a, c, b]);
  });

  it('상대팀 가나다순, 같은 팀은 최근 먼저, 이름 없는 경기는 맨 뒤', () => {
    expect(opponents(sortGames([c, a, b, d], 'opponent'))).toEqual(['부산 나초', '서울 가초', '서울 가초', '']);
    expect(sortGames([d, a], 'opponent')).toEqual([a, d]);
  });

  it('원래 목록은 바꾸지 않는다', () => {
    const list = [a, b];
    sortGames(list, 'oldest');
    expect(list).toEqual([a, b]);
  });
});

describe('경기 찾기', () => {
  it('상대팀 이름 일부, 띄어쓰기 무시', () => {
    expect(filterGames([a, b, c, d], '서울가', 'all')).toEqual([a, d]);
    expect(filterGames([a, b, c, d], '나 초', 'all')).toEqual([b]);
  });

  it('날짜로: 2026-09 또는 "10월 5일"', () => {
    expect(filterGames([a, b, c, d], '2026-09', 'all')).toEqual([a, c]);
    expect(filterGames([a, b, c, d], '10월 5일', 'all')).toEqual([b]);
  });

  it('경기 구분 단추와 말을 함께 쓰면 둘 다 맞는 경기만', () => {
    expect(filterGames([a, b, c, d], '', 'mini')).toEqual([d]);
    expect(filterGames([a, b, c, d], '서울', 'tournament')).toEqual([a]);
    expect(filterGames([a, b, c, d], '대회', 'all')).toEqual([a]);
  });

  it('빈 말이면 모두, 맞는 게 없으면 빈 목록', () => {
    expect(filterGames([a, b], '  ', 'all')).toEqual([a, b]);
    expect(filterGames([a, b], '광주', 'all')).toEqual([]);
  });
});
