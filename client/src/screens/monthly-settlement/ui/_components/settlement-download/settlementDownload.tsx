import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBankingBalances } from '@/widgets/banking-workspace';
import { formatInteger } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { DataTable } from '@/shared/ui/data-table';
import {
  Dropdown,
  Radio
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import type { MonthlySettlementSnapshot } from '../../../api/monthlySettlementApiTypes';
import {
  createSettlementWorkbook,
  getSettlementBuildingOptions,
  getSettlementAccountOptions,
  getSettlementDocument,
  getSettlementPeriodLabel
} from '../../../model/settlementExport';
import { ImagePreview } from './imagePreview';
import { PdfPreview } from './pdfPreview';
import styles from './settlementDownload.module.css';

/** 조회 스냅샷과 필요한 기존 계좌별 잔고를 확인해 같은 자료로 미리보기·파일을 만들며 화면 검색·페이지 변경을 섞지 않습니다. */
export function SettlementDownload({ data, onClose }: { data: MonthlySettlementSnapshot; onClose: () => void }) {
  const [buildingId, setBuildingId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [format, setFormat] = useState<'excel' | 'pdf' | 'image'>('excel');
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [pdfError, setPdfError] = useState('');
  const [images, setImages] = useState<Blob[] | null>(null);
  const [imageError, setImageError] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const downloadBusy = useRef(false);
  const [error, setError] = useState('');
  // 기존 응답에 계좌별 동 잔액이 없으면 해당 계좌의 기존 잔고 API로 확인합니다. 누락 필드를 미설정 잔고로 단정하지 않습니다.
  const needsAccountBalance = Boolean(accountId) && data.balances.buildings.every((building) => building.accountBalances === undefined);
  const accountBalances = useQuery({
    queryKey: ['settlement-download-account-balances', data.propertyId, data.month, data.generatedAt, accountId],
    queryFn: () => getBankingBalances(data.propertyId, data.month, accountId),
    enabled: needsAccountBalance,
    staleTime: Infinity,
    gcTime: 0,
    retry: false
  });
  const effectiveData = useMemo(() => needsAccountBalance && accountBalances.data
    ? {
      ...data,
      balances: accountBalances.data
    }
    : data, [data, needsAccountBalance, accountBalances.data]);
  const balancePending = needsAccountBalance && accountBalances.isPending;
  const balanceFailed = needsAccountBalance && (accountBalances.isError || (accountBalances.data !== undefined && accountBalances.data.accountId !== accountId));
  const buildings = getSettlementBuildingOptions(data);
  const buildingLabel = buildings.find((building) => building.id === buildingId)?.label ?? '전체 동';
  const accounts = getSettlementAccountOptions(data);
  const accountLabel = accounts.find((account) => account.id === accountId)?.label ?? '전체 계좌';
  const sheet = getSettlementDocument(effectiveData, buildingId, accountId);
  const rows = [...sheet.rows, ...(sheet.total ? [sheet.total] : [])].map((values, index) => ({
    id: String(index),
    values
  }));

  // PDF·이미지는 같은 PDF 문서를 사용하므로 계좌·동·잔액·날짜와 페이지 배치가 일치합니다.
  useEffect(() => {
    if (format === 'excel' || pdf || balancePending || balanceFailed) return;
    let active = true;
    void import('../../../model/settlementPdf').then(({ createSettlementPdf }) => createSettlementPdf(effectiveData, buildingId, accountId))
      .then((blob) => { if (active) setPdf(blob); })
      .catch(() => { if (active) setPdfError('PDF 파일을 만들지 못했어요. 다시 시도해주세요.'); });
    return () => { active = false; };
  }, [effectiveData, format, pdf, retry, buildingId, accountId, balancePending, balanceFailed]);

  // 실제 PNG Blob을 미리보기와 파일에 함께 사용하며 계좌·동 변경과 창 닫기에는 이전 변환을 취소합니다.
  useEffect(() => {
    if (format !== 'image' || !pdf || images || balancePending || balanceFailed) return;
    const controller = new AbortController();
    void import('../../../model/settlementImages').then(({ createSettlementImages }) => createSettlementImages(pdf, controller.signal))
      .then((result) => { if (!controller.signal.aborted) setImages(result); })
      .catch(() => { if (!controller.signal.aborted) setImageError('이미지를 만들지 못했어요. 다시 시도해주세요.'); });
    return () => controller.abort();
  }, [format, pdf, images, retry, balancePending, balanceFailed]);

  /** 미리본 전체 월 자료를 파일로 저장하고 중복 클릭·실패·Object URL 해제를 처리합니다. */
  async function download() {
    if (downloadBusy.current || balancePending || balanceFailed || (format !== 'excel' && !pdf) || (format === 'image' && !images)) return;
    downloadBusy.current = true;
    setBusy(true);
    setError('');
    try {
      const scopes = [buildingId ? buildingLabel : '', accountId ? accountLabel : ''].filter(Boolean);
      const suffix = scopes.length ? `_${scopes.map((label) => label.replace(/[\\/:*?"<>|]/g, '_')).join('_')}` : '';
      const filename = `모아홈_월별정산_${data.month}${suffix}`;
      let blob: Blob;
      let extension: string;
      if (format === 'image') {
        const { createSettlementImageDownload } = await import('../../../model/settlementImages');
        ({ blob, extension } = await createSettlementImageDownload(images!, filename));
      } else {
        blob = format === 'pdf' ? pdf! : await createSettlementWorkbook(effectiveData, buildingId, accountId);
        extension = format === 'pdf' ? 'pdf' : 'xlsx';
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${filename}.${extension}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('파일을 내려받지 못했어요. 다시 시도해주세요.');
    } finally {
      downloadBusy.current = false;
      setBusy(false);
    }
  }

  return (
    <ClientModal
      className={styles.modal}
      onClose={onClose}
      busy={busy}
      aria-labelledby={'settlement-download-title'}
      aria-describedby={'settlement-download-description'}
    >
      <header
        className={styles.header}
      >
        <div>
          <h2
            id={'settlement-download-title'}
          >
            {data.month.replace('-', '년 ')}
            월 동별 입출금 내역
          </h2>
          <p
            id={'settlement-download-description'}
          >
            선택한 월의 동별 입금·지출과 잔액을 확인하고 내려받으세요.
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
        <Radio
          name={'settlement-format'}
          label={'Excel'}
          aria-label={'Excel'}
          description={'동별 입출금 · 한 시트'}
          value={'excel'}
          checked={format === 'excel'}
          onChange={() => { setFormat('excel'); setError(''); }}
          variant={'card'}
        />
        <Radio
          name={'settlement-format'}
          label={'PDF'}
          aria-label={'PDF'}
          description={'A4 세로 · 동별 입출금'}
          value={'pdf'}
          checked={format === 'pdf'}
          onChange={() => { setFormat('pdf'); setError(''); setPdfError(''); }}
          variant={'card'}
        />
        <Radio
          name={'settlement-format'}
          label={'이미지 (PNG)'}
          aria-label={'이미지 (PNG)'}
          description={'보고서 이미지'}
          value={'image'}
          checked={format === 'image'}
          onChange={() => { setFormat('image'); setError(''); setPdfError(''); setImageError(''); }}
          variant={'card'}
        />
      </fieldset>
      <div
        className={styles.filters}
      >
        <Dropdown
          label={'조회 동'}
          value={buildingId}
          disabled={busy}
          options={[{
            value: '',
            label: '전체 동'
          }, ...buildings.map((building) => ({
            value: building.id,
            label: building.label
          }))]}
          onChange={(value) => {
            setBuildingId(value);
            // 이전 동의 PDF를 즉시 치우고 해당 동의 생성 결과만 미리보기·다운로드에 허용합니다.
            setPdf(null);
            setImages(null);
            setImageError('');
            setPdfError('');
            setError('');
          }}
        />
        <Dropdown
          label={'조회 계좌'}
          value={accountId}
          disabled={busy}
          options={[{
            value: '',
            label: '전체 계좌'
          }, ...accounts.map((account) => ({
            value: account.id,
            label: account.label
          }))]}
          onChange={(value) => {
            setAccountId(value);
            // 계좌를 바꾸는 순간 이전 PDF를 제거하고 새 계좌 내역 생성이 끝난 뒤 다운로드를 허용합니다.
            setPdf(null);
            setImages(null);
            setImageError('');
            setPdfError('');
            setError('');
          }}
        />
      </div>
      <div
        className={styles.body}
      >
        {balancePending ? (
          <p
            role={'status'}
          >
            선택한 계좌의 동별 잔액을 확인하고 있어요.
          </p>
        ) : balanceFailed ? (
          <div
            className={styles.error}
          >
            <p
              role={'alert'}
            >
              선택한 계좌의 잔액을 불러오지 못했어요.
            </p>
            <Button
              variant={'outline'}
              onClick={() => void accountBalances.refetch()}
            >
              다시 시도
            </Button>
          </div>
        ) : format === 'excel' ? (
          <section
            className={styles['excel-preview']}
            aria-label={'Excel 미리보기'}
          >
            <h3>
              {sheet.title}
            </h3>
            <p>
              {sheet.description}
            </p>
            <p
              className={styles.metadata}
            >
              {sheet.summary.map((item) => `${item.label} ${item.value}`).join(' · ')}
            </p>
            <div
              className={styles['balance-summary']}
            >
              {['기초 잔액', '입금 합계', '지출 합계', '월말 잔액'].map((label, index) => {
                const value = index === 1 ? sheet.total?.[5] : index === 2 ? sheet.total?.[6] : sheet.summary.find((item) => item.label === label)?.value;
                return (
                  <div
                    key={label}
                  >
                    <span>
                      {label}
                    </span>
                    <strong>
                      {typeof value === 'bigint' ? `${formatInteger(value)}원` : value}
                    </strong>
                  </div>
                );
              })}
            </div>
            <DataTable
              label={`${sheet.sheet} 다운로드 미리보기`}
              rows={rows}
              getRowKey={(row) => row.id}
              emptyState={'조회할 내역이 없습니다.'}
              minWidth={Math.max(650, sheet.columns.length * 140)}
              columns={sheet.columns.map((column, index) => ({
                key: String(index),
                header: column.label,
                align: column.align,
                render: (row: typeof rows[number]) => typeof row.values[index] === 'bigint' ? `${formatInteger(row.values[index])}${column.label === '건수' ? '건' : '원'}` : row.values[index] ?? ''
              }))}
            />
          </section>
        ) : format === 'image' ? (
          <section
            aria-label={'이미지 미리보기'}
          >
            {images && (
              <ImagePreview
                key={`${buildingId}:${accountId}`}
                images={images}
              />
            )}
            {!images && !(imageError || pdfError) && (
              <p
                role={'status'}
              >
                보고서 이미지를 만들고 있어요.
              </p>
            )}
            {!images && (imageError || pdfError) && (
              <div
                className={styles.error}
              >
                <p
                  role={'alert'}
                >
                  {imageError || '이미지를 만들지 못했어요. 다시 시도해주세요.'}
                </p>
                <Button
                  variant={'outline'}
                  onClick={() => { setImageError(''); setPdfError(''); setRetry(retry + 1); }}
                >
                  다시 시도
                </Button>
              </div>
            )}
          </section>
        ) : (
          <section
            aria-label={'PDF 미리보기'}
          >
            {pdf && (
              <PdfPreview
                blob={pdf}
              />
            )}
            {!pdf && !pdfError && (
              <p
                role={'status'}
              >
                PDF를 만들고 있어요.
              </p>
            )}
            {pdfError && !pdf && (
              <div
                className={styles.error}
              >
                <p
                  role={'alert'}
                >
                  {pdfError}
                </p>
                <Button
                  variant={'outline'}
                  onClick={() => { setPdfError(''); setRetry(retry + 1); }}
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
          {`${buildingLabel} · ${accountLabel}`}
          {' '}
          {`· ${getSettlementPeriodLabel(data)}`}
        </p>
        {error && (
          <p
            role={'alert'}
          >
            {error}
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
            disabled={balancePending || balanceFailed || (format !== 'excel' && !pdf) || (format === 'image' && !images)}
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
