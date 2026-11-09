import { describe, expect, it } from 'vitest';
import { GameInfo } from './game';
import { boardMessage, overlaySnapshot } from './input-view';
import { lineScore } from './line-score';
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

describe('영상 위 상황판 내용', () => {
  const info: GameInfo = { date: '2026-11-09', opponent: '한빛', gameType: 'practice', battingFirst: 'them', venue: 'home', ourTeam: '', place: '' };

  it('투수 장면: 볼 2 · 스트라이크 1이면 그대로, 투구 수는 3, 방금 공은 마지막 기록', () => {
    const events = [appear('pitcher'), ...pitches('ball', 'strike', 'ball')];
    const replay = replayGame(events, settings());
    const snap = overlaySnapshot({ replay, info, score: lineScore(replay, events), events });
    expect(snap.inningText).toBe('1회초');
    expect(snap.roleText).toBe('투수');
    expect([snap.balls, snap.strikes, snap.outs]).toEqual([2, 1, 0]);
    expect(snap.workload).toBe('투구 3');
    expect([snap.themName, snap.usName, snap.themRuns, snap.usRuns]).toEqual(['한빛', '우리 팀', 0, 0]);
    expect(snap.lastEvent?.id).toBe(events[events.length - 1].id);
  });

  it('장면이 끝나면 카운트 0, 이닝 글자 없음', () => {
    const events = [appear('batter', { outs: 2 }), ...pitches('out')];
    const replay = replayGame(events, settings());
    const snap = overlaySnapshot({ replay, info, score: lineScore(replay, events), events });
    expect(snap.inningText).toBeNull();
    expect([snap.balls, snap.strikes, snap.outs]).toEqual([0, 0, 0]);
    expect(snap.workload).toBeNull();
  });
});
