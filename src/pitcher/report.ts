// 분석 리포트의 투수 부분: 결과 화면 조각 + 막대 그래프 (숫자는 투수 통계 함수 그대로)

import { barChart } from '../common/analysis-ui';
import { countLabel } from '../common/count';
import { PITCH_TYPE_LABEL } from '../common/labels';
import { ReportSection } from '../common/report-view';
import { GameForStats } from '../common/stat-base';
import { hasPitcherData, pitcherResultContent } from './analysis-view';
import { hitByPitches, hitsAllowed, strikeouts, summarize, walks } from './stats';

export function pitcherReport(games: readonly GameForStats[]): ReportSection | null {
  const summary = summarize(games);
  if (!hasPitcherData(summary)) return null;
  const outcomes = [strikeouts(games), walks(games), hitByPitches(games), hitsAllowed(games)];
  return {
    title: '투수',
    blocks: [
      ...pitcherResultContent(summary),
      barChart('타자 상대 결과', outcomes.map((c) => ({ label: c.title, calc: c })), 'count'),
      barChart('이닝별 투구 수', summary.byInning.map((c) => ({ label: c.title.replace(' 투구 수', ''), calc: c })), 'count'),
      barChart('구종 비율', summary.byPitchType.map((r) => ({ label: PITCH_TYPE_LABEL[r.pitchType], calc: r.share })), 'rate'),
      barChart('맞은 타구 종류', summary.sections[3].items.map((c) => ({ label: c.title, calc: c })), 'rate'),
      barChart('카운트별 피안타율 (종료 카운트 기준)', summary.byCount.map((r) => ({ label: countLabel(r.count), calc: r.battingAverageAgainst })), 'rate'),
    ],
  };
}
