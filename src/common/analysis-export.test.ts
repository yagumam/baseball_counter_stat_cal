import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_FORMAT_VERSION,
  Column,
  GAME_COLUMNS,
  PLAY_COLUMNS,
  MAX_COLUMN_NAME_LENGTH,
  PITCH_COLUMNS,
  analysisCodebook,
  analysisFileName,
  analysisGamesCsv,
  analysisPitchesCsv,
  analysisPlaysCsv,
  csvCell,
  snakeCode,
} from './analysis-export';
import { activeEvents, playEvents } from './events';
import { Game, addAppearance, addEdit, addPitch, addPlay, addScore, addVoid, createGame, gameInfo } from './game';
import { replayGame } from './replay';

const replayOf = (g: Game) =>
  replayGame(playEvents(activeEvents(g.events)), { battingFirst: gameInfo(g).battingFirst, miniGame: gameInfo(g).gameType === 'mini' });

/** RFC 4180 CSV 읽기 (테스트용). 따옴표 안의 쉼표·줄바꿈·두 번 쓴 따옴표를 처리한다. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) rows.push([...row, cell]);
  return rows;
}

/** 머리줄을 열 이름으로 써서 줄마다 { 열 이름: 값 } */
function records(csv: string): Record<string, string>[] {
  const [header, ...body] = parseCsv(csv);
  return body.map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i]])));
}

const OPPONENT = '서울 "A", 초\n2팀';

/**
 * 예시 경기 (후공: 1회초가 상대 공격, 아이가 투수)
 * 타석 1: 볼(직구 98, 존 밖) → 2루타 (2루 주자)
 * 타석 2: 볼 → 2루 주자 3루 도루 → 희생플라이 (3루 주자 홈인, 1아웃)
 * 타석 3: 스트라이크 (1아웃, 이 초에 1점 들어온 뒤)
 */
function sampleGame(): Game {
  let g = createGame({ date: '2026-10-05', opponent: OPPONENT, gameType: 'practice', battingFirst: 'them', venue: 'home', ourTeam: '', place: '' });
  g = addAppearance(g, { role: 'pitcher', inning: 1, outs: 0, bases: [false, false, false], balls: 0, strikes: 0 });
  g = addPitch(g, 'ball', { pitchType: 'fastball', speed: 98, zone: { x: 0.1, y: 0.5 } });
  g = addPitch(g, 'hit', { hitType: 'double', battedBall: { x: 0.8, y: 0.55, type: 'line', strength: 'hard' } });
  g = addPitch(g, 'ball');
  g = addPlay(g, 'stolenBase', 1);
  g = addPitch(g, 'out', { outType: 'sacrificeFly' });
  g = addPitch(g, 'strike');
  return g;
}

describe('분석용 열 정의', () => {
  const all: readonly Column<never>[] = [
    ...(PITCH_COLUMNS as readonly Column<never>[]),
    ...(PLAY_COLUMNS as readonly Column<never>[]),
    ...(GAME_COLUMNS as readonly Column<never>[]),
  ];

  it('열 이름은 영문 snake_case, 32자 이하, 표 안에서 겹치지 않는다', () => {
    for (const c of all) {
      expect(c.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(c.name.length).toBeLessThanOrEqual(MAX_COLUMN_NAME_LENGTH);
    }
    expect(new Set(PITCH_COLUMNS.map((c) => c.name)).size).toBe(PITCH_COLUMNS.length);
    expect(new Set(GAME_COLUMNS.map((c) => c.name)).size).toBe(GAME_COLUMNS.length);
    expect(new Set(PLAY_COLUMNS.map((c) => c.name)).size).toBe(PLAY_COLUMNS.length);
  });

  it('범주 열에는 코드 목록이 있고, 코드는 영문 소문자', () => {
    for (const c of all.filter((col) => col.type === 'code' || col.type === 'binary')) {
      expect(c.codes?.length).toBeGreaterThan(0);
      for (const code of c.codes ?? []) expect(code.code).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('snakeCode: camelCase를 snake_case로', () => {
    expect(snakeCode('wildPitch')).toBe('wild_pitch');
    expect(snakeCode('reachedOnError')).toBe('reached_on_error');
    expect(snakeCode('ball')).toBe('ball');
  });

  it('공 표 열은 형식 버전 1 그대로다 (주자 상황 표를 더해도 바뀌지 않고, 새 열은 끝에만 더한다)', () => {
    expect(PITCH_COLUMNS.map((c) => c.name).join(',')).toBe(
      'game_id,game_date,pitch_id,event_seq,pa_id,pa_seq,pitch_seq,scene_id,scene_seq,child_role,child_position,child_base,' +
        'batter_actor,batter_hand,batter_grade,inning,half,outs_before,on_1b,on_2b,on_3b,balls_before,strikes_before,' +
        'runs_in_half_before,score_us_before,score_them_before,pitch_result,hit_type,out_type,double_play_base,pitch_type,' +
        'pitch_speed,zone_x,zone_y,batted_type,batted_strength,batted_x,batted_y,fielding_putout,fielding_assist,' +
        'fielding_error,pa_outcome,edited,created_at,author,runner_out_at_home',
    );
  });

  it('주자 상황 표의 상황 열은 공 표의 같은 이름 열과 순서가 같다', () => {
    const shared = PLAY_COLUMNS.map((c) => c.name).filter((n) => PITCH_COLUMNS.some((c) => c.name === n));
    const inPitches = PITCH_COLUMNS.map((c) => c.name).filter((n) => shared.includes(n));
    expect(shared).toEqual(inPitches);
  });

  it('공 표 열 순서가 고정돼 있다 (앞부분)', () => {
    expect(PITCH_COLUMNS.slice(0, 9).map((c) => c.name)).toEqual([
      'game_id', 'game_date', 'pitch_id', 'event_seq', 'pa_id', 'pa_seq', 'pitch_seq', 'scene_id', 'scene_seq',
    ]);
  });
});

describe('분석용 공 표 (pitches)', () => {
  const game = sampleGame();
  const csv = analysisPitchesCsv([game], replayOf);
  const rows = records(csv);

  it('BOM 없이 머리줄로 시작하고, 줄 끝은 CRLF, 머리줄 + 공 5줄', () => {
    expect(csv.startsWith('game_id,game_date,pitch_id,')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(parseCsv(csv)[0]).toEqual(PITCH_COLUMNS.map((c) => c.name));
    expect(rows).toHaveLength(5);
    for (const r of parseCsv(csv)) expect(r).toHaveLength(PITCH_COLUMNS.length);
  });

  it('식별자: 경기 id, 공 id, 기록 순번, 타석·공 순번', () => {
    const pitchEvents = game.events.filter((e) => e.kind === 'pitch');
    expect(rows.map((r) => r.game_id)).toEqual(Array(5).fill(game.id));
    expect(rows.map((r) => r.pitch_id)).toEqual(pitchEvents.map((e) => e.id));
    // 이벤트 순서: 1 경기 정보, 2 등장, 3 볼, 4 2루타, 5 볼, 6 도루, 7 희생플라이, 8 스트라이크
    expect(rows.map((r) => r.event_seq)).toEqual(['3', '4', '5', '7', '8']);
    expect(rows.map((r) => r.pa_seq)).toEqual(['1', '1', '2', '2', '3']);
    expect(rows.map((r) => r.pitch_seq)).toEqual(['1', '2', '1', '2', '1']);
    expect(rows.map((r) => r.pa_id)).toEqual([pitchEvents[0].id, pitchEvents[0].id, pitchEvents[2].id, pitchEvents[2].id, pitchEvents[4].id]);
    expect(rows.every((r) => r.scene_seq === '1' && r.child_role === 'pitcher' && r.child_position === 'pitcher')).toBe(true);
  });

  it('첫 공: 1회초 0아웃 주자 없음, 볼 0 · 스트라이크 0, 볼, 직구 98, 존 0.1/0.5', () => {
    const r = rows[0];
    expect([r.game_date, r.inning, r.half, r.outs_before, r.on_1b, r.on_2b, r.on_3b]).toEqual(['2026-10-05', '1', 'top', '0', '0', '0', '0']);
    expect([r.balls_before, r.strikes_before, r.pitch_result, r.pitch_type, r.pitch_speed, r.zone_x, r.zone_y]).toEqual(['0', '0', 'ball', 'fastball', '98', '0.1', '0.5']);
    expect(r.batter_actor).toBe('opponent');
    expect(r.pa_outcome).toBe('hit');
  });

  it('빈 값은 빈 칸 (0과 구분)', () => {
    const r = rows[0];
    expect([r.hit_type, r.out_type, r.batted_type, r.batter_hand, r.batter_grade, r.child_base, r.double_play_base]).toEqual(['', '', '', '', '', '', '']);
    // 투수는 수비 중이므로 수비 기록은 0
    expect([r.fielding_putout, r.fielding_assist, r.fielding_error]).toEqual(['0', '0', '0']);
  });

  it('둘째 공: 던지기 전 볼 1, 2루타, 라인드라이브 세게, 낙구 0.8/0.55', () => {
    const r = rows[1];
    expect([r.balls_before, r.pitch_result, r.hit_type, r.batted_type, r.batted_strength, r.batted_x, r.batted_y]).toEqual(['1', 'hit', 'double', 'line', 'hard', '0.8', '0.55']);
  });

  it('같은 타석 안에서도 공마다 주자 상황이 바뀐다 (도루 뒤 3루 주자)', () => {
    expect([rows[2].on_2b, rows[2].on_3b]).toEqual(['1', '0']);
    expect([rows[3].on_2b, rows[3].on_3b, rows[3].balls_before]).toEqual(['0', '1', '1']);
    expect([rows[3].pitch_result, rows[3].out_type, rows[3].pa_outcome]).toEqual(['out', 'sacrifice_fly', 'out']);
  });

  it('희생플라이 뒤: 1아웃, 이 초에 1점, 상대 팀 점수 1', () => {
    const r = rows[4];
    expect([r.outs_before, r.on_3b, r.runs_in_half_before, r.score_them_before, r.score_us_before]).toEqual(['1', '0', '1', '1', '0']);
    expect(r.pa_outcome).toBe('');
  });

  it('범주 열의 값은 모두 코드북 코드 안에 있다', () => {
    for (const c of PITCH_COLUMNS.filter((col) => col.codes)) {
      const codes = new Set((c.codes ?? []).map((x) => x.code));
      for (const r of rows) if (r[c.name] !== '') expect(codes.has(r[c.name])).toBe(true);
    }
  });

  it('ID 안정성: 다시 내려받아도 같고, 기록을 더해도 앞 줄은 그대로', () => {
    expect(analysisPitchesCsv([game], replayOf)).toBe(csv);
    const more = records(analysisPitchesCsv([addPitch(game, 'ball')], replayOf));
    expect(more.slice(0, 5).map((r) => [r.pitch_id, r.event_seq, r.pa_id])).toEqual(rows.map((r) => [r.pitch_id, r.event_seq, r.pa_id]));
  });

  it('앞 공을 취소하면 타석 번호는 밀려도 공 id·기록 순번·타석 id는 그대로', () => {
    const pitchEvents = game.events.filter((e) => e.kind === 'pitch');
    // 첫 타석의 두 공을 모두 취소: 타석 1이 사라진다.
    const voided = records(analysisPitchesCsv([addVoid(addVoid(game, pitchEvents[0].id), pitchEvents[1].id)], replayOf));
    const last = voided[voided.length - 1];
    expect(last.pitch_id).toBe(rows[4].pitch_id);
    expect(last.event_seq).toBe(rows[4].event_seq);
    expect(last.pa_id).toBe(rows[4].pa_id);
  });

  it('고친 공은 고친 값으로 적고 edited = 1', () => {
    const firstId = game.events.filter((e) => e.kind === 'pitch')[0].id;
    const r = records(analysisPitchesCsv([addEdit(game, firstId, 'strike')], replayOf));
    expect([r[0].pitch_result, r[0].edited, r[1].edited, r[1].balls_before, r[1].strikes_before]).toEqual(['strike', '1', '0', '0', '1']);
  });

  it('수비·타자 장면: 아이 역할·수비 자리·수비 기록, 공격 중이면 수비 기록은 빈 칸', () => {
    let g = createGame({ date: '2026-10-06', opponent: '가팀', gameType: 'tournament', battingFirst: 'them', venue: 'home', ourTeam: '', place: '' });
    g = addAppearance(g, { role: 'fielder', position: 'shortstop', inning: 1, outs: 0, bases: [false, false, false], balls: 0, strikes: 0 });
    g = addPitch(g, 'out', { fielding: ['putout', 'assist'] });
    g = addAppearance(g, { role: 'batter', inning: 1, outs: 0, bases: [false, false, false], balls: 0, strikes: 0 });
    g = addPitch(g, 'hit', { hitType: 'single' });
    g = addPitch(g, 'ball');
    const r = records(analysisPitchesCsv([g], replayOf));
    expect([r[0].child_role, r[0].child_position, r[0].fielding_putout, r[0].fielding_assist, r[0].fielding_error]).toEqual(['fielder', 'shortstop', '1', '1', '0']);
    expect([r[1].child_role, r[1].half, r[1].batter_actor, r[1].child_position, r[1].fielding_putout, r[1].scene_seq]).toEqual(['batter', 'bottom', 'child', '', '', '2']);
    // 안타로 나간 뒤 다음 타자의 공: 아이는 1루 주자
    expect([r[2].child_role, r[2].batter_actor, r[2].child_base, r[2].on_1b]).toEqual(['runner', 'teammate', '1b', '1']);
  });

  it('와일드피치·포일 홈 아웃: 홈 아웃 1, 그냥 와일드피치 0, 다른 공은 빈 칸', () => {
    let g = createGame({ date: '2026-11-08', opponent: '가팀', gameType: 'practice', battingFirst: 'them', venue: 'home', ourTeam: '', place: '' });
    g = addAppearance(g, { role: 'pitcher', inning: 1, outs: 0, bases: [true, false, true], balls: 0, strikes: 0 });
    g = addPitch(g, 'wildPitch', { runnerOutAtHome: true });
    g = addPitch(g, 'passedBall');
    g = addPitch(g, 'ball');
    const r = records(analysisPitchesCsv([g], replayOf));
    expect(r.map((x) => x.runner_out_at_home)).toEqual(['1', '0', '']);
    // 홈 아웃 뒤 다음 공: 1아웃, 1루 주자는 2루, 점수 없음
    expect([r[1].outs_before, r[1].on_1b, r[1].on_2b, r[1].on_3b, r[1].score_them_before]).toEqual(['1', '0', '1', '0', '0']);
  });

  it('앞 초·말의 점수는 스코어보드(직접 넣은 점수 우선) 값을 쓴다', () => {
    let g = createGame({ date: '2026-10-06', opponent: '가팀', gameType: 'practice', battingFirst: 'them', venue: 'home', ourTeam: '', place: '' });
    g = addScore(g, 'them', 1, 2);
    g = addScore(g, 'us', 1, 3);
    g = addAppearance(g, { role: 'pitcher', inning: 2, outs: 0, bases: [false, false, false], balls: 0, strikes: 0 });
    g = addPitch(g, 'ball');
    const [r] = records(analysisPitchesCsv([g], replayOf));
    expect([r.inning, r.score_them_before, r.score_us_before, r.runs_in_half_before]).toEqual(['2', '2', '3', '0']);
  });
});

describe('분석용 주자 상황 표 (plays)', () => {
  const game = sampleGame();
  const csv = analysisPlaysCsv([game], replayOf);
  const rows = records(csv);

  it('머리줄 + 주자 상황 1줄 (예시 경기의 3루 도루)', () => {
    expect(parseCsv(csv)[0]).toEqual(PLAY_COLUMNS.map((c) => c.name));
    expect(rows).toHaveLength(1);
    for (const r of parseCsv(csv)) expect(r).toHaveLength(PLAY_COLUMNS.length);
  });

  it('도루: 2루 주자, 일어나기 전 볼 1 · 0아웃, 타석 2의 첫 공 뒤', () => {
    const r = rows[0];
    const play = game.events.find((e) => e.kind === 'play');
    const pitches = records(analysisPitchesCsv([game], replayOf));
    expect([r.play_id, r.game_id, r.event_seq, r.pa_seq, r.pa_id, r.pitches_before]).toEqual([play?.id, game.id, '6', '2', pitches[2].pa_id, '1']);
    expect([r.play_kind, r.runner_base, r.runner_is_child, r.child_role]).toEqual(['stolen_base', '2b', '0', 'pitcher']);
    expect([r.outs_before, r.on_1b, r.on_2b, r.on_3b, r.balls_before, r.strikes_before, r.runs_in_half_before]).toEqual(['0', '0', '1', '0', '1', '0', '0']);
    expect([r.fielding_putout, r.fielding_assist, r.fielding_error]).toEqual(['0', '0', '0']);
  });

  it('공과 합쳐 event_seq로 정렬하면 기록한 순서가 된다', () => {
    const pitches = records(analysisPitchesCsv([game], replayOf));
    const order = [...pitches.map((r) => ['p', Number(r.event_seq)] as const), ...rows.map((r) => ['x', Number(r.event_seq)] as const)]
      .sort((a, b) => a[1] - b[1])
      .map(([k]) => k);
    expect(order).toEqual(['p', 'p', 'p', 'x', 'p', 'p']);
  });

  it('아이가 주자: 아이 도루는 runner_is_child = 1, 공격 중이라 수비 기록은 빈 칸', () => {
    let g = createGame({ date: '2026-10-06', opponent: '가팀', gameType: 'practice', battingFirst: 'them', venue: 'home', ourTeam: '', place: '' });
    g = addAppearance(g, { role: 'batter', inning: 1, outs: 0, bases: [false, false, false], balls: 0, strikes: 0 });
    g = addPitch(g, 'hit', { hitType: 'single' });
    g = addPlay(g, 'stolenBase', 0);
    g = addPlay(g, 'error');
    const r = records(analysisPlaysCsv([g], replayOf));
    expect([r[0].child_role, r[0].half, r[0].child_base, r[0].runner_base, r[0].runner_is_child, r[0].fielding_putout, r[0].pitches_before]).toEqual(['runner', 'bottom', '1b', '1b', '1', '', '0']);
    // 실책 진루는 베이스를 정하지 않아 빈 칸, 도루 뒤 아이는 2루
    expect([r[1].play_kind, r[1].runner_base, r[1].runner_is_child, r[1].child_base]).toEqual(['error', '', '', '2b']);
  });

  it('수비 중 견제 아웃: 아이 수비 기록, 예전 2루 도루 기록은 1루 주자', () => {
    let g = createGame({ date: '2026-10-06', opponent: '가팀', gameType: 'practice', battingFirst: 'them', venue: 'home', ourTeam: '', place: '' });
    g = addAppearance(g, { role: 'fielder', position: 'firstBase', inning: 1, outs: 0, bases: [true, false, false], balls: 0, strikes: 0 });
    g = addPlay(g, 'stolenSecond');
    g = addPlay(g, 'pickoffOut', 1, ['putout']);
    const r = records(analysisPlaysCsv([g], replayOf));
    expect([r[0].play_kind, r[0].runner_base, r[0].on_1b]).toEqual(['stolen_second', '1b', '1']);
    expect([r[1].play_kind, r[1].runner_base, r[1].on_2b, r[1].child_position, r[1].fielding_putout, r[1].fielding_assist]).toEqual(['pickoff_out', '2b', '1', 'first_base', '1', '0']);
    for (const c of PLAY_COLUMNS.filter((col) => col.codes)) {
      const codes = new Set((c.codes ?? []).map((x) => x.code));
      for (const row of r) if (row[c.name] !== '') expect(codes.has(row[c.name])).toBe(true);
    }
  });
});

describe('분석용 경기 표 (games)', () => {
  const game = addScore(sampleGame(), 'us', 1, 4);
  const csv = analysisGamesCsv([game], replayOf);

  it('따옴표·쉼표·줄바꿈이 든 상대팀 이름도 읽으면 그대로 돌아온다 (왕복)', () => {
    const [r] = records(csv);
    expect(r.opponent).toBe(OPPONENT);
    expect(csv).toContain('"서울 ""A"", 초\n2팀"');
  });

  it('경기 하나당 한 줄: 구분·선후공·점수·공 수', () => {
    const rows = records(csv);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect([r.game_id, r.game_date, r.game_type, r.batting_first, r.venue]).toEqual([game.id, '2026-10-05', 'practice', 'them', 'home']);
    expect([r.runs_us, r.runs_them, r.hits_them, r.pa_count, r.pitch_count, r.game_ended]).toEqual(['4', '1', '1', '3', '5', '0']);
    expect([r.our_team, r.place, r.copied_from]).toEqual(['', '', '']);
    expect(parseCsv(csv)[0]).toEqual(GAME_COLUMNS.map((c) => c.name));
  });

  it('범주 열의 값은 모두 코드북 코드 안에 있다', () => {
    const [r] = records(csv);
    for (const c of GAME_COLUMNS.filter((col) => col.codes)) {
      expect((c.codes ?? []).map((x) => x.code)).toContain(r[c.name]);
    }
  });
});

describe('CSV 칸 · 코드북 · 파일 이름', () => {
  it('RFC 4180 따옴표 처리', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(0)).toBe('0');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\r\nb')).toBe('"a\r\nb"');
    expect(parseCsv(`${['x', 'a,b', 'say "hi"', 'a\nb', ''].map(csvCell).join(',')}\r\n`)).toEqual([['x', 'a,b', 'say "hi"', 'a\nb', '']]);
  });

  it('코드북: 형식 버전과 모든 열 이름·코드가 열 정의에서 나온다', () => {
    const md = analysisCodebook('2026-11-06T00:00:00.000Z', '0.1.0');
    expect(md).toContain(`analysis_format_version: ${ANALYSIS_FORMAT_VERSION}`);
    for (const c of [...PITCH_COLUMNS, ...PLAY_COLUMNS, ...GAME_COLUMNS]) expect(md).toContain(`\`${c.name}\``);
    expect(md).toContain('## plays 표');
    expect(md).toContain('`stolen_base` 도루 성공');
    for (const code of PITCH_COLUMNS.find((c) => c.name === 'pitch_result')?.codes ?? []) expect(md).toContain(`\`${code.code}\` ${code.label}`);
    expect(md).toContain('`passed_ball` 포일');
  });

  it('파일 이름에 형식 버전이 들어간다', () => {
    expect(analysisFileName('pitches', '2026-11-06')).toBe('yagumam_pitches_v1_2026-11-06.csv');
    expect(analysisFileName('plays', '2026-11-06')).toBe('yagumam_plays_v1_2026-11-06.csv');
    expect(analysisFileName('games', '2026-11-06')).toBe('yagumam_games_v1_2026-11-06.csv');
    expect(analysisFileName('codebook', '2026-11-06')).toBe('yagumam_codebook_v1_2026-11-06.md');
  });
});
