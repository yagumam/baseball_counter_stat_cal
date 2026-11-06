// 분석용 내려받기: SAS·SPSS·R·Python 같은 통계 프로그램에서 바로 읽는 CSV와 변수 설명서(코드북).
// - 공 표(pitches): 공 하나당 한 줄(tidy/long). 던지기 직전 상황 + 그 공의 원자료만 담는다.
// - 경기 표(games): 경기 하나당 한 줄.
// - 코드북: 열마다 이름·뜻·타입·단위·코드. 아래 열 정의에서 그대로 만들어 실제 값과 어긋나지 않는다.
//
// 원칙
// - 타율·평균자책점 같은 파생 통계는 넣지 않는다. 공식은 src/pitcher·batter·fielder에만 둔다. (CLAUDE.md 5.2)
// - 열 이름은 영문 snake_case, 32자 이하 (SAS·SPSS 변수 이름 제약).
// - 범주형 값은 영문 코드(저장된 값의 camelCase를 snake_case로), 숫자는 숫자만(단위는 코드북), 날짜는 YYYY-MM-DD.
// - 값이 없으면 빈 칸. 0과 구분한다. (CLAUDE.md 4.2)
// - UTF-8(BOM 없음), 쉼표 구분, 줄 끝 CRLF, RFC 4180 따옴표 처리.
// - 열 순서·이름·코드는 형식 버전과 함께 고정한다. 나중에 구글 시트 동기화의 열 구조로도 그대로 쓴다.

import { Count } from './count';
import {
  BATTED_BALL_STRENGTHS,
  BATTED_BALL_TYPES,
  BATTER_HANDS,
  BaseIndex,
  FieldingPosition,
  GameType,
  HIT_TYPES,
  Half,
  OUT_TYPES,
  PITCH_RESULTS,
  PITCH_TYPES,
  PitchEvent,
  ROLES,
  Role,
  STORED_GAME_TYPES,
  Team,
  UndoableEvent,
  activeEvents,
} from './events';
import { GAME_TYPE_LABEL, Game, GameInfo, VENUE_LABEL, gameInfo } from './game';
import { halfOrder, offensiveHalf, defensiveHalf } from './innings';
import {
  ACTOR_LABEL,
  BATTED_BALL_STRENGTH_LABEL,
  BATTED_BALL_TYPE_LABEL,
  BATTER_HAND_LABEL,
  FIELDING_POSITION_LABEL,
  HIT_TYPE_LABEL,
  OUTCOME_LABEL,
  OUT_TYPE_LABEL,
  PITCH_LABEL,
  PITCH_TYPE_LABEL,
  ROLE_LABEL,
} from './labels';
import { LineScore, lineScore } from './line-score';
import { Actor, GameReplay, PitchSituation, PlateAppearance, PlateAppearanceOutcome, applyPitch } from './replay';

/** 분석용 파일 형식 버전. 열을 빼거나 이름·뜻·코드를 바꾸면 올린다. (끝에 열을 더하기만 하면 그대로 둔다) */
export const ANALYSIS_FORMAT_VERSION = 1;

/** SAS·SPSS 변수 이름 최대 길이 */
export const MAX_COLUMN_NAME_LENGTH = 32;

/** 저장된 값(camelCase)을 분석용 코드(snake_case)로. 예: wildPitch → wild_pitch */
export function snakeCode(value: string): string {
  return value.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export interface CodeEntry {
  readonly code: string;
  readonly label: string;
}

export type ColumnType = 'id' | 'integer' | 'number' | 'binary' | 'code' | 'date' | 'datetime' | 'text';

/** 코드북에 적는 타입 이름 */
const COLUMN_TYPE_LABEL: Record<ColumnType, string> = {
  id: '문자 (고유 ID)',
  integer: '정수',
  number: '실수',
  binary: '0/1',
  code: '범주 (코드)',
  date: '날짜 (YYYY-MM-DD)',
  datetime: '시각 (ISO 8601, UTC)',
  text: '문자',
};

type CellValue = string | number | null;

export interface Column<R> {
  readonly name: string;
  /** 뜻 (한국어) */
  readonly label: string;
  readonly type: ColumnType;
  readonly unit?: string;
  readonly codes?: readonly CodeEntry[];
  readonly value: (row: R) => CellValue;
}

/** 저장된 값 목록과 화면 이름으로 코드 목록을 만든다. */
function codesOf<K extends string>(keys: readonly K[], labels: Record<K, string>): CodeEntry[] {
  return keys.map((k) => ({ code: snakeCode(k), label: labels[k] }));
}

const BASE_CODE: Record<BaseIndex, string> = { 0: '1b', 1: '2b', 2: '3b' };
const BASE_CODES: CodeEntry[] = [
  { code: '1b', label: '1루' },
  { code: '2b', label: '2루' },
  { code: '3b', label: '3루' },
];
const HALF_CODES: CodeEntry[] = [
  { code: 'top', label: '초 (먼저 공격하는 팀의 공격)' },
  { code: 'bottom', label: '말 (나중에 공격하는 팀의 공격)' },
];
const TEAM_CODES: CodeEntry[] = [
  { code: 'us', label: '우리 팀' },
  { code: 'them', label: '상대 팀' },
];
const BINARY_CODES: CodeEntry[] = [
  { code: '0', label: '아니요' },
  { code: '1', label: '예' },
];

const ACTORS: readonly Actor[] = ['opponent', 'child', 'teammate'];
const OUTCOMES = Object.keys(OUTCOME_LABEL) as PlateAppearanceOutcome[];
const FIELDING_POSITIONS = Object.keys(FIELDING_POSITION_LABEL) as FieldingPosition[];

const codeOrNull = (value: string | null | undefined): string | null => (value === null || value === undefined ? null : snakeCode(value));
const binary = (flag: boolean): number => (flag ? 1 : 0);
const nonEmpty = (text: string): string | null => (text.trim() === '' ? null : text.trim());
const isoDate = (date: string): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null);

// ---------- 공 표 ----------

export interface PitchRow {
  readonly game: Game;
  readonly info: GameInfo;
  readonly pa: PlateAppearance;
  readonly pitch: PitchEvent;
  /** 타석 안에서 몇 번째 공인지 (1부터) */
  readonly pitchSeq: number;
  /** 경기에 저장된 이벤트 중 몇 번째인지 (1부터). 덧붙이기만 하므로 바뀌지 않는다. */
  readonly eventSeq: number;
  readonly sceneSeq: number;
  readonly situation: PitchSituation;
  readonly countBefore: Count;
  readonly scoreBefore: Record<Team, number>;
  readonly edited: boolean;
}

/** 이 공을 던질 때 아이의 역할. 투수·수비는 장면 그대로, 공격 중이면 아이가 타석이면 타자, 아니면 주자 */
function childRoleOf(pa: PlateAppearance): Role {
  if (pa.fieldingPosition === 'pitcher') return 'pitcher';
  if (pa.fieldingPosition !== null) return 'fielder';
  return pa.actor === 'child' ? 'batter' : 'runner';
}

/** 타석의 고유 ID: 그 타석의 첫 투구·주자 상황 이벤트 id. 앞 타석이 취소돼 타석 번호가 밀려도 그대로다. */
function plateAppearanceId(pa: PlateAppearance): string | null {
  return pa.timeline.find((e) => e.kind === 'pitch' || e.kind === 'play')?.id ?? null;
}

const fieldingFlag = (row: PitchRow, credit: 'putout' | 'assist' | 'error'): number | null =>
  row.pa.fieldingPosition === null ? null : binary(row.pitch.fielding?.includes(credit) ?? false);

const hasBattedSpot = (p: PitchEvent): boolean => p.battedBall !== undefined && p.battedBall.x !== null && p.battedBall.y !== null;

export const PITCH_COLUMNS: readonly Column<PitchRow>[] = [
  { name: 'game_id', label: '경기 고유 ID (games 표와 연결)', type: 'id', value: (r) => r.game.id },
  { name: 'game_date', label: '경기 날짜', type: 'date', value: (r) => isoDate(r.info.date) },
  { name: 'pitch_id', label: '공 고유 ID (기록할 때 붙인 id, 바뀌지 않음)', type: 'id', value: (r) => r.pitch.id },
  { name: 'event_seq', label: '경기 안 기록 순번 (저장된 모든 기록 중 몇 번째, 1부터)', type: 'integer', value: (r) => r.eventSeq },
  { name: 'pa_id', label: '타석 고유 ID (그 타석 첫 기록의 id)', type: 'id', value: (r) => plateAppearanceId(r.pa) },
  { name: 'pa_seq', label: '경기 안 타석 번호 (기록한 타석 순서, 1부터)', type: 'integer', value: (r) => r.pa.number },
  { name: 'pitch_seq', label: '타석 안 공 순번 (1부터)', type: 'integer', value: (r) => r.pitchSeq },
  { name: 'scene_id', label: '장면 고유 ID (아이 등장 기록 id, 미니게임은 초·말로 만든 id)', type: 'id', value: (r) => r.pa.sceneId },
  { name: 'scene_seq', label: '경기 안 장면 번호 (1부터)', type: 'integer', value: (r) => r.sceneSeq },
  { name: 'child_role', label: '이 공 때 아이의 역할', type: 'code', codes: codesOf(ROLES, ROLE_LABEL), value: (r) => childRoleOf(r.pa) },
  {
    name: 'child_position',
    label: '아이의 수비 자리 (공격 중이면 빈 칸)',
    type: 'code',
    codes: codesOf(FIELDING_POSITIONS, FIELDING_POSITION_LABEL),
    value: (r) => codeOrNull(r.pa.fieldingPosition),
  },
  { name: 'child_base', label: '아이가 있던 베이스 (주자가 아니면 빈 칸)', type: 'code', codes: BASE_CODES, value: (r) => (r.situation.childBase === null ? null : BASE_CODE[r.situation.childBase]) },
  { name: 'batter_actor', label: '타자가 누구인지', type: 'code', codes: codesOf(ACTORS, ACTOR_LABEL), value: (r) => r.pa.actor },
  { name: 'batter_hand', label: '타자가 서는 쪽 (고른 경우만)', type: 'code', codes: codesOf(BATTER_HANDS, BATTER_HAND_LABEL), value: (r) => r.pa.batterHand },
  { name: 'batter_grade', label: '상대 타자 학년 (고른 경우만)', type: 'integer', unit: '학년', value: (r) => r.pa.batterGrade },
  { name: 'inning', label: '이닝', type: 'integer', unit: '회', value: (r) => r.pa.inning },
  { name: 'half', label: '초 / 말', type: 'code', codes: HALF_CODES, value: (r) => r.pa.half },
  { name: 'outs_before', label: '던지기 전 아웃 수', type: 'integer', unit: '개', value: (r) => r.situation.outs },
  { name: 'on_1b', label: '던지기 전 1루 주자', type: 'binary', codes: BINARY_CODES, value: (r) => binary(r.situation.bases[0]) },
  { name: 'on_2b', label: '던지기 전 2루 주자', type: 'binary', codes: BINARY_CODES, value: (r) => binary(r.situation.bases[1]) },
  { name: 'on_3b', label: '던지기 전 3루 주자', type: 'binary', codes: BINARY_CODES, value: (r) => binary(r.situation.bases[2]) },
  { name: 'balls_before', label: '던지기 전 볼 수', type: 'integer', unit: '개', value: (r) => r.countBefore.balls },
  { name: 'strikes_before', label: '던지기 전 스트라이크 수', type: 'integer', unit: '개', value: (r) => r.countBefore.strikes },
  { name: 'runs_in_half_before', label: '이 초·말에 던지기 전까지 기록으로 들어온 점수', type: 'integer', unit: '점', value: (r) => r.situation.runsInHalf },
  {
    name: 'score_us_before',
    label: '던지기 전 우리 팀 점수 (앞 초·말은 스코어보드 값, 이번 초·말은 기록에서 센 점수)',
    type: 'integer',
    unit: '점',
    value: (r) => r.scoreBefore.us,
  },
  {
    name: 'score_them_before',
    label: '던지기 전 상대 팀 점수 (앞 초·말은 스코어보드 값, 이번 초·말은 기록에서 센 점수)',
    type: 'integer',
    unit: '점',
    value: (r) => r.scoreBefore.them,
  },
  {
    name: 'pitch_result',
    label: '공 결과 (스트라이크는 헛스윙·지켜봄을 나누지 않음)',
    type: 'code',
    codes: codesOf(PITCH_RESULTS, PITCH_LABEL),
    value: (r) => snakeCode(r.pitch.result),
  },
  { name: 'hit_type', label: '안타 종류 (안타일 때만)', type: 'code', codes: codesOf(HIT_TYPES, HIT_TYPE_LABEL), value: (r) => (r.pitch.result === 'hit' ? snakeCode(r.pitch.hitType ?? 'single') : null) },
  { name: 'out_type', label: '아웃의 종류 (고른 경우만)', type: 'code', codes: codesOf(OUT_TYPES, OUT_TYPE_LABEL), value: (r) => codeOrNull(r.pitch.outType) },
  { name: 'double_play_base', label: '병살 때 함께 아웃된 주자가 있던 베이스', type: 'code', codes: BASE_CODES, value: (r) => (r.pitch.doublePlay === undefined ? null : BASE_CODE[r.pitch.doublePlay]) },
  { name: 'pitch_type', label: '구종 (고른 경우만)', type: 'code', codes: codesOf(PITCH_TYPES, PITCH_TYPE_LABEL), value: (r) => codeOrNull(r.pitch.pitchType) },
  { name: 'pitch_speed', label: '구속 (고른 경우만)', type: 'integer', unit: 'km/h', value: (r) => r.pitch.speed ?? null },
  { name: 'zone_x', label: '존 통과 지점 가로 (포수 쪽에서 본 그림, 0=왼쪽 1=오른쪽, 0.2~0.8이 스트라이크 존)', type: 'number', unit: '그림 폭 비율 0~1', value: (r) => r.pitch.zone?.x ?? null },
  { name: 'zone_y', label: '존 통과 지점 세로 (0=위 1=아래, 0.2~0.8이 스트라이크 존)', type: 'number', unit: '그림 높이 비율 0~1', value: (r) => r.pitch.zone?.y ?? null },
  { name: 'batted_type', label: '타구 종류 (고른 경우만)', type: 'code', codes: codesOf(BATTED_BALL_TYPES, BATTED_BALL_TYPE_LABEL), value: (r) => codeOrNull(r.pitch.battedBall?.type) },
  { name: 'batted_strength', label: '타구 세기 (고른 경우만)', type: 'code', codes: codesOf(BATTED_BALL_STRENGTHS, BATTED_BALL_STRENGTH_LABEL), value: (r) => codeOrNull(r.pitch.battedBall?.strength) },
  { name: 'batted_x', label: '낙구 지점 가로 (야구장 그림, 0=왼쪽 1=오른쪽, 홈플레이트는 아래 가운데)', type: 'number', unit: '그림 폭 비율 0~1', value: (r) => (hasBattedSpot(r.pitch) ? (r.pitch.battedBall?.x ?? null) : null) },
  { name: 'batted_y', label: '낙구 지점 세로 (야구장 그림, 0=위 1=아래)', type: 'number', unit: '그림 높이 비율 0~1', value: (r) => (hasBattedSpot(r.pitch) ? (r.pitch.battedBall?.y ?? null) : null) },
  { name: 'fielding_putout', label: '아이가 이 공에서 잡아서 아웃(자살) (수비 중일 때만, 포수 삼진 자동 자살은 넣지 않음)', type: 'binary', codes: BINARY_CODES, value: (r) => fieldingFlag(r, 'putout') },
  { name: 'fielding_assist', label: '아이가 이 공에서 던져서 아웃 도움(보살) (수비 중일 때만)', type: 'binary', codes: BINARY_CODES, value: (r) => fieldingFlag(r, 'assist') },
  { name: 'fielding_error', label: '아이가 이 공에서 실책 (수비 중일 때만)', type: 'binary', codes: BINARY_CODES, value: (r) => fieldingFlag(r, 'error') },
  { name: 'pa_outcome', label: '이 공이 속한 타석의 결과 (진행 중이면 빈 칸)', type: 'code', codes: codesOf(OUTCOMES, OUTCOME_LABEL), value: (r) => codeOrNull(r.pa.outcome) },
  { name: 'edited', label: '나중에 고친 공인지 (값은 고친 뒤 기준)', type: 'binary', codes: BINARY_CODES, value: (r) => binary(r.edited) },
  { name: 'created_at', label: '이 공을 기록한 시각', type: 'datetime', value: (r) => r.pitch.createdAt },
  { name: 'author', label: '기록한 사람', type: 'text', value: (r) => r.pitch.author },
];

// ---------- 경기 표 ----------

export interface GameRow {
  readonly game: Game;
  readonly info: GameInfo;
  readonly replay: GameReplay;
  readonly line: LineScore;
}

const pitchCount = (replay: GameReplay): number => replay.plateAppearances.reduce((n, pa) => n + pa.pitches.length, 0);

export const GAME_COLUMNS: readonly Column<GameRow>[] = [
  { name: 'game_id', label: '경기 고유 ID (경기를 만들 때 붙인 id, 바뀌지 않음)', type: 'id', value: (r) => r.game.id },
  { name: 'game_date', label: '경기 날짜', type: 'date', value: (r) => isoDate(r.info.date) },
  { name: 'opponent', label: '상대팀 이름 (적은 그대로)', type: 'text', value: (r) => nonEmpty(r.info.opponent) },
  { name: 'game_type', label: '경기 구분', type: 'code', codes: codesOf<GameType>(STORED_GAME_TYPES, GAME_TYPE_LABEL), value: (r) => r.info.gameType },
  { name: 'batting_first', label: '먼저 공격(초)한 팀', type: 'code', codes: TEAM_CODES, value: (r) => r.info.battingFirst },
  { name: 'venue', label: '우리 팀 홈 / 원정', type: 'code', codes: codesOf(['home', 'away'] as const, VENUE_LABEL), value: (r) => r.info.venue },
  { name: 'our_team', label: '우리 팀 이름 (적은 그대로)', type: 'text', value: (r) => nonEmpty(r.info.ourTeam) },
  { name: 'place', label: '경기 장소 (적은 그대로)', type: 'text', value: (r) => nonEmpty(r.info.place) },
  { name: 'runs_us', label: '우리 팀 점수 (스코어보드 R: 직접 넣은 값 우선, 기록 없는 이닝은 0)', type: 'integer', unit: '점', value: (r) => r.line.totalRuns.us },
  { name: 'runs_them', label: '상대 팀 점수 (스코어보드 R: 직접 넣은 값 우선, 기록 없는 이닝은 0)', type: 'integer', unit: '점', value: (r) => r.line.totalRuns.them },
  { name: 'hits_us', label: '우리 팀 안타 (스코어보드 H)', type: 'integer', unit: '개', value: (r) => r.line.hits.us },
  { name: 'hits_them', label: '상대 팀 안타 (스코어보드 H)', type: 'integer', unit: '개', value: (r) => r.line.hits.them },
  { name: 'errors_us', label: '우리 팀 실책 (스코어보드 E)', type: 'integer', unit: '개', value: (r) => r.line.errors.us },
  { name: 'errors_them', label: '상대 팀 실책 (스코어보드 E)', type: 'integer', unit: '개', value: (r) => r.line.errors.them },
  { name: 'pa_count', label: '기록한 타석 수 (아이가 나온 장면만)', type: 'integer', unit: '타석', value: (r) => r.replay.plateAppearances.length },
  { name: 'pitch_count', label: '기록한 공 수 (pitches 표의 줄 수와 같음)', type: 'integer', unit: '개', value: (r) => pitchCount(r.replay) },
  { name: 'game_ended', label: '"경기 끝"으로 기록을 마쳤는지', type: 'binary', codes: BINARY_CODES, value: (r) => binary(r.replay.gameEnded) },
  { name: 'copied_from', label: '백업에서 불러온 사본이면 원래 경기 ID', type: 'id', value: (r) => r.game.copiedFrom ?? null },
  { name: 'created_at', label: '경기를 만든 시각', type: 'datetime', value: (r) => r.game.createdAt },
  { name: 'author', label: '경기를 만든 사람', type: 'text', value: (r) => r.game.author },
];

// ---------- 행 만들기 ----------

/** 이번 초·말보다 앞선 초·말의 스코어보드 점수 + 이번 초·말에 공 전까지 들어온 점수 */
function scoreBefore(line: LineScore, battingFirst: Team, inning: number, half: Half, runsInHalf: number): Record<Team, number> {
  const halfOf: Record<Team, Half> = { us: offensiveHalf(battingFirst), them: defensiveHalf(battingFirst) };
  const now = halfOrder(inning, half);
  const sum = (team: Team): number => {
    const earlier = line.innings.reduce((n, i) => n + (halfOrder(i, halfOf[team]) < now ? (line.runs[team][i - 1] ?? 0) : 0), 0);
    return earlier + (halfOf[team] === half ? runsInHalf : 0);
  };
  return { us: sum('us'), them: sum('them') };
}

/** 고친 기록(edit)이 붙어 있는 공 id. 고친 기록 자체가 취소됐으면 뺀다. */
function editedPitchIds(game: Game): Set<string> {
  const voided = new Set(game.events.flatMap((e) => (e.kind === 'void' ? [e.targetId] : [])));
  return new Set(game.events.flatMap((e) => (e.kind === 'edit' && !voided.has(e.id) ? [e.targetId] : [])));
}

function undoable(game: Game): UndoableEvent[] {
  return activeEvents(game.events);
}

export function pitchRowsOf(game: Game, replay: GameReplay): PitchRow[] {
  const info = gameInfo(game);
  const line = lineScore(replay, undoable(game));
  const eventSeq = new Map(game.events.map((e, i) => [e.id, i + 1]));
  const sceneSeq = new Map(replay.scenes.map((s, i) => [s.id, i + 1]));
  const edited = editedPitchIds(game);
  const rows: PitchRow[] = [];
  for (const pa of replay.plateAppearances) {
    let count = pa.startCount;
    pa.pitches.forEach((pitch, i) => {
      const situation = pa.pitchSituations[i];
      rows.push({
        game,
        info,
        pa,
        pitch,
        pitchSeq: i + 1,
        eventSeq: eventSeq.get(pitch.id) ?? 0,
        sceneSeq: sceneSeq.get(pa.sceneId) ?? 0,
        situation,
        countBefore: count,
        scoreBefore: scoreBefore(line, info.battingFirst, pa.inning, pa.half, situation.runsInHalf),
        edited: edited.has(pitch.id),
      });
      count = applyPitch(count, pitch.result).next;
    });
  }
  return rows;
}

export function gameRowOf(game: Game, replay: GameReplay): GameRow {
  return { game, info: gameInfo(game), replay, line: lineScore(replay, undoable(game)) };
}

// ---------- CSV ----------

/** RFC 4180: 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싸고, 안의 따옴표는 두 번 쓴다. 값이 없으면 빈 칸. */
export function csvCell(value: CellValue): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CRLF = '\r\n';

function toCsv<R>(columns: readonly Column<R>[], rows: readonly R[]): string {
  const lines = [columns.map((c) => csvCell(c.name)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(','));
  return lines.join(CRLF) + CRLF;
}

/** 공 표. 통계 프로그램이 첫 열 이름을 깨뜨리지 않도록 BOM은 붙이지 않는다. */
export function analysisPitchesCsv(games: readonly Game[], replayOf: (g: Game) => GameReplay): string {
  return toCsv(PITCH_COLUMNS, games.flatMap((g) => pitchRowsOf(g, replayOf(g))));
}

/** 경기 표 */
export function analysisGamesCsv(games: readonly Game[], replayOf: (g: Game) => GameReplay): string {
  return toCsv(GAME_COLUMNS, games.map((g) => gameRowOf(g, replayOf(g))));
}

// ---------- 코드북 ----------

export type AnalysisFileKind = 'pitches' | 'games' | 'codebook';

/** 파일 이름. 예: yagumam_pitches_v1_2026-11-06.csv */
export function analysisFileName(kind: AnalysisFileKind, today: string): string {
  return `yagumam_${kind}_v${ANALYSIS_FORMAT_VERSION}_${today}.${kind === 'codebook' ? 'md' : 'csv'}`;
}

/** 마크다운 표 칸: 세로줄과 줄바꿈이 표를 깨지 않게 */
function mdCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function codeText(codes: readonly CodeEntry[] | undefined): string {
  return codes ? codes.map((c) => `\`${c.code}\` ${c.label}`).join('<br>') : '';
}

function columnTable<R>(columns: readonly Column<R>[]): string[] {
  return [
    '| 순서 | 열 이름 | 뜻 | 타입 | 단위 | 코드 |',
    '| ---: | --- | --- | --- | --- | --- |',
    ...columns.map((c, i) =>
      `| ${i + 1} | \`${c.name}\` | ${mdCell(c.label)} | ${COLUMN_TYPE_LABEL[c.type]} | ${mdCell(c.unit ?? '')} | ${codeText(c.codes)} |`,
    ),
  ];
}

/** 변수 설명서 (Markdown). 열 정의에서 그대로 만든다. */
export function analysisCodebook(generatedAt: string, appVersion: string): string {
  return [
    `# 야구맘기록지 분석용 데이터 변수 설명서 (형식 버전 ${ANALYSIS_FORMAT_VERSION})`,
    '',
    `- analysis_format_version: ${ANALYSIS_FORMAT_VERSION}`,
    `- 만든 시각: ${generatedAt}`,
    `- 앱 버전: ${appVersion}`,
    '',
    '## 파일 공통 규칙',
    '',
    '- 인코딩 UTF-8 (BOM 없음), 구분자 쉼표, 줄 끝 CRLF, 따옴표 처리는 RFC 4180.',
    '- 첫 줄은 열 이름(영문 snake_case, 32자 이하). 둘째 줄부터 자료.',
    '- 빈 칸은 "값 없음"(기록하지 않음·해당 없음)이다. 0과 다르다.',
    '- 숫자 칸에는 숫자만 있다. 단위는 아래 표에 적었다.',
    '- 범주 칸의 값은 아래 코드 중 하나다. 형식 버전이 같으면 코드는 바뀌지 않는다.',
    '- 날짜는 YYYY-MM-DD, 시각은 ISO 8601(UTC)이다.',
    '- 타율·평균자책점 같은 계산 결과는 넣지 않았다. 원자료만 있으므로 필요한 통계는 직접 계산한다.',
    '- 아이가 나온 장면만 기록하므로, 경기의 모든 공이 들어 있지는 않다.',
    '',
    '## ID와 연결',
    '',
    '- `game_id`: 경기를 만들 때 붙인 고유 ID. 두 표를 이 열로 연결한다.',
    '- `pitch_id`: 공을 기록할 때 붙인 고유 ID. 공을 나중에 고쳐도 그대로라서 다시 내려받아도 같은 공을 찾을 수 있다.',
    '- `event_seq`: 경기에 저장된 모든 기록(공·주자 상황·고침·취소 등) 중 몇 번째인지. 기록은 덧붙이기만 하므로 바뀌지 않는다. 경기 안 시간 순서로 정렬할 때 쓴다.',
    '- `pa_id`: 타석의 첫 기록 id. `pa_seq`(타석 번호)는 앞 타석을 취소하면 밀릴 수 있지만 `pa_id`는 그 첫 기록을 취소하지 않는 한 그대로다.',
    '- 경기 안 투구·주자 상황 순서는 `pa_seq`, `pitch_seq` 또는 `event_seq`로 정렬한다.',
    '',
    `## pitches 표 (공 하나당 한 줄, ${PITCH_COLUMNS.length}개 열)`,
    '',
    ...columnTable(PITCH_COLUMNS),
    '',
    `## games 표 (경기 하나당 한 줄, ${GAME_COLUMNS.length}개 열)`,
    '',
    ...columnTable(GAME_COLUMNS),
    '',
  ].join('\n');
}
