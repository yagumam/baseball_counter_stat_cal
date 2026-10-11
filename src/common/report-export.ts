// 분석 화면을 그림(JPG)으로, 분석 리포트를 PDF로 바꾼다.
// - html2canvas: 화면 조각을 그대로 그림으로 옮긴다. (한글 글꼴을 PDF에 따로 넣지 않아도 되도록 글자도 그림으로 담는다)
// - jsPDF: 쪽 그림들을 A4 PDF 한 파일로 묶는다.
// 두 라이브러리는 크므로 내려받기를 누를 때만 불러온다.

import { keepsWithNext, paginate, startsPage } from './report-view';

/** 리포트 한 쪽의 크기(화면 점 단위). A4(210×297mm) 비율 */
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const PAGE_PADDING = 40;
const PAGE_FOOTER = 28;
/** 덩어리 사이 간격 (report 스타일의 .report-block 아래 여백과 같게) */
const BLOCK_GAP = 14;
/** 그림을 화면보다 촘촘하게 그려 글자가 또렷하게 */
const RENDER_SCALE = 2;
const JPEG_QUALITY = 0.92;
const A4_MM = { width: 210, height: 297 };

/** SVG 안의 색·굵기는 스타일시트(클래스)로 칠하므로, 그림으로 옮기기 전에 각 요소에 직접 적어 둔다. */
const SVG_STYLE_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-size', 'font-weight', 'font-family', 'text-anchor', 'dominant-baseline'];

function inlineSvgStyles(doc: Document): void {
  const view = doc.defaultView;
  if (!view) return;
  doc.querySelectorAll('svg, svg *').forEach((el) => {
    const computed = view.getComputedStyle(el);
    const style = SVG_STYLE_PROPS.map((p) => `${p}:${computed.getPropertyValue(p)}`).join(';');
    el.setAttribute('style', `${el.getAttribute('style') ?? ''};${style}`);
  });
}

async function render(el: HTMLElement, background: string): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import('html2canvas');
  return html2canvas(el, {
    scale: RENDER_SCALE,
    backgroundColor: background,
    useCORS: true,
    logging: false,
    // 화면이 스크롤되어 있어도 조각 전체를 그린다.
    scrollX: 0,
    scrollY: -window.scrollY,
    windowWidth: document.documentElement.clientWidth,
    onclone: inlineSvgStyles,
  });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('그림을 만들지 못했어요.'))), 'image/jpeg', JPEG_QUALITY));
}

/** 지금 보이는 분석 화면을 그대로 JPG로 (내려받기 단추 등 data-html2canvas-ignore 표시는 빼고) */
export async function elementToJpeg(el: HTMLElement): Promise<Blob> {
  const background = getComputedStyle(document.body).backgroundColor;
  return toBlob(await render(el, background));
}

/** 화면 밖에 리포트용 자리를 만든다. 리포트는 늘 밝은 화면 색으로 그린다. */
function offscreenHost(): HTMLElement {
  const host = document.createElement('div');
  host.className = 'report-host';
  document.body.append(host);
  return host;
}

function newPage(host: HTMLElement): HTMLElement {
  const page = document.createElement('div');
  page.className = 'report report-page';
  page.style.width = `${PAGE_WIDTH}px`;
  page.style.height = `${PAGE_HEIGHT}px`;
  page.style.padding = `${PAGE_PADDING}px`;
  host.append(page);
  return page;
}

/** 리포트 덩어리들을 A4 쪽으로 나눠 PDF로 */
export async function blocksToPdf(blocks: readonly HTMLElement[]): Promise<Blob> {
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const host = offscreenHost();
  try {
    // 1) 한 쪽 너비에 모두 놓고 덩어리마다 높이를 잰다.
    const measure = newPage(host);
    measure.style.height = 'auto';
    const wrapped = blocks.map((b) => {
      const wrap = document.createElement('div');
      wrap.className = 'report-block';
      wrap.append(b);
      measure.append(wrap);
      return wrap;
    });
    const heights = wrapped.map((w) => w.getBoundingClientRect().height + BLOCK_GAP);
    const pages = paginate(heights, blocks.map(keepsWithNext), blocks.map(startsPage), PAGE_HEIGHT - PAGE_PADDING * 2 - PAGE_FOOTER);
    measure.remove();

    // 2) 쪽마다 덩어리를 옮겨 담아 그림으로 그리고 PDF에 붙인다.
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    for (const [index, numbers] of pages.entries()) {
      const page = newPage(host);
      numbers.forEach((n) => page.append(wrapped[n]));
      const footer = document.createElement('p');
      footer.className = 'report-footer';
      footer.textContent = `${index + 1} / ${pages.length}`;
      page.append(footer);
      const canvas = await render(page, '#ffffff');
      if (index > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', 0, 0, A4_MM.width, A4_MM.height);
      page.remove();
    }
    return pdf.output('blob');
  } finally {
    host.remove();
  }
}
