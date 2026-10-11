import { describe, expect, it } from 'vitest';
import { parseAnalysisTypes } from './settings';

describe('분석 "전체" 경기 구분 기억', () => {
  it('처음(저장된 값 없음)이면 미니게임 · 기타를 뺀 기본값', () => {
    expect(parseAnalysisTypes(null)).toEqual(['practice', 'tournament', 'league']);
  });

  it('지난번에 고른 구분을 그대로 쓴다 (미니게임만 · 하나도 안 고름 포함)', () => {
    expect(parseAnalysisTypes('["mini"]')).toEqual(['mini']);
    expect(parseAnalysisTypes('["other","practice"]')).toEqual(['practice', 'other']);
    expect(parseAnalysisTypes('[]')).toEqual([]);
  });

  it('모르는 구분은 빼고, 깨진 값이면 기본값', () => {
    expect(parseAnalysisTypes('["practice","friendly"]')).toEqual(['practice']);
    expect(parseAnalysisTypes('{망가짐')).toEqual(['practice', 'tournament', 'league']);
    expect(parseAnalysisTypes('"practice"')).toEqual(['practice', 'tournament', 'league']);
  });
});
