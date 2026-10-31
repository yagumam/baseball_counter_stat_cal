// 야구장 그림(낙구 지점 찍기·타구 분포)과 스트라이크 존 그림(통과 지점 찍기·존 분포).
// 같은 그림을 입력과 분석에서 함께 쓴다.

import { h } from './dom';
import { BatterHand, ZONE_MAX, ZONE_MIN } from './events';
import { BASE_DISTANCE, FENCE_RADIUS, FIELD_SIZE, HOME, INFIELD_RADIUS } from './field';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface DrawPoint {
  readonly x: number;
  readonly y: number;
  readonly kind: string;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** 야구장 그림은 담장 위 빈 곳을 잘라 낸다. 담장 너머 타구를 찍을 만큼은 남긴다. */
const FIELD_TOP = HOME.y - FENCE_RADIUS - 12;
const FIELD_VIEW_HEIGHT = FIELD_SIZE - FIELD_TOP;

/** 그림에 보이는 범위 (그림 좌표). 저장하는 0~1 좌표는 언제나 0~FIELD_SIZE 범위를 기준으로 한다. */
interface ViewArea {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * 손가락으로 끌 때 점을 손가락 옆에 둔다(약 10mm). 손가락 끝에 가려 점이 안 보이는 일을 막는다.
 * 손끝이 닿는 넓이가 약 1cm라 3mm로는 가려졌다. 휴대폰 화면은 1인치에 약 160 CSS 픽셀이라 10mm ≈ 63픽셀로 잡는다.
 * (20mm처럼 더 멀리 두면 끌기 시작할 때 점이 크게 튀어 헷갈린다)
 */
const FINGER_OFFSET_PX = 63;
/** 이만큼 움직여야 "끌기"로 본다. 그냥 누르면 누른 자리에 점을 찍는다. */
const DRAG_START_PX = 6;

/** 오른손이면 손가락 왼쪽, 왼손이면 오른쪽에 점을 둔다. (설정의 손 방향은 화면 루트의 data-hand) */
function fingerOffset(svg: SVGSVGElement): number {
  const hand = svg.closest<HTMLElement>('[data-hand]')?.dataset.hand;
  return hand === 'left' ? FINGER_OFFSET_PX : -FINGER_OFFSET_PX;
}

/**
 * 그림을 누르면 그 자리에 점을 찍고, 누른 채 끌면 점이 따라오다가 손을 뗀 곳으로 정한다.
 * 손가락으로 끌 때는 점을 손가락 옆에 둔다. 끄는 동안은 다시 그리지 않고 점만 옮긴다. (다시 그리면 손가락을 놓친다)
 */
function pickHandler(svg: SVGSVGElement, onPick: (x: number, y: number) => void, view: ViewArea): void {
  const toUnit = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = svg.getBoundingClientRect();
    const x = view.left + ((clientX - rect.left) / rect.width) * view.width;
    const y = view.top + ((clientY - rect.top) / rect.height) * view.height;
    return { x: clampUnit(x / FIELD_SIZE), y: clampUnit(y / FIELD_SIZE) };
  };
  let pressed = false;
  let start = { x: 0, y: 0 };
  let shift = 0;
  const pointAt = (e: PointerEvent): { x: number; y: number } => toUnit(e.clientX + shift, e.clientY);
  svg.addEventListener('pointerdown', (e) => {
    pressed = true;
    shift = 0;
    start = { x: e.clientX, y: e.clientY };
    svg.setPointerCapture(e.pointerId);
    const p = pointAt(e);
    movePicked(svg, p.x, p.y);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!pressed) return;
    // 손가락으로 끌기 시작하면 그때부터 점을 손가락 옆으로 옮긴다. (마우스는 가리지 않으므로 그대로)
    if (shift === 0 && e.pointerType === 'touch' && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_START_PX) {
      shift = fingerOffset(svg);
    }
    const p = pointAt(e);
    movePicked(svg, p.x, p.y);
  });
  svg.addEventListener('pointerup', (e) => {
    if (!pressed) return;
    pressed = false;
    const p = pointAt(e);
    onPick(p.x, p.y);
  });
  svg.addEventListener('pointercancel', () => {
    pressed = false;
  });
}

/** 고른 점(고리 + 가운데 점)을 옮긴다. 아직 없으면 만든다. */
function movePicked(svg: SVGSVGElement, x: number, y: number): void {
  let ring = svg.querySelector<SVGCircleElement>('.picked-ring');
  let dot = svg.querySelector<SVGCircleElement>('.picked-dot');
  if (!ring || !dot) {
    ring = svgEl('circle', { r: 4.5, class: 'picked-ring' });
    dot = svgEl('circle', { r: 2, class: 'picked-dot' });
    svg.append(ring, dot);
  }
  for (const el of [ring, dot]) {
    el.setAttribute('cx', String(x * FIELD_SIZE));
    el.setAttribute('cy', String(y * FIELD_SIZE));
  }
}

function drawPoints(svg: SVGSVGElement, points: readonly DrawPoint[], radius: number): void {
  for (const p of points) {
    svg.append(svgEl('circle', { cx: p.x * FIELD_SIZE, cy: p.y * FIELD_SIZE, r: radius, class: `chart-dot ${p.kind}` }));
  }
}

function drawPicked(svg: SVGSVGElement, picked: { x: number; y: number } | null): void {
  if (picked) movePicked(svg, picked.x, picked.y);
}

function pointOnCircle(angleDegrees: number, radius: number): { x: number; y: number } {
  const rad = (angleDegrees * Math.PI) / 180;
  return { x: HOME.x + radius * Math.sin(rad), y: HOME.y - radius * Math.cos(rad) };
}

/** 부채꼴(홈에서 좌우 45도) 경로 */
function fanPath(radius: number): string {
  const left = pointOnCircle(-45, radius);
  const right = pointOnCircle(45, radius);
  return `M${HOME.x} ${HOME.y} L${left.x} ${left.y} A${radius} ${radius} 0 0 1 ${right.x} ${right.y} Z`;
}

export interface FieldOptions {
  readonly points?: readonly DrawPoint[];
  readonly picked?: { x: number; y: number } | null;
  readonly onPick?: (x: number, y: number) => void;
  readonly label: string;
  /** 존 그림 양옆에 타석(우타자·좌타자 자리)을 그린다. highlight는 지금 타자가 선 쪽 */
  readonly batters?: { readonly highlight: BatterHand | null };
}

/**
 * 존 그림 둘레에 더 보여주는 여백 (그림 좌표). 존이 그림에서 차지하는 크기를 예전보다 10% 줄이고,
 * 양옆에 타자 그림을 그릴 자리를 만든다. 저장 좌표(0~1)와 존 범위(ZONE_MIN~ZONE_MAX)는 그대로다.
 */
const ZONE_VIEW_MARGIN = 5.6;

/**
 * 타격 자세를 잡은 어린이 실루엣. 우타자 기준으로 그리고(포수 쪽에서 본 모습: 홈플레이트 쪽(오른쪽)을 보고 배트는 뒤로 든다),
 * 좌타자는 좌우를 뒤집는다. 도형 좌표는 가로 36 · 세로 92 칸 안에서 잡았다.
 */
const FIGURE_STROKES: readonly { d: string; width: number }[] = [
  { d: 'M10.5 24 L4.5 10', width: 2.3 }, // 배트 손잡이
  { d: 'M5.6 12.6 L1.6 3.2', width: 4.6 }, // 배트 굵은 쪽
  { d: 'M16 27 L7 28.5 L10.5 24', width: 4.4 }, // 뒤쪽 팔 (팔꿈치를 들어 올림)
  { d: 'M16.5 47 L25 62 L26.5 81', width: 7 }, // 앞다리 (홈플레이트 쪽으로 벌림)
  { d: 'M14 47 L8 63 L6 81', width: 7 }, // 뒷다리 (무릎을 굽힘)
  { d: 'M25.5 84.5 L31 84.5', width: 5 }, // 앞발
  { d: 'M4.5 84.5 L10 84.5', width: 5 }, // 뒷발
  { d: 'M18.5 25 L15 46', width: 11.5 }, // 몸통 (살짝 앞으로 숙임)
  { d: 'M21 28 L16.5 35 L10.5 24.5', width: 4.4 }, // 앞쪽 팔
];

/** 헬멧 쓴 머리: 둥근 머리 + 앞(오른쪽)으로 난 챙 + 귀 덮개 */
const FIGURE_HEAD = { cx: 21, cy: 13, r: 7.4 };
const FIGURE_HELMET = ['M13.2 13.4 A8.1 8.1 0 0 1 29 11.6 L33.6 13.6 L28.6 14.6 Z', 'M13.2 13 L13.4 18 L17 18.6 L16.4 13 Z'];

/** 존 옆 여백에 맞게 줄인다. (가로·세로를 같은 비율로 줄여야 선 굵기가 찌그러지지 않는다) */
const FIGURE_SCALE = 0.76;
const FIGURE_TOP = 10;
const FIGURE_SIDE_OFFSET = 6;

function batterFigure(hand: BatterHand, on: boolean): SVGGElement {
  const k = FIGURE_SCALE;
  const transform =
    hand === 'right'
      ? `translate(${-FIGURE_SIDE_OFFSET} ${FIGURE_TOP}) scale(${k})`
      : `translate(${FIELD_SIZE + FIGURE_SIDE_OFFSET} ${FIGURE_TOP}) scale(${-k} ${k})`;
  const g = svgEl('g', { transform, class: `batter-figure${on ? ' on' : ''}`, 'aria-hidden': 'true' });
  for (const stroke of FIGURE_STROKES) g.append(svgEl('path', { d: stroke.d, 'stroke-width': stroke.width, class: 'batter-limb' }));
  g.append(svgEl('circle', { ...FIGURE_HEAD, class: 'batter-body' }));
  for (const d of FIGURE_HELMET) g.append(svgEl('path', { d, class: 'batter-body' }));
  return g;
}

/**
 * 포수 쪽에서 본 모습임을 알 수 있게 양옆 타자 실루엣과 아래 홈플레이트를 그린다.
 * 포수 쪽에서 보면 우타자는 왼쪽(3루 쪽), 좌타자는 오른쪽(1루 쪽)에 선다.
 */
function drawBatters(svg: SVGSVGElement, highlight: BatterHand | null): void {
  const labels: [BatterHand, number, string][] = [
    ['right', 8, '우타자'],
    ['left', FIELD_SIZE - 8, '좌타자'],
  ];
  for (const [hand, x, text] of labels) {
    const on = highlight === hand;
    svg.append(batterFigure(hand, on));
    const label = svgEl('text', { x, y: FIELD_SIZE + 3, class: `batter-label${on ? ' on' : ''}`, 'text-anchor': 'middle' });
    label.textContent = text;
    svg.append(label);
  }
  // 홈플레이트: 뾰족한 쪽이 포수(아래)를 향한다.
  const c = FIELD_SIZE / 2;
  const plateTop = ZONE_MAX * FIELD_SIZE + 6;
  svg.append(svgEl('path', { d: `M${c - 7} ${plateTop} L${c + 7} ${plateTop} L${c + 7} ${plateTop + 4} L${c} ${plateTop + 9} L${c - 7} ${plateTop + 4} Z`, class: 'zone-plate' }));
}

export function fieldSvg(options: FieldOptions): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: `0 ${FIELD_TOP} ${FIELD_SIZE} ${FIELD_VIEW_HEIGHT}`, class: `field-svg${options.onPick ? ' pickable' : ''}`, role: 'img', 'aria-label': options.label });
  svg.append(svgEl('rect', { x: 0, y: 0, width: FIELD_SIZE, height: FIELD_SIZE, class: 'field-foul-ground' }));
  svg.append(svgEl('path', { d: fanPath(FENCE_RADIUS), class: 'field-grass' }));
  svg.append(svgEl('path', { d: fanPath(INFIELD_RADIUS), class: 'field-dirt' }));
  const first = pointOnCircle(45, BASE_DISTANCE);
  const second = pointOnCircle(0, BASE_DISTANCE * Math.SQRT2);
  const third = pointOnCircle(-45, BASE_DISTANCE);
  svg.append(svgEl('path', { d: `M${HOME.x} ${HOME.y} L${first.x} ${first.y} L${second.x} ${second.y} L${third.x} ${third.y} Z`, class: 'field-infield-grass' }));
  const leftLine = pointOnCircle(-45, FENCE_RADIUS + 6);
  const rightLine = pointOnCircle(45, FENCE_RADIUS + 6);
  svg.append(svgEl('line', { x1: HOME.x, y1: HOME.y, x2: leftLine.x, y2: leftLine.y, class: 'field-line' }));
  svg.append(svgEl('line', { x1: HOME.x, y1: HOME.y, x2: rightLine.x, y2: rightLine.y, class: 'field-line' }));
  for (const b of [first, second, third]) svg.append(svgEl('rect', { x: b.x - 1.6, y: b.y - 1.6, width: 3.2, height: 3.2, transform: `rotate(45 ${b.x} ${b.y})`, class: 'field-base' }));
  svg.append(svgEl('circle', { cx: HOME.x, cy: HOME.y, r: 1.8, class: 'field-base' }));
  drawPoints(svg, options.points ?? [], 2.2);
  drawPicked(svg, options.picked ?? null);
  if (options.onPick) pickHandler(svg, options.onPick, { left: 0, top: FIELD_TOP, width: FIELD_SIZE, height: FIELD_VIEW_HEIGHT });
  return svg;
}

export function zoneSvg(options: FieldOptions): SVGSVGElement {
  const m = ZONE_VIEW_MARGIN;
  const view: ViewArea = { left: -m, top: -m, width: FIELD_SIZE + 2 * m, height: FIELD_SIZE + 2 * m };
  const svg = svgEl('svg', {
    viewBox: `${view.left} ${view.top} ${view.width} ${view.height}`,
    class: `zone-svg${options.onPick ? ' pickable' : ''}`,
    role: 'img',
    'aria-label': options.label,
  });
  svg.append(svgEl('rect', { x: view.left, y: view.top, width: view.width, height: view.height, class: 'zone-bg' }));
  const min = ZONE_MIN * FIELD_SIZE;
  const size = (ZONE_MAX - ZONE_MIN) * FIELD_SIZE;
  svg.append(svgEl('rect', { x: min, y: min, width: size, height: size, class: 'zone-box' }));
  for (const i of [1, 2]) {
    const offset = min + (size * i) / 3;
    svg.append(svgEl('line', { x1: offset, y1: min, x2: offset, y2: min + size, class: 'zone-grid' }));
    svg.append(svgEl('line', { x1: min, y1: offset, x2: min + size, y2: offset, class: 'zone-grid' }));
  }
  if (options.batters) drawBatters(svg, options.batters.highlight);
  drawPoints(svg, options.points ?? [], 3);
  drawPicked(svg, options.picked ?? null);
  if (options.onPick) pickHandler(svg, options.onPick, view);
  return svg;
}

export interface LegendItem {
  readonly kind: string;
  readonly label: string;
}

/** 분석 화면의 그림 카드: 제목 + 그림 + 범례 */
export function chartCard(title: string, svg: SVGSVGElement, legend: readonly LegendItem[], note: string): HTMLElement {
  return h('article', { className: 'chart-card' }, [
    h('h3', { text: title }),
    h('div', { className: 'chart-frame' }, [svg]),
    h(
      'p',
      { className: 'chart-legend' },
      legend.map((l) => h('span', {}, [h('i', { className: `legend-dot ${l.kind}` }), l.label])),
    ),
    h('p', { className: 'help', text: note }),
  ]);
}
