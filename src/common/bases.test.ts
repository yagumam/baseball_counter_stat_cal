import { describe, expect, it } from 'vitest';
import { advanceRunners, basesLabel, batterAdvance, forceAdvance, fromBases, outTypeAdvance, outTypeOptions, runnersAhead, stealAdvance, stealPlays, toBases } from './bases';

const on = (b1: boolean, b2: boolean, b3: boolean) => fromBases([b1, b2, b3]);

describe('주자 이동과 득점', () => {
  it('밀어내기: 만루에서만 1점', () => {
    expect(forceAdvance(on(true, true, true)).runs).toBe(1);
    expect(toBases(forceAdvance(on(false, false, true)).runners)).toEqual([true, false, true]);
    expect(toBases(forceAdvance(on(true, false, true)).runners)).toEqual([true, true, true]);
  });

  it('안타 종류만큼 진루', () => {
    expect(toBases(batterAdvance(on(true, false, true), 1).runners)).toEqual([true, true, false]);
    expect(toBases(batterAdvance(on(true, false, false), 2).runners)).toEqual([false, true, true]);
    expect(batterAdvance(on(true, true, true), 3).runs).toBe(3);
    expect(batterAdvance(on(true, true, true), 4).runs).toBe(4);
    expect(advanceRunners(on(true, true, true), 1).runs).toBe(1);
  });

  it('도루: 3루 → 홈은 득점', () => {
    expect(stealAdvance(on(false, false, true), 2).runs).toBe(1);
  });

  it('더블스틸: 다음 베이스에 주자가 있으면 앞 주자부터 함께 뛴다', () => {
    expect(runnersAhead([true, true, false], 0)).toEqual([1]);
    expect(runnersAhead([true, false, true], 0)).toEqual([]);
    expect(runnersAhead([true, true, true], 0)).toEqual([2, 1]);
    expect(stealPlays([true, true, false], 0, 'stolenBase')).toEqual([
      { play: 'stolenBase', base: 1 },
      { play: 'stolenBase', base: 0 },
    ]);
    // 앞 주자(3루)는 홈 도루 성공, 아이(2루)는 도루 실패
    expect(stealPlays([false, true, true], 1, 'caughtStealing')).toEqual([
      { play: 'stolenBase', base: 2 },
      { play: 'caughtStealing', base: 1 },
    ]);
    expect(stealPlays([true, false, false], 0, 'stolenBase')).toEqual([{ play: 'stolenBase', base: 0 }]);
  });

  it('우리 아이를 따라간다: 1루의 아이는 볼넷이면 2루, 2루타면 3루, 3루타면 득점', () => {
    const child = fromBases([true, false, false], 0);
    expect(forceAdvance(child).runners.find((r) => r.child)?.base).toBe(1);
    expect(batterAdvance(child, 2).runners.find((r) => r.child)?.base).toBe(2);
    expect(batterAdvance(child, 3).childScored).toBe(true);
  });

  it('밀려나지 않는 아이는 그대로 (2루의 아이, 볼넷)', () => {
    const child = fromBases([false, true, false], 1);
    expect(forceAdvance(child).runners.find((r) => r.child)?.base).toBe(1);
  });

  it('타자인 아이가 출루하면 주자로 표시', () => {
    expect(batterAdvance([], 1, true).runners).toEqual([{ base: 0, child: true }]);
    expect(batterAdvance([], 4, true).childScored).toBe(true);
  });

  it('화면 표기', () => {
    expect(basesLabel([false, false, false])).toBe('주자 없음');
    expect(basesLabel([true, false, true])).toBe('주자 1·3루');
    expect(basesLabel([true, true, true])).toBe('만루');
  });
});

describe('희생타 · 진루타 주자 이동', () => {
  it('희생플라이: 3루 주자만 홈인', () => {
    const sf = outTypeAdvance(on(true, false, true), 'sacrificeFly');
    expect(sf.runs).toBe(1);
    expect(toBases(sf.runners)).toEqual([true, false, false]);
  });

  it('희생번트·진루타: 모든 주자 한 베이스', () => {
    expect(toBases(outTypeAdvance(on(true, false, false), 'sacrificeBunt').runners)).toEqual([false, true, false]);
    expect(toBases(outTypeAdvance(on(false, true, false), 'productive').runners)).toEqual([false, false, true]);
  });

  it('2아웃·주자 없음이면 고를 수 없고, 희생플라이는 3루 주자가 있을 때만', () => {
    expect(outTypeOptions([true, false, false], 2)).toEqual([]);
    expect(outTypeOptions([false, false, false], 0)).toEqual([]);
    expect(outTypeOptions([true, false, false], 1)).toEqual(['sacrificeBunt', 'productive']);
    expect(outTypeOptions([false, false, true], 0)).toEqual(['sacrificeBunt', 'sacrificeFly', 'productive']);
  });
});
