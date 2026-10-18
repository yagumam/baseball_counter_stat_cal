// 처음 한 번만 보여주는 기록 요령 안내. 본 안내는 이 휴대폰에 기억하고, 다시 보려면 도움말을 본다.

import { h } from './dom';
import { popup } from './popup';

export type TipKey = 'wildPitch' | 'fieldersChoice';

export const TIPS: Record<TipKey, { title: string; lines: readonly string[] }> = {
  wildPitch: {
    title: '와일드피치 · 포일 기록 요령',
    lines: [
      '와일드피치(투수가 빠뜨림)와 포일(포수가 놓침)은 볼 하나와 함께 모든 주자를 한 칸씩 옮겨요.',
      '주자가 두 칸 이상 갔다면, 누른 다음 "상황 고치기"에서 주자 자리와 들어온 점수를 맞춰 주세요.',
    ],
  },
  fieldersChoice: {
    title: '야수 선택(타자는 살고 주자가 아웃) 기록 요령',
    lines: [
      '친 공을 앞 주자에게 던져 주자가 아웃되고 타자는 1루에 산 경우예요.',
      '먼저 "아웃"으로 기록하고, 이어서 "상황 고치기"에서 타자를 1루에 넣고 아웃된 주자를 빼 주세요. 아웃 수는 그대로 둡니다.',
    ],
  },
};

const TIPS_SEEN_KEY = 'baseball-counter.tips-seen';

function seenTips(): TipKey[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TIPS_SEEN_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is TipKey => k in TIPS) : [];
  } catch {
    return [];
  }
}

export function hasSeenTip(key: TipKey): boolean {
  return seenTips().includes(key);
}

export function markTipSeen(key: TipKey): void {
  try {
    localStorage.setItem(TIPS_SEEN_KEY, JSON.stringify([...new Set([...seenTips(), key])]));
  } catch {
    // 기억하지 못하면 다음에 한 번 더 보일 뿐이다.
  }
}

/** 안내 창. 닫으면 하려던 기록을 이어서 한다. */
export function tipPopup(key: TipKey, onClose: () => void): HTMLElement {
  const tip = TIPS[key];
  return popup('tip-popup', tip.title, onClose, [
    h('p', { className: 'section-title', text: tip.title }),
    ...tip.lines.map((line) => h('p', { className: 'help', text: line })),
    h('p', { className: 'help', text: '이 안내는 처음 한 번만 나와요. 다시 보려면 위쪽 "도움말"을 보세요.' }),
    h('button', { className: 'primary', text: TIP_OK_LABEL, onClick: onClose }),
  ]);
}

export const TIP_OK_LABEL = '알겠어요, 계속 기록';
