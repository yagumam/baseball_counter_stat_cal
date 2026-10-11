// 분석 화면 조각 (투수·타자·수비 분석이 함께 쓴다): 범위·탭 고르기, 결과 카드, 계산 과정 카드, 카운트 표

import { Calculation, formatSources } from './calculation';
import { Count, countLabel } from './count';
import { h, segmented } from './dom';
import { DrawPoint, LegendItem, chartCard, fieldSvg, zoneSvg } from './field-view';
import { ANALYSIS_SCOPE_LABEL, REPORT_LABEL } from './labels';
import { GameType } from './events';

export type AnalysisTab = 'result' | 'process';
export type AnalysisScope = 'game' | 'all';

export interface AnalysisActions {
  scope: (s: AnalysisScope) => void;
  tab: (t: AnalysisTab) => void;
  /** "선택한 경기"에서 볼 경기 하나를 넣거나 뺀다 (여러 개) */
  toggleGame: (id: string) => void;
  /** 볼 경기 목록 펼치기·접기 */
  togglePicker: () => void;
  /** 고를 수 있는 경기 [id, 이름] (최근 경기 먼저)와 지금 고른 경기들 */
  readonly gameOptions: readonly [string, string][];
  readonly selectedGameIds: readonly string[];
  readonly pickerOpen: boolean;
  /** "전체"에서 고를 수 있는 경기 구분 [구분, 이름, 경기 수] */
  readonly typeOptions: readonly (readonly [GameType, string, number])[];
  /** "전체"에서 고른 경기 구분 (여러 개) */
  readonly selectedTypes: readonly GameType[];
  /** 경기 구분 하나를 켜거나 끈다 */
  toggleType: (type: GameType) => void;
}

/** "전체"에서 셀 경기 구분 고르기. 여러 개를 함께 켤 수 있다. */
function typeToggles(totalGames: number, actions: AnalysisActions): HTMLElement {
  return h('div', { className: 'type-toggles' }, [
    h(
      'div',
      { className: 'quick-chips', attrs: { style: `--type-count: ${actions.typeOptions.length}` } },
      actions.typeOptions.map(([type, label, count]) => {
        const on = actions.selectedTypes.includes(type);
        return h(
          'button',
          { className: on ? 'active' : '', attrs: { type: 'button', 'aria-pressed': String(on) }, onClick: () => actions.toggleType(type) },
          [label, h('small', { text: `${count}경기` })],
        );
      }),
    ),
    h('p', {
      className: 'help',
      text: actions.selectedTypes.length === 0 ? '셀 경기 구분을 하나 이상 골라 주세요.' : `고른 경기 구분 ${totalGames}경기를 모아 셌어요. 눌러서 넣고 빼면 다음에도 기억해요.`,
    }),
  ]);
}

/** 볼 경기를 고르는 목록(여러 개). 접어 두면 몇 경기를 골랐는지만 보이고, 펼치면 경기마다 넣고 뺀다. */
function gamePicker(actions: AnalysisActions): HTMLElement {
  const count = actions.selectedGameIds.length;
  return h('div', { className: 'game-picker' }, [
    h('button', {
      className: 'game-picker-toggle',
      text: `볼 경기 ${count}경기 고름 ${actions.pickerOpen ? '▴' : '▾'}`,
      attrs: { type: 'button', 'aria-expanded': String(actions.pickerOpen) },
      onClick: actions.togglePicker,
    }),
    actions.pickerOpen
      ? h(
          'div',
          { className: 'game-picker-list' },
          actions.gameOptions.map(([id, label]) => {
            const on = actions.selectedGameIds.includes(id);
            return h('button', {
              className: on ? 'active' : '',
              text: `${on ? '☑' : '☐'} ${label}`,
              attrs: { type: 'button', 'aria-pressed': String(on) },
              onClick: () => actions.toggleGame(id),
            });
          }),
        )
      : null,
    count === 0 ? h('p', { className: 'help', text: '볼 경기를 하나 이상 골라 주세요.' }) : null,
  ]);
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
        ['all', ANALYSIS_SCOPE_LABEL.all],
      ],
      scope,
      actions.scope,
      'scope-tabs',
    ),
    scope === 'game' ? gamePicker(actions) : null,
    scope === 'all' ? typeToggles(totalGames, actions) : null,
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

export interface BarRow {
  readonly label: string;
  readonly calc: Calculation;
}

/** 막대 길이 기준: 비율은 1(10할)을 끝으로(넘으면 가장 큰 값), 개수는 가장 큰 값을 끝으로 */
export type BarScale = 'rate' | 'count';

/** 막대 길이(0~1). 값이 없으면(계산할 수 없음) null */
export function barLengths(values: readonly (number | null)[], scale: BarScale): (number | null)[] {
  const known = values.filter((v): v is number => v !== null);
  const top = Math.max(scale === 'rate' ? 1 : 0, ...known);
  return values.map((v) => (v === null ? null : top === 0 ? 0 : v / top));
}

/** 가로 막대 그래프. 숫자는 표와 같은 Calculation 값을 그대로 쓴다. 그릴 값이 없으면 null */
export function barChart(title: string, rows: readonly BarRow[], scale: BarScale): HTMLElement | null {
  if (rows.length === 0 || rows.every((r) => r.calc.value === null)) return null;
  const lengths = barLengths(rows.map((r) => r.calc.value), scale);
  return h('figure', { className: 'bar-chart' }, [
    h('figcaption', { text: title }),
    ...rows.map((row, i) =>
      h('div', { className: 'bar-row' }, [
        h('span', { className: 'bar-label', text: row.label }),
        h('span', { className: 'bar-track' }, [h('span', { className: 'bar-fill', attrs: { style: `width: ${Math.round((lengths[i] ?? 0) * 100)}%` } })]),
        h('span', { className: 'bar-value', text: row.calc.display }),
      ]),
    ),
  ]);
}

/** 분석 리포트 형식: 지금 화면 그대로(JPG) · 보고서(PDF) */
export type ReportFormat = 'jpg' | 'pdf';

/** 분석 리포트 내려받기 단추 줄. 화면 그대로(JPG) 그림에는 들어가지 않는다. */
export function reportBar(busy: ReportFormat | null, enabled: boolean, onDownload: (format: ReportFormat) => void): HTMLElement {
  const button = (format: ReportFormat): HTMLElement =>
    h('button', {
      className: 'secondary',
      text: busy === format ? '만드는 중…' : REPORT_LABEL[format],
      disabled: !enabled || busy !== null,
      onClick: () => onDownload(format),
    });
  return h('div', { className: 'report-bar', attrs: { 'data-html2canvas-ignore': 'true' } }, [
    h('span', { text: REPORT_LABEL.title }),
    button('jpg'),
    button('pdf'),
  ]);
}
