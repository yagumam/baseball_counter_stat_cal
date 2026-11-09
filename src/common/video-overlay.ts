// 영상 위 상황판: 촬영 화면(캔버스)에 볼카운트·아웃·주자·점수·투구 수를 그려 넣는다.
// 그림을 영상에 함께 녹화하므로, 나중에 영상만 봐도 그 공이 어떤 상황이었는지 알 수 있다.

import { MAX_BALLS_IN_COUNT, MAX_STRIKES_IN_COUNT, OUTS_PER_INNING } from './count';
import { BaseIndex, Bases } from './events';

/** 영상에 그릴 상황판 내용. 기록 입력 화면이 그릴 때마다 새로 만든다. */
export interface OverlaySnapshot {
  /** 예: "3회말". 진행 중인 장면이 없으면 null */
  readonly inningText: string | null;
  /** 예: "투수", "2루 주자" */
  readonly roleText: string | null;
  readonly balls: number;
  readonly strikes: number;
  readonly outs: number;
  readonly bases: Bases;
  readonly childBase: BaseIndex | null;
  readonly themName: string;
  readonly usName: string;
  readonly themRuns: number;
  readonly usRuns: number;
  /** 예: "투구 45" */
  readonly workload: string | null;
  /** 방금 기록한 것. 바뀐 순간부터 잠깐 영상에 크게 띄운다. */
  readonly lastEvent: { readonly id: string; readonly text: string } | null;
}

/** 방금 기록한 것을 영상에 띄워 두는 시간 */
export const FLASH_MS = 2500;
/** 그림 크기 기준: 짧은 변이 이 픽셀일 때 아래 크기들을 그대로 쓴다. */
const BASE_SHORT_SIDE = 1080;
/** 팀 이름이 길면 영상 상황판이 넘치므로 이만큼만 쓴다. */
const MAX_TEAM_NAME = 6;

const COLOR = {
  panel: 'rgba(16, 22, 18, 0.78)',
  text: '#ffffff',
  muted: 'rgba(255, 255, 255, 0.7)',
  off: 'rgba(255, 255, 255, 0.28)',
  ball: '#3fbf5f',
  strike: '#f2c230',
  out: '#e5484d',
  base: '#f2c230',
  child: '#4aa3ff',
  flash: 'rgba(0, 0, 0, 0.7)',
} as const;

export function shortTeamName(name: string): string {
  const chars = Array.from(name.trim());
  return chars.length > MAX_TEAM_NAME ? `${chars.slice(0, MAX_TEAM_NAME).join('')}…` : chars.join('');
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function dotRow(ctx: CanvasRenderingContext2D, label: string, filled: number, total: number, color: string, x: number, y: number, s: number): void {
  ctx.fillStyle = COLOR.muted;
  ctx.font = `700 ${30 * s}px sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y);
  const radius = 13 * s;
  for (let i = 0; i < total; i += 1) {
    ctx.beginPath();
    ctx.arc(x + 190 * s + i * 36 * s, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = i < filled ? color : COLOR.off;
    ctx.fill();
  }
}

/** 마름모 모양 베이스 세 개. 아이가 있는 베이스는 파란색. */
function basesDrawing(ctx: CanvasRenderingContext2D, bases: Bases, childBase: BaseIndex | null, cx: number, cy: number, s: number): void {
  const gap = 34 * s;
  const size = 20 * s;
  // 1루는 오른쪽, 2루는 위, 3루는 왼쪽 (포수 쪽에서 본 모습)
  const spots: Record<BaseIndex, { x: number; y: number }> = {
    0: { x: cx + gap, y: cy + gap / 2 },
    1: { x: cx, y: cy - gap / 2 },
    2: { x: cx - gap, y: cy + gap / 2 },
  };
  for (const b of [0, 1, 2] as const) {
    const { x, y } = spots[b];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = b === childBase ? COLOR.child : bases[b] ? COLOR.base : COLOR.off;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }
}

/**
 * 한 장면(프레임) 위에 상황판을 그린다. 화면 아래 왼쪽에 반투명 상자,
 * 방금 기록한 것은 FLASH_MS 동안 가운데 위에 크게 띄운다.
 * flashSince: 방금 기록한 것이 처음 보인 시각(ms). 띄울 것이 없으면 null.
 */
export function drawOverlay(ctx: CanvasRenderingContext2D, snap: OverlaySnapshot, width: number, height: number, flashSince: number | null, now: number): void {
  const s = Math.min(width, height) / BASE_SHORT_SIDE;
  const margin = 32 * s;
  const panelW = 560 * s;
  const panelH = 250 * s;
  const x = margin;
  const y = height - margin - panelH;

  ctx.fillStyle = COLOR.panel;
  roundRect(ctx, x, y, panelW, panelH, 24 * s);
  ctx.fill();

  // 첫 줄: 이닝 · 점수
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = COLOR.text;
  ctx.font = `800 ${44 * s}px sans-serif`;
  ctx.fillText(snap.inningText ?? '장면 사이', x + 24 * s, y + 46 * s);
  ctx.textAlign = 'right';
  ctx.font = `700 ${34 * s}px sans-serif`;
  ctx.fillText(`${shortTeamName(snap.themName)} ${snap.themRuns} : ${snap.usRuns} ${shortTeamName(snap.usName)}`, x + panelW - 24 * s, y + 46 * s);

  // 가운데: 볼·스트라이크·아웃 점과 주자
  const rowX = x + 24 * s;
  dotRow(ctx, '볼', snap.balls, MAX_BALLS_IN_COUNT, COLOR.ball, rowX, y + 102 * s, s);
  dotRow(ctx, '스트라이크', snap.strikes, MAX_STRIKES_IN_COUNT, COLOR.strike, rowX, y + 146 * s, s);
  dotRow(ctx, '아웃', snap.outs, OUTS_PER_INNING - 1, COLOR.out, rowX, y + 190 * s, s);
  basesDrawing(ctx, snap.bases, snap.childBase, x + panelW - 130 * s, y + 140 * s, s);

  // 끝 줄: 역할 · 투구 수
  const footer = [snap.roleText, snap.workload].filter((t): t is string => t !== null).join(' · ');
  if (footer) {
    ctx.textAlign = 'right';
    ctx.fillStyle = COLOR.muted;
    ctx.font = `600 ${28 * s}px sans-serif`;
    ctx.fillText(footer, x + panelW - 24 * s, y + 222 * s);
  }

  if (snap.lastEvent && flashSince !== null && now - flashSince < FLASH_MS) {
    ctx.font = `800 ${52 * s}px sans-serif`;
    ctx.textAlign = 'center';
    const textW = ctx.measureText(snap.lastEvent.text).width;
    const boxW = Math.min(width - margin * 2, textW + 64 * s);
    const boxH = 88 * s;
    const boxY = y - boxH - 20 * s;
    ctx.fillStyle = COLOR.flash;
    roundRect(ctx, (width - boxW) / 2, boxY, boxW, boxH, 20 * s);
    ctx.fill();
    ctx.fillStyle = COLOR.text;
    ctx.fillText(snap.lastEvent.text, width / 2, boxY + boxH / 2, boxW - 32 * s);
  }
}
