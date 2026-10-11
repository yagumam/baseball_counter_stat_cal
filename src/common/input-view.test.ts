import { describe, expect, it } from 'vitest';
import { boardMessage } from './input-view';
import { replayGame } from './replay';
import { appear, pitches, settings } from './test-helpers';

describe('상황판 안내 문장', () => {
  it('미니게임: 3아웃 뒤 저절로 열린 장면이면 바뀐 초·말과 역할을 알린다', () => {
    const replay = replayGame(pitches('out', 'out', 'out'), { battingFirst: 'them', miniGame: true });
    expect(boardMessage(replay, true)).toBe('3아웃! 이제 1회말 · 아이가 타자');
  });

  it('보통 경기: 3아웃으로 끝난 장면 뒤 새 장면을 직접 시작하면 평소 안내', () => {
    const replay = replayGame([appear('batter', { outs: 2 }), ...pitches('out'), appear('pitcher', { inning: 2 })], settings());
    expect(boardMessage(replay, false)).toBe('공마다 결과 버튼을 누르세요.');
  });
});
