// 투수 분석 화면: 아이가 투수로 나온 장면만 (CLAUDE.md 0.5)

import {
  AnalysisActions,
  AnalysisScope,
  AnalysisTab,
  analysisHeader,
  chartCards,
  countTable,
  dataTable,
  processCard,
  resultCards,
} from '../common/analysis-ui';
import { PITCH_TYPE_LABEL } from '../common/labels';
import { h } from '../common/dom';
import { GameForStats } from '../common/stat-base';
import { END_COUNT_BASIS, PitchTypeRow, PitcherSummary, summarize } from './stats';

/** 아이가 투수로 던진 공이 하나라도 있는지 */
export function hasPitcherData(summary: PitcherSummary): boolean {
  return summary.sections[0].items[0].value !== 0;
}

/** "결과" 탭 본문. 분석 리포트(PDF)도 같은 화면 조각을 쓴다. */
export function pitcherResultContent(summary: PitcherSummary): HTMLElement[] {
  return [
    ...summary.sections.flatMap(resultCards),
    ...(summary.byInning.length > 0 ? resultCards({ title: '이닝별 투구 수', items: summary.byInning }) : []),
    h('h2', { text: '구종별' }),
    dataTable<PitchTypeRow>(
      summary.byPitchType,
      [
        { title: '구종', value: (r) => PITCH_TYPE_LABEL[r.pitchType] },
        { title: '투구', value: (r) => r.pitches.display },
        { title: '비율', value: (r) => r.share.display },
        { title: '스트라이크', value: (r) => r.strikeRate.display },
        { title: '평균 구속', value: (r) => r.speed.display },
      ],
      '구종을 기록한 공이 없습니다. 기록 입력에서 "투구 상세"를 켜면 구종을 남길 수 있어요.',
    ),
    h('h2', { text: '그림으로 보기' }),
    chartCards(summary.charts.zone, summary.charts.spray, '던진 공 존 분포', '맞은 타구 분포'),
    h('h2', { text: '카운트별 피안타율' }),
    h('p', { className: 'basis', text: END_COUNT_BASIS }),
    countTable(
      summary.byCount.map((r) => ({ count: r.count, plateAppearances: r.plateAppearances, rate: r.battingAverageAgainst })),
      '피안타율',
    ),
  ];
}

export function pitcherAnalysisView(
  games: readonly GameForStats[],
  totalGames: number,
  scope: AnalysisScope,
  tab: AnalysisTab,
  actions: AnalysisActions,
): HTMLElement {
  const summary = summarize(games);
  const header = analysisHeader(totalGames, scope, tab, actions);
  const empty = !hasPitcherData(summary) ? h('p', { className: 'empty', text: '아직 아이가 투수로 나온 기록이 없습니다.' }) : null;

  if (tab === 'process') {
    return h('section', { className: 'analysis' }, [
      ...header,
      empty,
      ...summary.sections.flatMap((section) => [h('h2', { text: section.title }), ...section.items.map(processCard)]),
      summary.byInning.length > 0 ? h('h2', { text: '이닝별 투구 수' }) : null,
      ...summary.byInning.map(processCard),
      summary.byPitchType.length > 0 ? h('h2', { text: '구종별' }) : null,
      ...summary.byPitchType.flatMap((r) => [r.pitches, r.share, r.strikeRate, r.speed].map(processCard)),
      h('h2', { text: '카운트별 피안타율' }),
      h('p', { className: 'basis', text: END_COUNT_BASIS }),
      ...summary.byCount.map((row) => processCard(row.battingAverageAgainst)),
    ]);
  }

  return h('section', { className: 'analysis' }, [...header, empty, ...pitcherResultContent(summary)]);
}
