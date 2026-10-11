// 수비 분석 화면: 아이가 수비한 장면(투수 장면 포함)에서 아이가 받은 수비 기록만

import { AnalysisActions, AnalysisScope, AnalysisTab, analysisHeader, dataTable, processCard, resultCards } from '../common/analysis-ui';
import { h } from '../common/dom';
import { chartCard, fieldSvg } from '../common/field-view';
import { FIELDING_POSITION_LABEL } from '../common/labels';
import { GameForStats } from '../common/stat-base';
import { FielderSummary, PositionRow, summarize } from './stats';

const HANDLED_LEGEND = [
  { kind: 'out', label: '아웃 처리 (잡거나 던짐)' },
  { kind: 'error', label: '실책' },
];

/** "결과" 탭 본문. 분석 리포트(PDF)도 같은 화면 조각을 쓴다. */
export function fielderResultContent(summary: FielderSummary): HTMLElement[] {
  return [
    ...summary.sections.flatMap(resultCards),
    h('h2', { text: '포지션별' }),
    dataTable<PositionRow>(
      summary.byPosition,
      [
        { title: '자리', value: (r) => FIELDING_POSITION_LABEL[r.position] },
        { title: '이닝', value: (r) => r.innings.display },
        { title: '자살', value: (r) => r.putouts.display },
        { title: '보살', value: (r) => r.assists.display },
        { title: '실책', value: (r) => r.errors.display },
        { title: '수비율', value: (r) => r.fieldingPercentage.display },
      ],
      '아직 수비한 자리가 없습니다.',
    ),
    h('p', { className: 'basis', text: '자살 = 잡아서 아웃, 보살 = 던져서 아웃 도움' }),
    h('h2', { text: '그림으로 보기' }),
    h('div', { className: 'chart-grid single' }, [
      chartCard(
        '아이가 처리한 타구',
        fieldSvg({ points: summary.handledBalls, label: `아이가 처리한 타구 ${summary.handledBalls.length}개` }),
        HANDLED_LEGEND,
        `낙구 지점을 찍고 아이의 수비 기록을 고른 타구 ${summary.handledBalls.length}개`,
      ),
    ]),
  ];
}

export function fielderAnalysisView(
  games: readonly GameForStats[],
  totalGames: number,
  scope: AnalysisScope,
  tab: AnalysisTab,
  actions: AnalysisActions,
): HTMLElement {
  const summary = summarize(games);
  const header = analysisHeader(totalGames, scope, tab, actions);
  const empty = summary.hasData ? null : h('p', { className: 'empty', text: '아직 아이가 수비한 기록이 없습니다. 장면을 시작할 때 "투수" 또는 "투수 외 수비"를 고르세요.' });

  if (tab === 'process') {
    return h('section', { className: 'analysis' }, [
      ...header,
      empty,
      ...summary.sections.flatMap((section) => [h('h2', { text: section.title }), ...section.items.map(processCard)]),
      summary.byPosition.length > 0 ? h('h2', { text: '포지션별' }) : null,
      ...summary.byPosition.flatMap((r) => [r.innings, r.putouts, r.assists, r.errors, r.fieldingPercentage].map(processCard)),
    ]);
  }

  return h('section', { className: 'analysis' }, [...header, empty, ...fielderResultContent(summary)]);
}
