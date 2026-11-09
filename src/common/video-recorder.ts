// 영상 찍기: 휴대폰 뒤 카메라 화면에 상황판(video-overlay.ts)을 겹쳐 그리고, 그 그림을 그대로 녹화한다.
// 화면을 다시 그려도(기록 버튼을 누를 때마다) 카메라·녹화가 끊기지 않도록 앱이 하나만 만들어 계속 쓴다.

import { OverlaySnapshot, drawOverlay } from './video-overlay';

export type CameraStatus = 'off' | 'starting' | 'ready' | 'recording';

export interface RecordedVideo {
  readonly blob: Blob;
  readonly extension: 'mp4' | 'webm';
  readonly startedAt: Date;
}

/** 녹화 형식 후보. 갤럭시 갤러리에서 바로 보이도록 mp4를 먼저, 안 되면 webm. */
export const RECORDING_TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const;

/** 영상 녹화 품질 (초당 비트). 1080p 30프레임에 알맞은 값으로 10분이면 약 450MB. */
const VIDEO_BITS_PER_SECOND = 6_000_000;
const FRAMES_PER_SECOND = 30;
/** 카메라에 바라는 크기. 휴대폰을 세로로 들면 브라우저가 세로(1080×1920)로 돌려 준다. */
const CAMERA_LONG_SIDE = 1920;
const CAMERA_SHORT_SIDE = 1080;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

export function pickRecordingType(isSupported: (type: string) => boolean): string | null {
  return RECORDING_TYPES.find((type) => isSupported(type)) ?? null;
}

export function extensionOf(type: string): 'mp4' | 'webm' {
  return type.startsWith('video/mp4') ? 'mp4' : 'webm';
}

/** 녹화 시간 표시. 예: 75초 → "1:15" */
export function elapsedLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MS_PER_SECOND));
  const minutes = Math.floor(total / SECONDS_PER_MINUTE);
  const seconds = total % SECONDS_PER_MINUTE;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** 파일 이름에 못 쓰는 글자를 빼고, 경기 날짜·상대팀·녹화 시작 시각으로 이름을 짓는다. 예: "2026-11-09_한빛_투구영상_143005.mp4" */
export function videoFileName(gameDate: string, opponent: string, startedAt: Date, extension: string): string {
  const safe = (text: string): string => text.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '');
  const pad = (n: number): string => String(n).padStart(2, '0');
  const time = `${pad(startedAt.getHours())}${pad(startedAt.getMinutes())}${pad(startedAt.getSeconds())}`;
  return [safe(gameDate), safe(opponent), '투구영상', time].filter((part) => part !== '').join('_') + `.${extension}`;
}

/** 카메라를 켤 수 없을 때 보여줄 쉬운 설명 */
export function cameraErrorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return '카메라 사용이 막혀 있어요. 브라우저(또는 휴대폰 설정 > 애플리케이션)에서 카메라 권한을 허용해 주세요.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '쓸 수 있는 카메라를 찾지 못했어요.';
  if (name === 'NotReadableError') return '다른 앱이 카메라를 쓰고 있어요. 카메라 앱을 닫고 다시 눌러 주세요.';
  return '카메라를 켤 수 없어요. 이 브라우저에서는 영상 찍기를 쓸 수 없을 수도 있어요.';
}

type WakeLockLike = { release: () => Promise<void> };

export class OverlayCamera {
  /** 카메라 그림 + 상황판. 화면에 그대로 보여주고, 녹화도 이 그림으로 한다. */
  readonly canvas: HTMLCanvasElement;
  /** 녹화 시간 표시. 화면 전체를 다시 그리지 않고 이 글자만 바꾼다. */
  readonly timer: HTMLElement;
  status: CameraStatus = 'off';
  error: string | null = null;

  private readonly video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recordingStartedAt: Date | null = null;
  private snapshot: OverlaySnapshot | null = null;
  private flashId: string | null = null;
  private flashSince: number | null = null;
  private frame = 0;
  private tick: ReturnType<typeof setInterval> | undefined;
  private wakeLock: WakeLockLike | null = null;

  constructor(private readonly onChange: () => void) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'camera-canvas';
    this.timer = document.createElement('span');
    this.timer.className = 'camera-timer';
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
  }

  /** 기록 화면이 그려질 때마다 최신 상황을 넘긴다. 방금 기록이 바뀌었으면 잠깐 크게 띄운다. */
  setSnapshot(snapshot: OverlaySnapshot): void {
    const id = snapshot.lastEvent?.id ?? null;
    // 카메라를 막 켰을 때는 예전 기록을 띄우지 않는다.
    if (this.snapshot && id !== this.flashId) this.flashSince = id ? performance.now() : null;
    this.flashId = id;
    this.snapshot = snapshot;
  }

  async start(): Promise<void> {
    if (this.status !== 'off') return;
    this.error = null;
    this.status = 'starting';
    this.onChange();
    try {
      this.stream = await openCamera();
      this.video.srcObject = this.stream;
      await this.video.play();
      this.status = 'ready';
      this.frame = requestAnimationFrame(this.draw);
      void this.keepScreenOn();
    } catch (error) {
      this.release();
      this.error = cameraErrorMessage(error);
    }
    this.onChange();
  }

  startRecording(): void {
    if (this.status !== 'ready' || !this.stream) return;
    const type = typeof MediaRecorder === 'undefined' ? null : pickRecordingType((t) => MediaRecorder.isTypeSupported(t));
    if (!type) {
      this.error = '이 브라우저는 영상 녹화를 지원하지 않아요. 크롬이나 삼성 인터넷 최신 버전에서 열어 주세요.';
      this.onChange();
      return;
    }
    const recorded = this.canvas.captureStream(FRAMES_PER_SECOND);
    for (const track of this.stream.getAudioTracks()) recorded.addTrack(track);
    this.chunks = [];
    this.recorder = new MediaRecorder(recorded, { mimeType: type, videoBitsPerSecond: VIDEO_BITS_PER_SECOND });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    // 1초마다 조각을 받아 두면 갑자기 멈춰도 그때까지는 남는다.
    this.recorder.start(MS_PER_SECOND);
    this.recordingStartedAt = new Date();
    this.status = 'recording';
    this.error = null;
    this.timer.textContent = elapsedLabel(0);
    this.tick = setInterval(() => {
      if (this.recordingStartedAt) this.timer.textContent = elapsedLabel(Date.now() - this.recordingStartedAt.getTime());
    }, MS_PER_SECOND / 2);
    this.onChange();
  }

  /** 녹화를 끝내고 영상 파일을 돌려준다. 녹화 중이 아니면 null. */
  stopRecording(): Promise<RecordedVideo | null> {
    const recorder = this.recorder;
    const startedAt = this.recordingStartedAt;
    if (!recorder || !startedAt) return Promise.resolve(null);
    clearInterval(this.tick);
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || 'video/webm';
        const blob = new Blob(this.chunks, { type: type.split(';')[0] });
        this.chunks = [];
        this.recorder = null;
        this.recordingStartedAt = null;
        if (this.status === 'recording') this.status = this.stream ? 'ready' : 'off';
        this.onChange();
        resolve({ blob, extension: extensionOf(type), startedAt });
      };
      recorder.stop();
    });
  }

  /** 카메라를 끈다. 녹화 중이면 먼저 stopRecording으로 영상을 받아 둔다. */
  stop(): void {
    this.release();
    this.onChange();
  }

  private release(): void {
    cancelAnimationFrame(this.frame);
    clearInterval(this.tick);
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.video.srcObject = null;
    this.status = 'off';
    this.snapshot = null;
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
  }

  /** 촬영 중에 화면이 꺼지면 카메라도 멈추므로 화면을 켜 둔다. (지원하는 브라우저만) */
  private async keepScreenOn(): Promise<void> {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockLike> } };
    try {
      this.wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      // 배터리 절약 모드 등으로 거절되면 휴대폰 화면 꺼짐 설정을 따른다.
    }
  }

  private readonly draw = (): void => {
    const { videoWidth, videoHeight } = this.video;
    if (videoWidth > 0 && videoHeight > 0) {
      if (this.canvas.width !== videoWidth || this.canvas.height !== videoHeight) {
        this.canvas.width = videoWidth;
        this.canvas.height = videoHeight;
      }
      const ctx = this.canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(this.video, 0, 0, videoWidth, videoHeight);
        if (this.snapshot) drawOverlay(ctx, this.snapshot, videoWidth, videoHeight, this.flashSince, performance.now());
      }
    }
    this.frame = requestAnimationFrame(this.draw);
  };
}

/** 뒤 카메라 + 소리. 마이크가 막혀 있으면 소리 없이 찍는다. */
async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia 없음');
  const video: MediaTrackConstraints = {
    facingMode: { ideal: 'environment' },
    width: { ideal: CAMERA_LONG_SIDE },
    height: { ideal: CAMERA_SHORT_SIDE },
    frameRate: { ideal: FRAMES_PER_SECOND },
  };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: true });
  } catch (error) {
    if ((error as { name?: string } | null)?.name !== 'NotAllowedError') throw error;
    return navigator.mediaDevices.getUserMedia({ video, audio: false });
  }
}
