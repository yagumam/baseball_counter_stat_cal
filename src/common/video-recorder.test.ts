import { describe, expect, it } from 'vitest';
import { elapsedLabel, extensionOf, pickRecordingType, videoFileName } from './video-recorder';
import { shortTeamName } from './video-overlay';

describe('영상 녹화 형식 고르기', () => {
  it('mp4가 되면 mp4를 먼저 고른다 (갤러리에서 바로 보이게)', () => {
    expect(pickRecordingType(() => true)).toBe('video/mp4;codecs=avc1.640028,mp4a.40.2');
  });

  it('mp4가 안 되면 webm', () => {
    expect(pickRecordingType((t) => t.startsWith('video/webm'))).toBe('video/webm;codecs=vp9,opus');
  });

  it('아무것도 안 되면 null', () => {
    expect(pickRecordingType(() => false)).toBeNull();
  });

  it('형식에 맞는 확장자', () => {
    expect(extensionOf('video/mp4;codecs=avc1')).toBe('mp4');
    expect(extensionOf('video/webm;codecs=vp8')).toBe('webm');
  });
});

describe('녹화 시간 표시', () => {
  it('0초, 75초, 10분', () => {
    expect(elapsedLabel(0)).toBe('0:00');
    expect(elapsedLabel(75_400)).toBe('1:15');
    expect(elapsedLabel(600_000)).toBe('10:00');
  });

  it('음수는 0으로', () => {
    expect(elapsedLabel(-5)).toBe('0:00');
  });
});

describe('영상 파일 이름', () => {
  it('경기 날짜 · 상대팀 · 녹화 시작 시각', () => {
    expect(videoFileName('2026-11-09', '한빛', new Date(2026, 10, 9, 14, 30, 5), 'mp4')).toBe('2026-11-09_한빛_투구영상_143005.mp4');
  });

  it('파일 이름에 못 쓰는 글자와 빈칸은 _로, 상대팀이 비면 뺀다', () => {
    expect(videoFileName('2026-11-09', 'A/B 팀', new Date(2026, 10, 9, 9, 5, 0), 'webm')).toBe('2026-11-09_A_B_팀_투구영상_090500.webm');
    expect(videoFileName('2026-11-09', '  ', new Date(2026, 10, 9, 9, 5, 0), 'mp4')).toBe('2026-11-09_투구영상_090500.mp4');
  });
});

describe('영상 상황판의 팀 이름', () => {
  it('6글자까지는 그대로, 넘으면 줄임표', () => {
    expect(shortTeamName('한빛')).toBe('한빛');
    expect(shortTeamName('서울한빛리틀야구단')).toBe('서울한빛리틀…');
  });
});
