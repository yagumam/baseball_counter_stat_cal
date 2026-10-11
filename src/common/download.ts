// 파일 내려받기. 미리보기 링크(claude.ai) 안에서는 페이지가 직접 내려받을 수 없어서
// 그 화면이 주는 "파일 넘겨주기" 기능을 쓰고, 그 밖(브라우저·홈 화면 앱)에서는 보통 다운로드를 쓴다.

interface DownloadsCapability {
  save(request: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}

interface ClaudeHost {
  use(name: 'downloads'): Promise<DownloadsCapability | null>;
}

export type DownloadResult = 'saved' | 'declined' | 'failed';

function host(): ClaudeHost | null {
  const claude = (window as unknown as { claude?: ClaudeHost }).claude;
  return claude && typeof claude.use === 'function' ? claude : null;
}

function browserDownload(filename: string, data: string | Blob, mimeType: string): void {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadFile(filename: string, data: string | Blob, mimeType: string): Promise<DownloadResult> {
  const claude = host();
  if (!claude) {
    browserDownload(filename, data, mimeType);
    return 'saved';
  }
  try {
    const downloads = await claude.use('downloads');
    // 링크를 따로 열면 window.claude는 있어도 기능은 없다(null). 그때는 보통 다운로드로.
    if (!downloads) {
      browserDownload(filename, data, mimeType);
      return 'saved';
    }
    await downloads.save({ filename, data });
    return 'saved';
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    return code === 'declined' ? 'declined' : 'failed';
  }
}

export type ShareResult = 'shared' | 'declined' | 'unsupported';

/**
 * 휴대폰 공유 창(카카오톡·구글 드라이브 등)으로 파일을 보낸다.
 * 공유 창이 .json을 받지 않으면(안드로이드 Chrome 등) 같은 내용을 .txt로 보낸다.
 * 공유를 못 쓰는 곳(컴퓨터 브라우저, 미리보기 화면 등)이면 'unsupported'.
 */
export async function shareFile(names: { primary: string; fallback: string }, data: string): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return 'unsupported';
  const candidates = [new File([data], names.primary, { type: 'application/json' }), new File([data], names.fallback, { type: 'text/plain' })];
  const file = candidates.find((f) => nav.canShare?.({ files: [f] }));
  if (!file) return 'unsupported';
  try {
    await nav.share({ files: [file], title: file.name });
    return 'shared';
  } catch (error) {
    return (error as { name?: string } | null)?.name === 'AbortError' ? 'declined' : 'unsupported';
  }
}
