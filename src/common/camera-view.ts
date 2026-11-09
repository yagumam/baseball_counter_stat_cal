// 영상 찍기 화면 조각: 녹화 단추와 녹화가 끝난 뒤 저장·보내기 창.
// 카메라·녹화는 video-recorder.ts, 영상 위 상황판 그림은 video-overlay.ts가 맡는다.

import { h } from './dom';
import { VIDEO_LABEL } from './labels';
import { popup } from './popup';
import { CameraStatus, RecordedVideo } from './video-recorder';

/** 기록 입력 화면이 받는 카메라 상태 */
export interface CameraModel {
  readonly status: CameraStatus;
  readonly canvas: HTMLCanvasElement;
  readonly timer: HTMLElement;
  readonly error: string | null;
}

export interface CameraActions {
  open: () => void;
  close: () => void;
  record: () => void;
  stopRecord: () => void;
  save: () => void;
  share: () => void;
  discard: () => void;
}

const BYTES_PER_MB = 1024 * 1024;

/** 카메라 그림 자리. 켜는 중이거나 켤 수 없으면 글로 알린다. */
export function cameraPreview(camera: CameraModel): HTMLElement {
  if (camera.status === 'ready' || camera.status === 'recording') {
    return h('div', { className: `camera-preview${camera.status === 'recording' ? ' recording' : ''}` }, [camera.canvas]);
  }
  const text = camera.error ?? (camera.status === 'starting' ? '카메라를 켜는 중…' : '카메라가 꺼져 있어요');
  return h('div', { className: 'camera-preview empty' }, [h('p', { text, attrs: { role: 'status' } })]);
}

/** 녹화 시작·끝 단추. 엄지 쪽(상황판 옆 칸 아래)에 둔다. "카메라 끄기"는 상황판 맨 위 줄에 있다. */
export function cameraButton(camera: CameraModel, actions: CameraActions): HTMLElement {
  const recording = camera.status === 'recording';
  return h(
    'button',
    {
      className: `camera-record${recording ? ' on' : ''}`,
      disabled: camera.status !== 'ready' && !recording,
      attrs: { 'aria-pressed': recording ? 'true' : 'false' },
      onClick: recording ? actions.stopRecord : actions.record,
    },
    recording ? [`■ ${VIDEO_LABEL.stop} `, camera.timer] : [`● ${VIDEO_LABEL.record}`],
  );
}

/** 녹화가 끝난 뒤: 휴대폰에 저장하거나 카카오톡 등으로 보낸다. */
export function videoSavePopup(recorded: RecordedVideo, actions: CameraActions): HTMLElement {
  const size = (recorded.blob.size / BYTES_PER_MB).toFixed(1);
  // 창 바깥을 잘못 눌러 영상을 잃지 않도록, 바깥을 눌러도 닫지 않는다.
  return popup('video-save', '찍은 영상', () => undefined, [
    h('p', { className: 'section-title', text: '찍은 영상' }),
    h('p', { className: 'help', text: `${size}MB · 상황판이 함께 녹화됐어요. "${VIDEO_LABEL.save}"을 누르면 휴대폰의 "다운로드"(갤러리)에 저장돼요.` }),
    h('div', { className: 'confirm-buttons' }, [
      h('button', { className: 'secondary', text: VIDEO_LABEL.share, onClick: actions.share }),
      h('button', { className: 'primary', text: VIDEO_LABEL.save, onClick: actions.save }),
    ]),
    h('button', { className: 'link-button', text: `${VIDEO_LABEL.discard} (영상이 사라져요)`, onClick: actions.discard }),
  ]);
}
