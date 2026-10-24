import { LoadingState } from '@/shared/ui/state-message';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import type { ReportDefinition } from '@/shared/lib/excel-report';
import { formatInteger } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { DataTable } from '@/shared/ui/data-table';
import { Radio } from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { PdfPreview } from './_components/pdf-preview/pdfPreview';
import { ImagePreview } from './_components/image-preview/imagePreview';
import styles from './reportDownload.module.css';

/** 보고서 내용은 호출자가 정하고 파일 형식·실제 PDF/PNG 미리보기·저장·오류 처리는 두 화면이 함께 사용합니다. */
export function ReportDownload({ title, description, filename, sourceKey, documents, highlights = [], scopeLabel, createWorkbook, createPdf, renderFilters, pending = false, error = '', onRetry, onClose }: {
  title: string; description: string; filename: string; sourceKey: string;
  documents: readonly ReportDefinition[];
  highlights?: readonly { label: string; value: string | bigint }[];
  scopeLabel: string;
  createWorkbook: () => Promise<Blob>; createPdf: () => Promise<Blob>;
  renderFilters?: (busy: boolean) => ReactNode;
  pending?: boolean; error?: string; onRetry?: () => void; onClose: () => void;
}) {
  const [format, setFormat] = useState<'excel' | 'pdf' | 'image'>('excel');
  const [pdfState, setPdfState] = useState<{ key: string; blob: Blob } | null>(null);
  const [imageState, setImageState] = useState<{ key: string; images: Blob[] } | null>(null);
  const [failure, setFailure] = useState<{ key: string; value: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const downloadBusy = useRef(false);
  const pdf = pdfState?.key === sourceKey ? pdfState.blob : null;
  const images = imageState?.key === sourceKey ? imageState.images : null;
  const message = failure?.key === sourceKey ? failure.value : '';
  const unavailable = pending || Boolean(error) || (format !== 'excel' && !pdf) || (format === 'image' && !images);

  // 범위가 바뀌면 키로 이전 Blob을 즉시 제외하고 늦게 완성된 이전 자료도 저장하지 않습니다.
  useEffect(() => {
    if (format === 'excel' || pdf || pending || error) return;
    let active = true;
    void createPdf().then((blob) => { if (active) setPdfState({
      key: sourceKey,
      blob
    }); })
      .catch(() => { if (active) setFailure({
        key: sourceKey,
        value: 'PDF 파일을 만들지 못했어요. 다시 시도해주세요.'
      }); });
    return () => { active = false; };
  }, [format, pdf, pending, error, createPdf, sourceKey, retry]);

  // 실제 PNG를 미리보기와 저장에 함께 사용하고 화면·범위 변경 시 변환을 취소합니다.
  useEffect(() => {
    if (format !== 'image' || !pdf || images || pending || error) return;
    const controller = new AbortController();
    void import('@/shared/lib/report-images').then(({ createReportImages }) => createReportImages(pdf, controller.signal))
      .then((result) => { if (!controller.signal.aborted) setImageState({
        key: sourceKey,
        images: result
      }); })
      .catch(() => { if (!controller.signal.aborted) setFailure({
        key: sourceKey,
        value: '이미지를 만들지 못했어요. 다시 시도해주세요.'
      }); });
    return () => controller.abort();
  }, [format, pdf, images, pending, error, sourceKey, retry]);

  /** 미리본 자료만 저장하고 중복 클릭과 Object URL 누수를 막습니다. */
  async function download() {
    if (downloadBusy.current || unavailable) return;
    downloadBusy.current = true; setBusy(true); setFailure(null);
    try {
      let blob: Blob; let extension: string;
      if (format === 'image') {
        const { createReportImageDownload } = await import('@/shared/lib/report-images');
        ({ blob, extension } = await createReportImageDownload(images!, filename));
      } else {
        blob = format === 'pdf' ? pdf! : await createWorkbook();
        extension = format === 'pdf' ? 'pdf' : 'xlsx';
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${filename}.${extension}`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setFailure({
      key: sourceKey,
      value: '파일을 내려받지 못했어요. 다시 시도해주세요.'
    }); }
    finally { downloadBusy.current = false; setBusy(false); }
  }

  return (
    <ClientModal
      className={styles.modal}
      onClose={onClose}
      busy={busy}
      aria-labelledby={'report-download-title'}
      aria-describedby={'report-download-description'}
    >
      <header
        className={styles.header}
      >
        <div>
          <h2
            id={'report-download-title'}
          >
            {title}
          </h2>
          <p
            id={'report-download-description'}
          >
            {description}
          </p>
        </div>
        <Button
          variant={'ghost'}
          size={'sm'}
          iconOnly
          aria-label={'다운로드 미리보기 닫기'}
          disabled={busy}
          onClick={onClose}
        >
          <ServiceIcon
            name={'close'}
          />
        </Button>
      </header>
      <fieldset
        className={styles.formats}
        disabled={busy}
      >
        <legend>
          파일 형식
        </legend>
        {([{
          value: 'excel',
          label: 'Excel',
          description: '보고서 · 한 시트'
        }, {
          value: 'pdf',
          label: 'PDF',
          description: 'A4 세로 보고서'
        }, {
          value: 'image',
          label: '이미지 (PNG)',
          description: '보고서 이미지'
        }] as const).map((item) => (
          <Radio
            key={item.value}
            name={'report-format'}
            label={item.label}
            aria-label={item.label}
            description={item.description}
            value={item.value}
            checked={format === item.value}
            onChange={() => { setFormat(item.value); setFailure(null); }}
            variant={'card'}
          />
        ))}
      </fieldset>
      {renderFilters && (
        <div
          className={styles.filters}
        >
          {renderFilters(busy)}
        </div>
      )}
      <div
        className={styles.body}
      >
        {pending ? (
          <LoadingState
            title={'보고서 자료를 확인하고 있어요.'}
          />
        ) : error ? (
          <div
            className={styles.error}
          >
            <p
              role={'alert'}
            >
              {error}
            </p>
            <Button
              variant={'outline'}
              onClick={onRetry}
            >
              다시 시도
            </Button>
          </div>
        ) : format === 'excel' ? (
          <section
            className={styles['excel-preview']}
            aria-label={'Excel 미리보기'}
          >
            {documents.map((sheet, sheetIndex) => {
              const rows = [...sheet.rows, ...(sheet.total ? [sheet.total] : [])].map((values, index) => ({
                id: String(index),
                values
              }));
              return (
                <section
                  key={sheet.title}
                >
                  <h3>
                    {sheet.title}
                  </h3>
                  <p>
                    {sheet.description}
                  </p>
                  {sheet.summary.length > 0 && (
                    <p
                      className={styles.metadata}
                    >
                      {sheet.summary.map((item) => `${item.label} ${typeof item.value === 'bigint' ? `${formatInteger(item.value)}원` : item.value}`).join(' · ')}
                    </p>
                  )}
                  {sheetIndex === 0 && highlights.length > 0 && (
                    <div
                      className={styles['balance-summary']}
                    >
                      {highlights.map((item) => (
                        <div
                          key={item.label}
                        >
                          <span>
                            {item.label}
                          </span>
                          <strong>
                            {typeof item.value === 'bigint' ? `${formatInteger(item.value)}원` : item.value}
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                  <DataTable
                    label={`${sheet.sheet} 다운로드 미리보기`}
                    rows={rows}
                    getRowKey={(row) => row.id}
                    emptyState={'해당 월 자료가 없습니다.'}
                    minWidth={Math.max(650, sheet.columns.length * 130)}
                    columns={sheet.columns.map((column, index) => ({
                      key: String(index),
                      header: column.label,
                      align: column.align,
                      render: (row: typeof rows[number]) => typeof row.values[index] === 'bigint' ? `${formatInteger(row.values[index])}원` : row.values[index] ?? ''
                    }))}
                  />
                </section>
              );
            })}
          </section>
        ) : (
          <section
            aria-label={format === 'image' ? '이미지 미리보기' : 'PDF 미리보기'}
          >
            {format === 'pdf' && pdf && (
              <PdfPreview
                key={sourceKey}
                blob={pdf}
              />
            )}
            {format === 'image' && images && (
              <ImagePreview
                key={sourceKey}
                images={images}
              />
            )}
            {unavailable && !message && (
              <p
                role={'status'}
              >
                {format === 'image' ? '보고서 이미지를 만들고 있어요.' : 'PDF를 만들고 있어요.'}
              </p>
            )}
            {message && unavailable && (
              <div
                className={styles.error}
              >
                <p
                  role={'alert'}
                >
                  {message}
                </p>
                <Button
                  variant={'outline'}
                  onClick={() => { setFailure(null); setRetry(retry + 1); }}
                >
                  다시 시도
                </Button>
              </div>
            )}
          </section>
        )}
      </div>
      <footer
        className={styles.footer}
      >
        <p>
          {scopeLabel}
        </p>
        {message && !unavailable && (
          <p
            role={'alert'}
          >
            {message}
          </p>
        )}
        <div>
          <Button
            variant={'outline'}
            tone={'neutral'}
            disabled={busy}
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            variant={'outline'}
            tone={format === 'excel' ? 'excel' : undefined}
            leadingIcon={(
              <ServiceIcon
                name={format === 'excel' ? 'excel' : 'document'}
              />
            )}
            disabled={unavailable}
            loading={busy}
            onClick={() => void download()}
          >
            {format === 'image' ? '이미지 다운로드' : format === 'excel' ? 'Excel 다운로드' : 'PDF 다운로드'}
          </Button>
        </div>
      </footer>
    </ClientModal>
  );
}
