import { describe, expect, it } from 'vitest';
import { paginate, reportPdfName, screenJpegName } from './report-view';
import { barLengths } from './analysis-ui';

describe('리포트 쪽 나누기', () => {
  it('한 쪽 높이를 넘으면 다음 쪽으로 넘긴다', () => {
    expect(paginate([400, 400, 400], [false, false, false], [false, false, false], 1000)).toEqual([[0, 1], [2]]);
  });

  it('제목은 다음 덩어리와 같은 쪽에 둔다 (쪽 끝에 제목만 남지 않게)', () => {
    expect(paginate([700, 50, 400], [false, true, false], [false, false, false], 1000)).toEqual([[0], [1, 2]]);
  });

  it('투수 · 타자 · 수비 첫머리는 새 쪽에서 시작한다', () => {
    expect(paginate([100, 50, 100], [false, true, false], [false, true, false], 1000)).toEqual([[0], [1, 2]]);
  });

  it('한 덩어리가 쪽보다 커도 빠뜨리지 않는다', () => {
    expect(paginate([1500, 100], [false, false], [false, false], 1000)).toEqual([[0], [1]]);
  });

  it('덩어리가 없으면 쪽도 없다', () => {
    expect(paginate([], [], [], 1000)).toEqual([]);
  });
});

describe('막대 길이', () => {
  it('비율은 1(10할)을 끝으로: .300 → 30%', () => {
    expect(barLengths([0.3, 0.5], 'rate')).toEqual([0.3, 0.5]);
  });

  it('비율이 1을 넘으면(OPS 등) 가장 큰 값을 끝으로', () => {
    expect(barLengths([1.5, 3], 'rate')).toEqual([0.5, 1]);
  });

  it('개수는 가장 큰 값을 끝으로, 계산할 수 없는 값은 null, 모두 0이면 0', () => {
    expect(barLengths([2, 4, null], 'count')).toEqual([0.5, 1, null]);
    expect(barLengths([0, 0], 'count')).toEqual([0, 0]);
  });
});

describe('리포트 파일 이름', () => {
  it('범위와 날짜를 넣는다', () => {
    expect(reportPdfName('선택한경기', '2026-10-11')).toBe('분석리포트_선택한경기_20261011.pdf');
    expect(screenJpegName('투수', '전체', '2026-10-11')).toBe('분석화면_투수_전체_20261011.jpg');
  });
});
