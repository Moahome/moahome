import { LoadingState } from '@/shared/ui/state-message';
import {
  useEffect,
  useRef,
  useState
} from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './pdfPreview.module.css';

/** 다운로드할 PDF 자체를 읽어 모바일에서도 브라우저 내장 뷰어에 의존하지 않고 출력 페이지를 보여줍니다. */
export function PdfPreview({ blob }: { blob: Blob }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => {
    let active = true;
    let task: ReturnType<typeof import('pdfjs-dist')['getDocument']> | undefined;
    async function open() {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const bytes = await blob.arrayBuffer();
        if (!active) return;
        task = pdfjs.getDocument({
          data: bytes
        });
        const result = await task.promise;
        if (active) setDocument(result);
      } catch {
        if (active) setError(true);
      }
    }
    void open();
    return () => { active = false; void task?.destroy(); };
  }, [blob]);
  if (error) return (
    <p
      role={'alert'}
    >
      PDF 미리보기를 표시하지 못했어요. 창을 닫고 다시 시도해주세요.
    </p>
  );
  if (!document) return (
    <LoadingState
      title={'PDF 미리보기를 불러오고 있어요.'}
    />
  );

  return (
    <div
      className={styles.preview}
    >

      <PdfPage
        key={page}
        document={document}
        page={page}
      />
      <div
        className={styles.toolbar}
      >
        <span>
          A4 세로 ·
          {page}
          {' '}
          /
          {document.numPages}
          페이지
        </span>
        <div>
          <Button
            variant={'outline'}
            size={'sm'}
            iconOnly
            aria-label={'PDF 이전 페이지'}
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            <ServiceIcon
              name={'chevron'}
              direction={'left'}
            />
          </Button>
          <Button
            variant={'outline'}
            size={'sm'}
            iconOnly
            aria-label={'PDF 다음 페이지'}
            disabled={page === document.numPages}
            onClick={() => setPage(page + 1)}
          >
            <ServiceIcon
              name={'chevron'}
            />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 페이지 전환·닫기 시 진행 중인 캔버스 작업을 취소해 이전 페이지가 새 화면을 덮어쓰지 않게 합니다. */
function PdfPage({ document, page }: { document: PDFDocumentProxy; page: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    void document.getPage(page).then(async (pdfPage) => {
      if (!active || !canvas.current) return;
      const viewport = pdfPage.getViewport({
        scale: 1.5
      });
      canvas.current.width = Math.ceil(viewport.width);
      canvas.current.height = Math.ceil(viewport.height);
      task = pdfPage.render({
        canvas: canvas.current,
        viewport
      });
      await task.promise;
      if (active) setReady(true);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; task?.cancel(); };
  }, [document, page]);

  return (
    <div
      className={styles.page}
    >
      {!ready && !failed && (
        <p
          role={'status'}
        >
          페이지를 그리고 있어요.
        </p>
      )}
      {failed && (
        <p
          role={'alert'}
        >
          페이지를 표시하지 못했어요. 다른 페이지를 선택한 뒤 다시 시도해주세요.
        </p>
      )}
      <canvas
        ref={canvas}
        role={'img'}
        aria-label={`PDF ${page}페이지 미리보기`}
        hidden={!ready}
      />
    </div>
  );
}
