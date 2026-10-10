// 분석 화면 조각 (투수·타자·수비 분석이 함께 쓴다): 범위·탭 고르기, 결과 카드, 계산 과정 카드, 카운트 표

import { Calculation, formatSources } from './calculation';
import { Count, countLabel } from './count';
import { h, segmented } from './dom';
import { DrawPoint, LegendItem, chartCard, fieldSvg, zoneSvg } from './field-view';
import { ANALYSIS_SCOPE_LABEL } from './labels';

export type AnalysisTab = 'result' | 'process';
export type AnalysisScope = 'game' | 'all';

export interface AnalysisActions {
  scope: (s: AnalysisScope) => void;
  tab: (t: AnalysisTab) => void;
  /** "선택한 경기"에서 볼 경기 고르기 */
  pickGame: (id: string) => void;
  /** 고를 수 있는 경기 [id, 이름] (최근 경기 먼저)와 지금 고른 경기 */
  readonly gameOptions: readonly [string, string][];
  readonly selectedGameId: string;
  /** "전체"에서 뺀 경기 수 (미니게임·기타) */
  readonly excludedGames: number;
}

/** 볼 경기를 고르는 목록. 휴대폰 기본 고르기 창이 떠서 키보드가 올라오지 않는다. */
function gamePicker(actions: AnalysisActions): HTMLElement {
  const select = h(
    'select',
    { attrs: { id: 'analysis-game', 'aria-label': '볼 경기 고르기' } },
    actions.gameOptions.map(([id, label]) => {
      const option = h('option', { text: label, attrs: { value: id } });
      option.selected = id === actions.selectedGameId;
      return option;
    }),
  );
  select.addEventListener('change', () => actions.pickGame(select.value));
  return h('label', { className: 'game-picker', attrs: { for: 'analysis-game' } }, ['볼 경기', select]);
}

export interface Section {
  readonly title: string;
  readonly items: readonly Calculation[];
}

export interface CountTableRow {
  readonly count: Count;
  readonly plateAppearances: Calculation;
  readonly rate: Calculation;
}

export function analysisHeader(totalGames: number, scope: AnalysisScope, tab: AnalysisTab, actions: AnalysisActions): (HTMLElement | null)[] {
  return [
    segmented<AnalysisScope>(
      [
        ['game', ANALYSIS_SCOPE_LABEL.game],
        ['all', `${ANALYSIS_SCOPE_LABEL.all} ${totalGames}경기`],
      ],
      scope,
      actions.scope,
      'scope-tabs',
    ),
    scope === 'game' ? gamePicker(actions) : null,
    scope === 'all' && actions.excludedGames > 0
      ? h('p', { className: 'help', text: `미니게임 · 기타 ${actions.excludedGames}경기는 빼고 셌어요.` })
      : null,
    segmented<AnalysisTab>(
      [
        ['result', '결과'],
        ['process', '계산 과정'],
      ],
      tab,
      actions.tab,
      'subtabs',
    ),
  ];
}

/** 계산 과정 카드: ① 공식 ② 들어간 숫자(출처) ③ 결과 (CLAUDE.md 5.2) */
export function processCard(c: Calculation): HTMLElement {
  return h('article', { className: 'process' }, [
    h('h3', { text: c.title }),
    h('p', {}, [h('b', { text: '① 공식 ' }), c.formula]),
    h('p', {}, [h('b', { text: '② 들어간 숫자 ' }), c.expression]),
    h(
      'ul',
      {},
      c.terms.map((t) => h('li', {}, [`${t.label}: ${t.value}`, h('small', { text: ` (${formatSources(t.sources)})` })])),
    ),
    h('p', {}, [h('b', { text: '③ 결과 ' }), c.display]),
    c.note ? h('p', { className: 'note', text: c.note }) : null,
  ]);
}

export function resultCards(section: Section): HTMLElement[] {
  return [
    h('h2', { text: section.title }),
    h(
      'div',
      { className: 'cards' },
      section.items.map((c) => h('div', { className: 'card' }, [h('small', { text: c.title }), h('strong', { text: c.display })])),
    ),
  ];
}

export function countTable(rows: readonly CountTableRow[], rateTitle: string): HTMLElement {
  if (rows.length === 0) return h('p', { className: 'empty', text: '끝난 타석이 없습니다.' });
  return h('div', { className: 'table-wrap' }, [
    h('table', {}, [
      h('thead', {}, [h('tr', {}, [h('th', { text: '카운트' }), h('th', { text: '타석' }), h('th', { text: rateTitle })])]),
      h(
        'tbody',
        {},
        rows.map((row) =>
          h('tr', {}, [
            h('td', { text: countLabel(row.count) }),
            h('td', { text: row.plateAppearances.display }),
            h('td', { text: row.rate.display }),
          ]),
        ),
      ),
    ]),
  ]);
}

const ZONE_LEGEND: readonly LegendItem[] = [
  { kind: 'strike', label: '스트라이크·파울' },
  { kind: 'ball', label: '볼' },
  { kind: 'inPlay', label: '친 공' },
];

const SPRAY_LEGEND: readonly LegendItem[] = [
  { kind: 'hit', label: '안타' },
  { kind: 'out', label: '아웃' },
  { kind: 'error', label: '실책 출루' },
];

/** 존 분포·타구 분포 그림 두 장 */
export function chartCards(zone: readonly DrawPoint[], spray: readonly DrawPoint[], zoneTitle: string, sprayTitle: string): HTMLElement {
  return h('div', { className: 'chart-grid' }, [
    chartCard(zoneTitle, zoneSvg({ points: zone, label: `${zoneTitle} ${zone.length}개`, batters: { highlight: null } }), ZONE_LEGEND, `존을 찍은 공 ${zone.length}개 · 가운데 네모가 스트라이크 존 (포수 쪽에서 본 모습)`),
    chartCard(sprayTitle, fieldSvg({ points: spray, label: `${sprayTitle} ${spray.length}개` }), SPRAY_LEGEND, `낙구 지점을 찍은 타구 ${spray.length}개`),
  ]);
}

export interface TableColumn<T> {
  readonly title: string;
  readonly value: (row: T) => string;
}

/** 간단한 표 (구종별 기록 등) */
export function dataTable<T>(rows: readonly T[], columns: readonly TableColumn<T>[], empty: string): HTMLElement {
  if (rows.length === 0) return h('p', { className: 'empty', text: empty });
  return h('div', { className: 'table-wrap' }, [
    h('table', {}, [
      h('thead', {}, [h('tr', {}, columns.map((c) => h('th', { text: c.title })))]),
      h('tbody', {}, rows.map((row) => h('tr', {}, columns.map((c) => h('td', { text: c.value(row) }))))),
    ]),
  ]);
}
