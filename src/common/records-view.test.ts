import { describe, expect, it } from 'vitest';
import { inningGroups, typeDigit } from './records-view';
import { replayGame } from './replay';
import { appear, hit, pitches } from './test-helpers';

describe('스코어보드 숫자 넣기', () => {
  it('막 열었으면 누른 숫자로 바꾸고, 이어서 누르면 두 자리가 된다', () => {
    expect(typeDigit(3, true, 1)).toBe(1);
    expect(typeDigit(1, false, 2)).toBe(12);
    expect(typeDigit(0, false, 7)).toBe(7);
  });

  it('99를 넘으면 그 숫자부터 다시 시작한다', () => {
    expect(typeDigit(12, false, 3)).toBe(3);
    expect(typeDigit(9, false, 9)).toBe(99);
  });
});

describe('이닝별 기록 (경기 순서로 묶기)', () => {
  // 선공 팀: 투수 장면을 1회말부터 3이닝 먼저 다 넣고, 나중에 타자 장면 2회초 · 5회초를 넣은 경기
  const k = () => pitches('strike', 'strike', 'strike');
  const replay = replayGame(
    [
      appear('pitcher', { inning: 1 }), ...k(), hit('single'), ...k(), ...k(),
      ...k(), ...k(), ...k(),
      ...k(), hit('single'), ...k(), ...k(),
      appear('batter', { inning: 2 }), ...pitches('ball', 'out'),
      appear('batter', { inning: 5 }), ...k(),
    ],
    { battingFirst: 'us' },
  );
  const groups = inningGroups(replay);

  it('기록한 순서와 상관없이 1회말 → 2회초 → 2회말 → 3회말 → 5회초 순서', () => {
    expect(groups.map((g) => `${g.inning}${g.half}`)).toEqual(['1bottom', '2top', '2bottom', '3bottom', '5top']);
  });

  it('3이닝 이어 던진 투수 장면이 1회말에 몰리지 않고 4 · 3 · 4타석으로 나뉜다', () => {
    expect(groups.filter((g) => g.half === 'bottom').map((g) => g.plateAppearances.length)).toEqual([4, 3, 4]);
  });

  it('장면 시작은 시작한 초 · 말에, 끝은 마지막 타석의 초 · 말에 붙는다', () => {
    expect(groups[0].started.map((s) => s.role)).toEqual(['pitcher']);
    expect(groups[3].ended.map((s) => s.role)).toEqual(['pitcher']);
    expect(groups[1].started.map((s) => s.role)).toEqual(['batter']);
    expect(groups[1].ended.map((s) => s.role)).toEqual(['batter']);
  });
});
