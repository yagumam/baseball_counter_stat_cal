// 분석 리포트의 타자 부분: 결과 화면 조각 + 막대 그래프 (숫자는 타자 통계 함수 그대로)

import { barChart } from '../common/analysis-ui';
import { countLabel } from '../common/count';
import { ReportSection } from '../common/report-view';
import { GameForStats } from '../common/stat-base';
import { batterResultContent, hasBatterData } from './analysis-view';
import { hitByPitches, hits, strikeouts, summarize, walks } from './stats';

export function batterReport(games: readonly GameForStats[]): ReportSection | null {
  const summary = summarize(games);
  if (!hasBatterData(summary)) return null;
  const outcomes = [hits(games), walks(games), hitByPitches(games), strikeouts(games)];
  return {
    title: '타자',
    blocks: [
      ...batterResultContent(summary),
      barChart('타율 · 출루율 · 장타율 · OPS', summary.sections[0].items.map((c) => ({ label: c.title, calc: c })), 'rate'),
      barChart('타석 결과', outcomes.map((c) => ({ label: c.title, calc: c })), 'count'),
      barChart('친 타구 종류', summary.sections[3].items.map((c) => ({ label: c.title, calc: c })), 'rate'),
      barChart('카운트별 타율 (종료 카운트 기준)', summary.byCount.map((r) => ({ label: countLabel(r.count), calc: r.battingAverage })), 'rate'),
    ],
  };
}
