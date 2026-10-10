import { describe, expect, it } from 'vitest';
import { activeEvents, EditEvent, LogEvent, PlayLogEvent, playEvents } from './events';
import { replayGame } from './replay';
import { adjust, appear, exit, gameEnd, hit, pitchWith, pitches, play, settings } from './test-helpers';

/** 1회 선발 투수로 등장한 뒤의 기록 */
const asPitcher = (...events: PlayLogEvent[]) => replayGame([appear('pitcher'), ...events], settings());

describe('카운트와 타석 결과 (투수 장면)', () => {
  it('볼 4개면 볼넷, 종료 카운트는 마지막 공 직전', () => {
    const { plateAppearances: [pa] } = asPitcher(...pitches('ball', 'strike', 'ball', 'ball', 'ball'));
    expect(pa.outcome).toBe('walk');
    expect(pa.endCount).toEqual({ balls: 3, strikes: 1 });
    expect(pa.actor).toBe('opponent');
  });

  it('스트라이크 3개면 삼진', () => {
    const { plateAppearances: [pa] } = asPitcher(...pitches('strike', 'strike', 'strike'));
    expect(pa.outcome).toBe('strikeout');
  });

  it('2스트라이크 이후 일반 파울은 카운트가 그대로다', () => {
    expect(asPitcher(...pitches('foul', 'foul', 'foul', 'foul')).state?.count).toEqual({ balls: 0, strikes: 2 });
  });

  it('쓰리번트 아웃: 2스트라이크에서 번트 파울은 삼진', () => {
    const r = asPitcher(...pitches('strike', 'foul', 'buntFoul'));
    expect(r.plateAppearances[0].outcome).toBe('strikeout');
    expect(r.state?.outs).toBe(1);
  });

  it('2스트라이크 전 번트 파울은 스트라이크 하나', () => {
    expect(asPitcher(...pitches('buntFoul')).state?.count).toEqual({ balls: 0, strikes: 1 });
  });

  it('와일드피치는 볼로 센다 (볼 4개째면 볼넷)', () => {
    expect(asPitcher(...pitches('ball', 'ball', 'ball', 'wildPitch')).plateAppearances[0].outcome).toBe('walk');
  });

  it('초구 안타는 0-0, 풀카운트 아웃은 3-2에서 끝난다', () => {
    expect(asPitcher(hit('single')).plateAppearances[0].endCount).toEqual({ balls: 0, strikes: 0 });
    const full = asPitcher(...pitches('ball', 'ball', 'ball', 'strike', 'strike', 'out'));
    expect(full.plateAppearances[0].endCount).toEqual({ balls: 3, strikes: 2 });
  });
});

describe('주자 이동과 득점', () => {
  it('볼넷은 밀려나는 주자만: 2루 주자만 있으면 1·2루', () => {
    const r = asPitcher(adjust(1, 0, [false, true, false]), ...pitches('ball', 'ball', 'ball', 'ball'));
    expect(r.state?.bases).toEqual([true, true, false]);
  });

  it('주자 1·2루 3루타: 2점, 타자는 3루', () => {
    const r = asPitcher(adjust(1, 0, [true, true, false]), hit('triple'));
    expect(r.plateAppearances[0].runs).toBe(2);
    expect(r.state?.bases).toEqual([false, false, true]);
  });

  it('만루 홈런 4점, 만루 밀어내기 1점, 3루 주자 와일드피치 1점', () => {
    expect(asPitcher(adjust(1, 0, [true, true, true]), hit('homeRun')).plateAppearances[0].runs).toBe(4);
    expect(asPitcher(adjust(1, 0, [true, true, true]), ...pitches('ball', 'ball', 'ball', 'ball')).plateAppearances[0].runs).toBe(1);
    expect(asPitcher(adjust(1, 0, [false, false, true]), ...pitches('wildPitch')).plateAppearances[0].runs).toBe(1);
  });

  it('실책 출루: 1루로, 실책 1개 / 실책 진루 뒤 고치기로 득점', () => {
    expect(asPitcher(...pitches('reachedOnError')).plateAppearances[0].errors).toBe(1);
    const r = asPitcher(adjust(1, 0, [false, false, true]), ...pitches('ball'), play('error'), adjust(1, 0, [false, false, false], 1));
    expect(r.plateAppearances[0].errors).toBe(1);
    expect(r.plateAppearances[0].runs).toBe(1);
  });

  it('도루: 3루·홈 도루, 도루 실패 아웃, 견제는 그대로', () => {
    const steal = asPitcher(adjust(1, 0, [false, true, false]), play('stolenBase', 1), play('stolenBase', 2));
    expect(steal.state?.bases).toEqual([false, false, false]);
    expect(steal.plateAppearances[0].runs).toBe(1);
    const caught = asPitcher(adjust(1, 0, [true, true, false]), play('caughtStealing', 1));
    expect(caught.state?.bases).toEqual([true, false, false]);
    expect(caught.state?.outs).toBe(1);
    expect(asPitcher(adjust(1, 0, [true, true, false]), play('pickoff', 1)).state?.bases).toEqual([true, true, false]);
  });

  it('예전 기록의 2루 도루와 종류 없는 안타도 읽는다', () => {
    const r = asPitcher(...pitches('hit'), play('stolenSecond'));
    expect(r.plateAppearances[0].hitType).toBe('single');
    expect(r.state?.bases).toEqual([false, true, false]);
  });
});

describe('투수 장면의 이닝', () => {
  it('3아웃이면 다음 이닝 같은 쪽(초)으로 이어진다', () => {
    const r = asPitcher(...pitches('out', 'out', 'out'));
    expect(r.state).toMatchObject({ role: 'pitcher', inning: 2, half: 'top', outs: 0 });
  });

  it('중계: 4회말 1아웃 1·3루, 볼 2 · 스트라이크 1에서 등판 (선공 팀)', () => {
    const r = replayGame(
      [appear('pitcher', { inning: 4, outs: 1, bases: [true, false, true], balls: 2, strikes: 1 }), ...pitches('ball', 'ball')],
      settings('us'),
    );
    const pa = r.plateAppearances[0];
    expect(pa).toMatchObject({ inning: 4, half: 'bottom', outsBefore: 1, outcome: 'walk' });
    expect(pa.startCount).toEqual({ balls: 2, strikes: 1 });
    expect(pa.runs).toBe(0);
    expect(r.state?.bases).toEqual([true, true, true]);
  });

  it('타석 도중 도루 실패로 3아웃이면 "이닝 종료로 중단"', () => {
    const r = asPitcher(adjust(1, 2, [true, false, false]), ...pitches('ball'), play('caughtStealingSecond'));
    expect(r.plateAppearances[0].outcome).toBe('inningEnded');
    expect(r.state?.inning).toBe(2);
  });

  it('병살: 다음 공 전에 아웃을 고치면 방금 타석이 잡은 아웃', () => {
    const r = asPitcher(hit('single'), ...pitches('out'), adjust(1, 2, [false, false, false]));
    expect(r.plateAppearances[1].outsRecorded).toBe(2);
  });

  it('첫 기록 전에 고친 아웃은 시작 상황 (잡은 아웃 아님)', () => {
    const r = asPitcher(adjust(1, 1, [true, false, false]), ...pitches('out'));
    expect(r.plateAppearances[0].outsBefore).toBe(1);
    expect(r.plateAppearances[0].outsRecorded).toBe(1);
  });

  it('교체되면 장면이 끝나고, 던지던 타석은 중단', () => {
    const r = asPitcher(...pitches('ball'), exit());
    expect(r.state).toBeNull();
    expect(r.plateAppearances[0].outcome).toBe('sceneEnded');
    expect(r.scenes[0].endedBy).toBe('exit');
  });
});

describe('타자·주자 장면 (우리 아이)', () => {
  it('아이 타석이 안타면 주자가 되어 장면이 이어진다', () => {
    const r = replayGame([appear('batter', { inning: 2 }), hit('double')], settings());
    expect(r.plateAppearances[0]).toMatchObject({ actor: 'child', half: 'bottom', hitType: 'double' });
    expect(r.state).toMatchObject({ role: 'runner', childBase: 1 });
  });

  it('아이가 아웃이면 장면이 끝난다', () => {
    const r = replayGame([appear('batter'), ...pitches('strike', 'strike', 'strike')], settings());
    expect(r.state).toBeNull();
    expect(r.scenes[0].endedBy).toBe('childDone');
  });

  it('주자인 아이: 뒤 타자 1루타에 한 칸 진루, 2루타에 득점', () => {
    const events = [appear('batter'), ...pitches('ball', 'ball', 'ball', 'ball'), hit('single')];
    const r = replayGame(events, settings());
    expect(r.state?.childBase).toBe(1);
    expect(r.plateAppearances[1].actor).toBe('teammate');
    const r2 = replayGame([...events, hit('double')], settings());
    expect(r2.state).toBeNull();
    expect(r2.runnerEvents.map((e) => e.kind)).toEqual(['scored']);
  });

  it('대주자: 2루에 등장해 3루 도루 성공, 견제 받고, 한 칸 진루(고치기)로 득점', () => {
    const r = replayGame(
      [
        appear('runner', { inning: 5, outs: 1, bases: [true, false, false], childBase: 1 }),
        play('stolenBase', 1),
        play('pickoff', 2),
        adjust(5, 1, [true, false, false], 1, 'scored'),
      ],
      settings(),
    );
    expect(r.runnerEvents.map((e) => e.kind)).toEqual(['stolenBase', 'pickoff', 'scored']);
    expect(r.state).toBeNull();
    expect(r.halves.get('5B')?.runs).toBe(1);
  });

  it('주자인 아이가 도루 실패하면 장면이 끝난다', () => {
    const r = replayGame([appear('runner', { childBase: 0 }), play('caughtStealing', 0)], settings());
    expect(r.runnerEvents[0].kind).toBe('caughtStealing');
    expect(r.state).toBeNull();
  });

  it('3아웃이면 베이스에 남은 아이는 잔루', () => {
    const r = replayGame([appear('runner', { outs: 2, childBase: 1 }), ...pitches('out')], settings());
    expect(r.runnerEvents.map((e) => e.kind)).toEqual(['stranded']);
    expect(r.scenes[0].endedBy).toBe('halfOver');
  });

  it('대타: 볼 1 · 스트라이크 2에서 등장', () => {
    const r = replayGame([appear('batter', { balls: 1, strikes: 2 }), ...pitches('strike')], settings());
    expect(r.plateAppearances[0]).toMatchObject({ outcome: 'strikeout', startCount: { balls: 1, strikes: 2 } });
  });

  it('수비 장면도 상대 타자 타석을 기록하고, 타석마다 아이의 수비 자리를 남긴다', () => {
    const r = replayGame([appear('fielder', { position: 'shortstop' }), ...pitches('ball', 'out')], settings());
    expect(r.state).toMatchObject({ role: 'fielder', position: 'shortstop', outs: 1 });
    expect(r.plateAppearances).toHaveLength(1);
    expect(r.plateAppearances[0]).toMatchObject({ actor: 'opponent', fieldingPosition: 'shortstop', outcome: 'out', outsRecorded: 1 });
  });

  it('수비 장면은 투수 장면처럼 3아웃이면 다음 이닝으로 이어진다', () => {
    const r = replayGame([appear('fielder', { position: 'centerField' }), ...pitches('out', 'out', 'out')], settings());
    expect(r.state).toMatchObject({ role: 'fielder', inning: 2, outs: 0 });
    expect(r.scenes[0].endedBy).toBeNull();
  });

  it('투수 장면의 타석은 수비 자리가 투수, 공격 장면은 없음(null)', () => {
    const r = replayGame([appear('pitcher'), ...pitches('out'), appear('batter', { inning: 1 }), ...pitches('out')], settings());
    expect(r.plateAppearances.map((pa) => pa.fieldingPosition)).toEqual(['pitcher', null]);
  });

  it('다음 등장이 오면 앞 장면은 끝난다', () => {
    const r = replayGame([appear('pitcher'), ...pitches('ball'), appear('batter', { inning: 1 })], settings());
    expect(r.scenes.map((s) => s.endedBy)).toEqual(['next', null]);
    expect(r.state?.role).toBe('batter');
  });
});


describe('취소', () => {
  it('취소한 기록은 빠지지만 기록 자체는 지워지지 않는다', () => {
    const [a, b] = pitches('ball', 'strike');
    const events: LogEvent[] = [a, b, { kind: 'void', id: 'v1', createdAt: b.createdAt, author: '테스트', targetId: b.id }];
    expect(activeEvents(events)).toEqual([a]);
    expect(events).toHaveLength(3);
  });
});

describe('병살 (타자 + 주자 한 명 아웃)', () => {
  it('1루 주자, 0아웃에서 병살: 2아웃, 주자 없음, 이 타석이 잡은 아웃 2개', () => {
    const r = replayGame([appear('pitcher', { bases: [true, false, false] }), pitchWith('out', { doublePlay: 0 })], settings());
    expect(r.state).toMatchObject({ outs: 2, bases: [false, false, false] });
    expect(r.plateAppearances[0]).toMatchObject({ outcome: 'out', outsRecorded: 2 });
  });

  it('1·3루, 1아웃에서 병살이면 3아웃 → 다음 이닝 (3루 주자는 들어오지 않는다)', () => {
    const r = replayGame([appear('pitcher', { outs: 1, bases: [true, false, true] }), pitchWith('out', { doublePlay: 0 })], settings());
    expect(r.state).toMatchObject({ inning: 2, outs: 0, bases: [false, false, false] });
    expect(r.halves.get('1T')?.runs ?? 0).toBe(0);
  });

  it('다른 주자는 그대로: 1·2루에서 2루 주자 병살이면 1루 주자는 남는다', () => {
    const r = replayGame([appear('pitcher', { bases: [true, true, false] }), pitchWith('out', { doublePlay: 1 })], settings());
    expect(r.state).toMatchObject({ outs: 2, bases: [true, false, false] });
  });

  it('그 베이스에 주자가 없으면 타자 아웃 하나만', () => {
    const r = replayGame([appear('pitcher'), pitchWith('out', { doublePlay: 0 })], settings());
    expect(r.state?.outs).toBe(1);
    expect(r.plateAppearances[0].outsRecorded).toBe(1);
  });

  it('주자인 우리 아이가 병살로 아웃되면 주루 기록에 아웃이 남고 장면이 끝난다', () => {
    const r = replayGame([appear('runner', { childBase: 0 }), pitchWith('out', { doublePlay: 0 })], settings());
    expect(r.runnerEvents.map((e) => e.kind)).toEqual(['out']);
    expect(r.scenes[0].endedBy).toBe('childDone');
  });
});

describe('주자 아웃 · 경기 끝', () => {
  it('아이 볼넷 뒤 앞 주자 견제 아웃: 아이는 1루에 그대로, 1아웃', () => {
    const r = replayGame([appear('batter', { bases: [false, true, false] }), ...pitches('ball', 'ball', 'ball', 'ball'), play('pickoffOut', 1)], settings());
    expect(r.state?.childBase).toBe(0);
    expect(r.state?.outs).toBe(1);
    expect(r.state?.bases).toEqual([true, false, false]);
  });

  it('아이가 안타 뒤 더 가다 주자 아웃: 아이 장면이 끝나고 주루 아웃으로 남는다', () => {
    const r = replayGame([appear('batter'), hit('single'), play('runnerOut', 0)], settings());
    expect(r.state).toBeNull();
    expect(r.runnerEvents.map((e) => e.kind)).toEqual(['out']);
    expect(r.scenes[0].endedBy).toBe('childDone');
  });

  it('경기 끝: 진행 중 장면을 마치고, 새 장면을 시작하면 다시 이어서 기록', () => {
    const ended = replayGame([appear('pitcher'), ...pitches('out'), gameEnd()], settings());
    expect(ended.gameEnded).toBe(true);
    expect(ended.state).toBeNull();
    expect(ended.scenes[0].endedBy).toBe('gameEnd');
    const resumed = replayGame([appear('pitcher'), gameEnd(), appear('batter', { inning: 2 })], settings());
    expect(resumed.gameEnded).toBe(false);
    expect(resumed.state?.role).toBe('batter');
  });
});

describe('지난 공 고치기', () => {
  const edit = (targetId: string, result: EditEvent['result'], hitType?: EditEvent['hitType']): EditEvent => ({
    kind: 'edit',
    id: `edit-${targetId}-${result}`,
    createdAt: '2026-10-06T00:00:00.000Z',
    author: '테스트',
    targetId,
    result,
    ...(hitType ? { hitType } : {}),
  });

  it('스트라이크를 볼로 고치면 카운트가 다시 계산되고, 원래 공은 이력으로 남는다', () => {
    const [p1, p2] = pitches('strike', 'strike');
    const events: LogEvent[] = [appear('pitcher'), p1, p2, edit(p1.id, 'ball')];
    const r = replayGame(playEvents(activeEvents(events)), settings());
    expect(r.state?.count).toEqual({ balls: 1, strikes: 1 });
    expect(events).toHaveLength(4);
  });

  it('아웃을 2루타로 고치면 안타가 되고, 아웃에만 붙던 병살·아웃 종류는 빠진다', () => {
    const out = pitchWith('out', { outType: 'productive' });
    const events: LogEvent[] = [appear('pitcher', { bases: [true, false, false] }), out, edit(out.id, 'hit', 'double')];
    const [pitch] = activeEvents(events).filter((e) => e.kind === 'pitch');
    expect(pitch).toMatchObject({ result: 'hit', hitType: 'double' });
    expect(pitch).not.toHaveProperty('outType');
    const r = replayGame(playEvents(activeEvents(events)), settings());
    expect(r.plateAppearances[0].outcome).toBe('hit');
    expect(r.state?.outs).toBe(0);
  });

  it('같은 공을 여러 번 고치면 마지막 것을 쓴다', () => {
    const [p1] = pitches('strike');
    const events: LogEvent[] = [appear('pitcher'), p1, edit(p1.id, 'ball'), edit(p1.id, 'foul')];
    const [pitch] = activeEvents(events).filter((e) => e.kind === 'pitch');
    expect(pitch).toMatchObject({ result: 'foul' });
  });

  it('투구 상세만 고치면 결과는 그대로, null은 지운다. 결과 고침과 겹쳐 쓴다', () => {
    const p1 = pitchWith('strike', { pitchType: 'fastball', speed: 100 });
    const detail: EditEvent = { kind: 'edit', id: 'd1', createdAt: '2026-10-06T00:00:00.000Z', author: '테스트', targetId: p1.id, pitchType: 'curveball', zone: { x: 0.5, y: 0.5 }, speed: null };
    const events: LogEvent[] = [appear('pitcher'), p1, detail, edit(p1.id, 'ball')];
    const [pitch] = activeEvents(events).filter((e) => e.kind === 'pitch');
    expect(pitch).toMatchObject({ result: 'ball', pitchType: 'curveball', zone: { x: 0.5, y: 0.5 } });
    expect(pitch).not.toHaveProperty('speed');
  });
});

describe('미니게임 (장면 설정 없이 1회초부터)', () => {
  const mini = (battingFirst: 'us' | 'them', ...events: PlayLogEvent[]) => replayGame(events, { battingFirst, miniGame: true });
  const threeOuts = () => pitches('out', 'out', 'out');

  it('기록이 없어도 1회초 장면이 열려 있다: 후공이면 아이가 투수', () => {
    const r = mini('them');
    expect(r.state).toMatchObject({ role: 'pitcher', inning: 1, half: 'top', outs: 0 });
  });

  it('선공이면 1회초에 아이가 타자', () => {
    expect(mini('us').state).toMatchObject({ role: 'batter', inning: 1, half: 'top' });
  });

  it('3아웃마다 초·말이 바뀌고 역할도 바뀐다: 1회초 투수 → 1회말 타자 → 2회초 투수', () => {
    const afterTop = mini('them', ...threeOuts());
    expect(afterTop.state).toMatchObject({ role: 'batter', inning: 1, half: 'bottom', outs: 0 });
    const afterBottom = mini('them', ...threeOuts(), ...threeOuts());
    expect(afterBottom.state).toMatchObject({ role: 'pitcher', inning: 2, half: 'top' });
    expect(afterBottom.scenes.map((s) => s.endedBy)).toEqual(['halfOver', 'halfOver', null]);
  });

  it('우리 공격에서는 타자가 매번 아이: 안타로 나가도 다음 타석도 아이 타석', () => {
    const r = mini('us', hit('single'), ...pitches('out'));
    expect(r.plateAppearances.map((pa) => pa.actor)).toEqual(['child', 'child']);
    expect(r.state).toMatchObject({ role: 'batter', childBase: null, bases: [true, false, false], outs: 1 });
  });

  it('주자 1루에서 아이가 2루타: 주자는 3루, 아이는 2루 (밀어내기만 자동)', () => {
    const r = mini('us', hit('single'), hit('double'));
    expect(r.state?.bases).toEqual([false, true, true]);
  });

  it('점수는 초·말별로 쌓인다: 1회초 상대 1점, 1회말 우리 홈런 1점', () => {
    const r = mini('them', hit('homeRun'), ...threeOuts(), hit('homeRun'));
    expect(r.halves.get('1T')?.runs).toBe(1);
    expect(r.halves.get('1B')?.runs).toBe(1);
  });

  it('경기 끝을 누르면 더 이상 장면이 열리지 않는다', () => {
    const r = mini('them', ...threeOuts(), gameEnd());
    expect(r.state).toBeNull();
    expect(r.gameEnded).toBe(true);
  });

  it('미니게임이 아니면 예전처럼 장면을 정해야 시작한다', () => {
    expect(replayGame(threeOuts(), settings()).state).toBeNull();
  });
});
