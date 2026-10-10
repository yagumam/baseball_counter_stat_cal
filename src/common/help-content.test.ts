// 기능을 바꾸고 도움말을 깜빡하지 않도록, 화면의 버튼 이름이 매뉴얼에 모두 나오는지 검사한다. (CLAUDE.md 10)

import { describe, expect, it } from 'vitest';
import { GAME_TYPE_LABEL } from './game';
import { MANUAL_SECTIONS, TUTORIAL_STEPS } from './help-content';
import {
  APP_NAME,
  BACKUP_NOW_LABEL,
  BATTED_BALL_STRENGTH_LABEL,
  BATTED_BALL_TYPE_LABEL,
  CHILD_RUNNER_BUTTONS,
  DOUBLE_PLAY_BUTTON,
  DOWNLOAD_LABEL,
  FIELD_BUTTON_LABEL,
  BATTER_HAND_LABEL,
  BATTER_INFO_LABEL,
  OUT_TYPE_LABEL,
  FIELDING_CREDIT_LABEL,
  FIELDING_POSITION_LABEL,
  PLAY_FIELDING_LABEL,
  GAME_ORDER_LABEL,
  HAND_LABEL,
  PITCH_SHEET_LABEL,
  IMPORT_LABEL,
  PITCH_DETAIL_LABEL,
  PITCH_TYPE_LABEL,
  EXTRA_PITCH_BUTTONS,
  HIT_BUTTONS,
  MAIN_PITCH_BUTTONS,
  POSITION_LABEL,
  ROLE_LABEL,
  RUNNER_BUTTONS,
  TAB_LABEL,
  GAME_CARD_LABEL,
  GAME_RESULT_LABEL,
  SCORE_CELL_LABEL,
  ANALYSIS_SCOPE_LABEL,
  GAMES_VIEW_LABEL,
  ORIENTATION_LABEL,
  SCENE_END_BUTTON,
  MINI_GAME_LABEL,
  GAME_OVER_LABEL,
  OTHER_RUNNER_OUT_LABEL,
  EDIT_EVENT_LABEL,
  CALENDAR_LABEL,
  ANALYSIS_KIND_LABEL,
} from './labels';

const manualText = MANUAL_SECTIONS.flatMap((s) => [s.title, ...s.items.flatMap((i) => [i.title, ...i.text])]).join('\n');

function missing(labels: readonly string[]): string[] {
  return labels.filter((label) => !manualText.includes(label));
}

describe('도움말이 화면과 맞는지', () => {
  it('공 버튼과 안타 종류가 매뉴얼에 있다', () => {
    expect(missing([...MAIN_PITCH_BUTTONS, ...EXTRA_PITCH_BUTTONS].map((b) => b.label))).toEqual([]);
    expect(missing(HIT_BUTTONS.map((b) => b.label))).toEqual([]);
    expect(missing([DOUBLE_PLAY_BUTTON.label])).toEqual([]);
  });

  it('주자 상황·아이 주루 버튼이 매뉴얼에 있다', () => {
    expect(missing(RUNNER_BUTTONS.map((b) => b.label))).toEqual([]);
    expect(missing(CHILD_RUNNER_BUTTONS.map((b) => b.label))).toEqual([]);
  });

  it('역할·포지션·경기 구분·탭 이름이 매뉴얼에 있다', () => {
    expect(missing(Object.values(ROLE_LABEL))).toEqual([]);
    expect(missing(Object.values(POSITION_LABEL))).toEqual([]);
    expect(missing(Object.values(GAME_TYPE_LABEL))).toEqual([]);
    expect(missing(Object.values(TAB_LABEL))).toEqual([]);
    expect(missing(Object.values(GAME_CARD_LABEL))).toEqual([]);
    expect(missing(Object.values(GAME_RESULT_LABEL))).toEqual([]);
    expect(missing(Object.values(SCORE_CELL_LABEL))).toEqual([]);
    expect(missing(Object.values(ANALYSIS_SCOPE_LABEL))).toEqual([]);
    expect(missing(Object.values(GAMES_VIEW_LABEL))).toEqual([]);
    expect(missing(Object.values(ORIENTATION_LABEL))).toEqual([]);
    expect(missing(Object.values(SCENE_END_BUTTON))).toEqual([]);
    expect(missing(Object.values(GAME_OVER_LABEL))).toEqual([]);
    expect(missing(Object.values(MINI_GAME_LABEL).map((l) => l.replace(' ›', '')))).toEqual([]);
    expect(missing([OTHER_RUNNER_OUT_LABEL])).toEqual([]);
    expect(missing(Object.values(EDIT_EVENT_LABEL))).toEqual([]);
    expect(missing(Object.values(CALENDAR_LABEL))).toEqual([]);
    expect(missing(Object.values(ANALYSIS_KIND_LABEL))).toEqual([]);
  });

  it('타구 기록·투구 상세·내려받기 버튼이 매뉴얼에 있다', () => {
    expect(missing(Object.values(BATTED_BALL_TYPE_LABEL))).toEqual([]);
    expect(missing(Object.values(BATTED_BALL_STRENGTH_LABEL))).toEqual([]);
    expect(missing(Object.values(FIELD_BUTTON_LABEL))).toEqual([]);
    expect(missing(Object.values(OUT_TYPE_LABEL))).toEqual([]);
    expect(missing(Object.values(BATTER_HAND_LABEL))).toEqual([]);
    expect(missing(Object.values(BATTER_INFO_LABEL))).toEqual([]);
    expect(missing(Object.values(PITCH_TYPE_LABEL))).toEqual([]);
    expect(missing([PITCH_DETAIL_LABEL])).toEqual([]);
    expect(missing(Object.values(DOWNLOAD_LABEL))).toEqual([]);
    expect(missing([IMPORT_LABEL])).toEqual([]);
    expect(missing([BACKUP_NOW_LABEL])).toEqual([]);
    expect(missing(Object.values(PITCH_SHEET_LABEL))).toEqual([]);
    expect(missing(Object.values(HAND_LABEL))).toEqual([]);
    expect(missing(Object.values(GAME_ORDER_LABEL))).toEqual([]);
  });

  it('수비 기록 버튼과 수비 자리가 매뉴얼에 있다', () => {
    expect(missing(Object.values(FIELDING_CREDIT_LABEL))).toEqual([]);
    expect(missing(Object.values(PLAY_FIELDING_LABEL))).toEqual([]);
    expect(missing(Object.values(FIELDING_POSITION_LABEL))).toEqual([]);
  });

  it('도움말에 앱 이름이 나온다', () => {
    expect(missing([APP_NAME])).toEqual([]);
  });

  it('튜토리얼은 단계마다 제목과 설명이 있다', () => {
    expect(TUTORIAL_STEPS.length).toBeGreaterThan(0);
    for (const step of TUTORIAL_STEPS) {
      expect(step.title).not.toBe('');
      expect(step.lines.length).toBeGreaterThan(0);
    }
  });

  it('매뉴얼 항목 id가 겹치지 않는다', () => {
    const ids = MANUAL_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
