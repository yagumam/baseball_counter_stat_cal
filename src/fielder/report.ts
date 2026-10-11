// 분석 리포트의 수비 부분: 결과 화면 조각 + 막대 그래프 (숫자는 수비 통계 함수 그대로)

import { barChart } from '../common/analysis-ui';
import { FIELDING_POSITION_LABEL } from '../common/labels';
import { ReportSection } from '../common/report-view';
import { GameForStats } from '../common/stat-base';
import { fielderResultContent } from './analysis-view';
import { assists, errors, putouts, summarize } from './stats';

export function fielderReport(games: readonly GameForStats[]): ReportSection | null {
  const summary = summarize(games);
  if (!summary.hasData) return null;
  const plays = [putouts(games), assists(games), errors(games)];
  return {
    title: '수비',
    blocks: [
      ...fielderResultContent(summary),
      barChart('잡아서 아웃 · 던져서 아웃 도움 · 실책', plays.map((c) => ({ label: c.title, calc: c })), 'count'),
      barChart('포지션별 수비율', summary.byPosition.map((r) => ({ label: FIELDING_POSITION_LABEL[r.position], calc: r.fieldingPercentage })), 'rate'),
    ],
  };
}
