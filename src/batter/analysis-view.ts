// 타자 분석 화면: 아이가 타자·주자로 나온 장면만 (CLAUDE.md 0.5)

import { AnalysisActions, AnalysisScope, AnalysisTab, analysisHeader, chartCards, countTable, processCard, resultCards } from '../common/analysis-ui';
import { h } from '../common/dom';
import { GameForStats } from '../common/stat-base';
import { BatterSummary, END_COUNT_BASIS, summarize } from './stats';

/** 아이가 타자·주자로 나온 기록이 하나라도 있는지 */
export function hasBatterData(summary: BatterSummary): boolean {
  return summary.sections[1].items[0].value !== 0 || summary.sections[2].items.some((c) => c.value !== 0);
}

/** "결과" 탭 본문. 분석 리포트(PDF)도 같은 화면 조각을 쓴다. */
export function batterResultContent(summary: BatterSummary): HTMLElement[] {
  return [
    ...summary.sections.flatMap(resultCards),
    h('h2', { text: '그림으로 보기' }),
    chartCards(summary.charts.zone, summary.charts.spray, '본 공 존 분포', '친 타구 분포'),
    h('h2', { text: '카운트별 타율' }),
    h('p', { className: 'basis', text: END_COUNT_BASIS }),
    countTable(
      summary.byCount.map((r) => ({ count: r.count, plateAppearances: r.plateAppearances, rate: r.battingAverage })),
      '타율',
    ),
  ];
}

export function batterAnalysisView(
  games: readonly GameForStats[],
  totalGames: number,
  scope: AnalysisScope,
  tab: AnalysisTab,
  actions: AnalysisActions,
): HTMLElement {
  const summary = summarize(games);
  const header = analysisHeader(totalGames, scope, tab, actions);
  const empty = !hasBatterData(summary) ? h('p', { className: 'empty', text: '아직 아이가 타자·주자로 나온 기록이 없습니다.' }) : null;

  if (tab === 'process') {
    return h('section', { className: 'analysis' }, [
      ...header,
      empty,
      ...summary.sections.flatMap((section) => [h('h2', { text: section.title }), ...section.items.map(processCard)]),
      h('h2', { text: '카운트별 타율' }),
      h('p', { className: 'basis', text: END_COUNT_BASIS }),
      ...summary.byCount.map((row) => processCard(row.battingAverage)),
    ]);
  }

  return h('section', { className: 'analysis' }, [...header, empty, ...batterResultContent(summary)]);
}
