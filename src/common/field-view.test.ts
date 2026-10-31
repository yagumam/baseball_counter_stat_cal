import { describe, expect, it } from 'vitest';
import { FINGER_OFFSET_PX, fingerShift } from './field-view';

describe('손가락에 가리지 않게 점 옮기기', () => {
  it('손가락: 오른손은 손끝 왼쪽, 왼손은 오른쪽', () => {
    expect(fingerShift('touch', 'right')).toBe(-FINGER_OFFSET_PX);
    expect(fingerShift('touch', 'left')).toBe(FINGER_OFFSET_PX);
  });

  it('손 방향을 모르면 기본(오른손)처럼 왼쪽', () => {
    expect(fingerShift('touch', undefined)).toBe(-FINGER_OFFSET_PX);
  });

  it('마우스 · 펜은 누른 자리 그대로', () => {
    expect(fingerShift('mouse', 'right')).toBe(0);
    expect(fingerShift('pen', 'left')).toBe(0);
  });
});
