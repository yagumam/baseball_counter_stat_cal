// 분석 리포트(PDF) 내용: 표지 · 경기 목록 · 투수/타자/수비 부분.
// 숫자와 그림은 분석 화면과 같은 계산 함수·화면 조각에서 나온다. (CLAUDE.md 5.2)
// 여기서는 화면 조각을 쪽에 나눠 담을 "덩어리" 목록만 만들고, 그림 파일로 바꾸는 일은 report-export.ts가 한다.

import { h } from './dom';
import { APP_NAME } from './labels';

/** 투수 · 타자 · 수비 중 하나의 리포트 부분 */
export interface ReportSection {
  readonly title: string;
  readonly blocks: readonly (HTMLElement | null)[];
}

export interface ReportGameRow {
  readonly date: string;
  readonly opponent: string;
  readonly type: string;
  readonly place: string;
  readonly score: string;
  readonly summary: string;
}

export interface ReportModel {
  /** 어떤 경기를 모았는지. 예: "선택한 경기 3경기" */
  readonly scope: string;
  /** 만든 날. 예: "10월 11일 (일)" */
  readonly createdAt: string;
  readonly games: readonly ReportGameRow[];
  readonly sections: readonly ReportSection[];
}

/** 경기 목록 표 한 덩어리에 넣는 줄 수. 한 쪽을 넘지 않게 나눈다. */
export const GAMES_PER_TABLE = 16;

/** 쪽을 나눌 때 다음 덩어리와 붙여 두는 것(제목·설명)인지 */
export function keepsWithNext(el: HTMLElement): boolean {
  return el.tagName === 'H2' || el.classList.contains('basis') || el.classList.contains('report-section-title');
}

/** 새 쪽에서 시작하는 덩어리인지 (투수 · 타자 · 수비 부분의 첫머리) */
export function startsPage(el: HTMLElement): boolean {
  return el.classList.contains('report-section-title');
}

function gameTable(rows: readonly ReportGameRow[]): HTMLElement {
  return h('div', { className: 'table-wrap' }, [
    h('table', { className: 'report-games' }, [
      h('thead', {}, [h('tr', {}, ['날짜', '상대팀', '구분', '장소', '점수', '아이 기록'].map((t) => h('th', { text: t })))]),
      h(
        'tbody',
        {},
        rows.map((r) =>
          h('tr', {}, [r.date, r.opponent, r.type, r.place || '-', r.score, r.summary || '-'].map((t) => h('td', { text: t }))),
        ),
      ),
    ]),
  ]);
}

/** 리포트를 쪽에 나눠 담을 덩어리들 (위에서 아래 순서) */
export function reportBlocks(model: ReportModel): HTMLElement[] {
  const cover = h('header', { className: 'report-cover' }, [
    h('p', { className: 'report-app', text: APP_NAME }),
    h('h1', { text: '우리 아이 분석 리포트' }),
    h('p', { className: 'report-meta', text: `${model.scope} · 만든 날 ${model.createdAt}` }),
  ]);
  const tables: HTMLElement[] = [];
  for (let i = 0; i < model.games.length; i += GAMES_PER_TABLE) tables.push(gameTable(model.games.slice(i, i + GAMES_PER_TABLE)));
  const sections = model.sections.flatMap((section) => [
    h('h1', { className: 'report-section-title', text: section.title }),
    ...section.blocks.filter((b): b is HTMLElement => b !== null),
  ]);
  const empty =
    model.sections.length === 0 ? [h('p', { className: 'empty', text: '고른 경기에 아이가 나온 기록이 없어요.' })] : [];
  return [cover, h('h2', { text: `모은 경기 ${model.games.length}경기` }), ...tables, ...empty, ...sections];
}

/**
 * 덩어리 높이로 쪽을 나눈다. 제목은 다음 덩어리와 같은 쪽에 두고, 부분 첫머리는 새 쪽에서 시작한다.
 * 돌려주는 값은 쪽마다 들어갈 덩어리 번호 목록.
 */
export function paginate(heights: readonly number[], keepWithNext: readonly boolean[], breakBefore: readonly boolean[], pageHeight: number): number[][] {
  const pages: number[][] = [];
  let page: number[] = [];
  let used = 0;
  let i = 0;
  while (i < heights.length) {
    const group = [i];
    while (keepWithNext[group[group.length - 1]] && group[group.length - 1] + 1 < heights.length) group.push(group[group.length - 1] + 1);
    const height = group.reduce((sum, n) => sum + heights[n], 0);
    if (page.length > 0 && (breakBefore[i] || used + height > pageHeight)) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(...group);
    used += height;
    i = group[group.length - 1] + 1;
  }
  if (page.length > 0) pages.push(page);
  return pages;
}

/** 리포트를 저장한 뒤 잠깐 띄웠다가 저절로 사라지는 알림을 보여주는 시간 */
export const REPORT_TOAST_MS = 4000;

/** 리포트를 저장했다는 알림 문구 */
export function reportSavedMessage(format: 'jpg' | 'pdf'): string {
  return `${format === 'jpg' ? '분석 화면(JPG)을' : '분석 보고서(PDF)를'} 만들었어요. 휴대폰의 "다운로드" 폴더에 있어요.`;
}

/** 내려받는 파일 이름에 쓰는 오늘 날짜 */
function stamp(today: string): string {
  return today.replace(/-/g, '');
}

export function reportPdfName(scopeShort: string, today: string): string {
  return `분석리포트_${scopeShort}_${stamp(today)}.pdf`;
}

export function screenJpegName(kindLabel: string, scopeShort: string, today: string): string {
  return `분석화면_${kindLabel}_${scopeShort}_${stamp(today)}.jpg`;
}
