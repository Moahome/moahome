'use client';

import {
  useRef,
  useState
} from 'react';
import { FileDropzone } from '@/shared/ui/file-dropzone';
import { useRouter } from 'next/navigation';
import {
  formatInteger,
  formatWon
} from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { DataTable } from '@/shared/ui/data-table';
import { Input } from '@/shared/ui/form-controls';
import { ListHeader } from '@/shared/ui/list-header';
import { MonthPicker } from '@/shared/ui/month-picker';
import { SummaryCard } from '@/shared/ui/summary-card';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import {
  getPreviewBilledUnits,
  type PreviewPayment
} from '../../model/paymentPreview';
import {
  previewBankFile,
  paymentError
} from '../../api/paymentApi';
import { usePaymentWorkspace } from '../payment-workspace-provider/paymentWorkspaceProvider';
import { PaymentDetail } from '../_components/payment-detail/paymentDetail';
import { PaymentBadge } from '../_components/payment-badge/paymentBadge';
import { ManualPayment } from '../_components/manual-payment/manualPayment';
import { getPaymentStatusLabel } from '../_components/payment-editor/paymentEditor';
import {
  MonthlyCollection,
  MonthlyExportButton
} from '../_components/monthly-collection/monthlyCollection';
import styles from './paymentWorkspace.module.css';

const PAYMENT_STATUS_TONES = {
  PENDING: 'warning',
  ON_HOLD: 'warning',
  CONFIRMED: 'success',
  CANCELED: 'neutral',
  LINKED: 'success'
} as const;

const PAYMENT_TABS = [
  {
    id: 'PENDING',
    label: '확인 필요'
  },
  {
    id: 'ON_HOLD',
    label: '보류'
  },
  {
    id: 'CONFIRMED',
    label: '처리 완료'
  },
  {
    id: 'CANCELED',
    label: '취소 이력'
  }
] as const;

/** 첨부 시안의 전체 너비 거래 표와 주요 행동을 기존 관리 화면의 공통 UI로 구성합니다. */
export function PaymentWorkspace({ propertyId, view }: {
  propertyId: string;
  view: 'matching' | 'monthly';
}) {
  const router = useRouter();
  const { ledger, update, month, setMonth, busy } = usePaymentWorkspace();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('ALL');
  const [tab, setTab] = useState<PreviewPayment['status']>('PENDING');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [prepared, setPrepared] = useState<PreviewPayment[]>([]);
  const [reading, setReading] = useState(false);
  const readingRef = useRef(false);
  const [filename, setFilename] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [error, setError] = useState('');
  const billedUnits = getPreviewBilledUnits(ledger, month);
  const filtered = ledger.payments.filter((payment) => payment.status !== 'LINKED'
    && payment.date.startsWith(month)
    && `${payment.payer} ${payment.unitId} ${payment.amount} ${payment.memo ?? ''}`.includes(query.trim()));
  const visible = filtered.filter((payment) => payment.status === tab && (source === 'ALL' || source === payment.source));
  const detail = ledger.payments.find((payment) => payment.id === detailId);
  const confirmed = filtered.filter((payment) => payment.status === 'CONFIRMED');
  const total = confirmed.reduce((sum, payment) => sum + BigInt(payment.amount), BigInt(0));
  const unallocated = confirmed.reduce((sum, payment) => sum + BigInt(payment.amount)
    - payment.allocations.reduce((allocated, allocation) => allocated + BigInt(allocation.amount), BigInt(0)), BigInt(0));

  /** PC는 목록을 유지한 중앙 모달, 모바일은 기존 관리 화면과 같은 독립 상세 주소를 사용합니다. */
  function openPayment(id: string) {
    if (window.matchMedia('(max-width: 767px)').matches) {
      router.push(`/manage/${propertyId}/payments/matching/${encodeURIComponent(id)}`);
      return;
    }
    setDetailId(id);
  }

  function processed(id: string, status: PreviewPayment['status']) {
    setDetailId(id);
    setTab(status);
    setSource('ALL');
  }

  /** 파일은 브라우저에서 검증·미리보기만 하며 확인 전에는 거래나 수납 원장을 변경하지 않습니다. */
  async function readFile(file?: File) {
    if (!file || readingRef.current) return;
    readingRef.current = true;
    setPrepared([]);
    setFilename(file.name);
    setSelectedFile(file);
    setReading(true);
    try {
      const result = await previewBankFile(propertyId, file);
      setPrepared(result.rows);
      setDuplicateCount(result.duplicateCount);
    } catch (failure) {
      setError(paymentError(failure));
    } finally {
      readingRef.current = false;
      setReading(false);
    }
  }

  async function commitImport() {
    if (!selectedFile || !prepared.length) return;
    const failure = await update({
      type: 'import',
      file: selectedFile
    }, '거래를 가져왔어요. 세대와 청구월을 확인해주세요.');
    if (failure) { setError(failure); return; }
    setMonth(prepared[0].date.slice(0, 7));
    setTab('PENDING'); setSource('ALL'); setQuery(''); setImportOpen(false); setPrepared([]); setSelectedFile(null);
  }

  return (
    <section
      className={styles.page}
      aria-labelledby={'payment-title'}
    >
      <ListHeader
        className={styles.header}
        actionsClassName={styles['header-actions']}
        menu={'입금 관리'}
        title={view === 'matching' ? '입금 확인·매칭' : '월별 수납 현황'}
        titleId={'payment-title'}
        description={view === 'matching' ? '은행 거래를 세대와 청구월에 연결하고 수납을 확정합니다.' : '전월 이월액, 당월 부과액, 당월 수납액, 미수금 잔액을 월별로 확인합니다.'}
        actions={view === 'matching' ? (
          <>
            <Button
              onClick={() => setManualOpen(true)}
            >
              ＋ 수동 입금 등록
            </Button>
            <Button
              variant={'outline'}
              onClick={() => { setPrepared([]); setFilename(''); setImportOpen(true); }}
            >
              통장 내역 가져오기
            </Button>
          </>
        ) : (
          <MonthlyExportButton
            month={month}
          />
        )}
      />
      <p
        className={styles.notice}
      >
        현재 대표 주민과 실제 부과된 관리비를 기준으로 수납을 확인합니다.
      </p>
      {view === 'monthly' ? (
        <MonthlyCollection
          propertyId={propertyId}
          month={month}
          onMonthChange={setMonth}
        />
      ) : (
        <div
          className={styles.workspace}
        >
          <div
            className={styles['list-area']}
          >
            <div
              className={styles.kpis}
            >
              <SummaryCard
                density={'compact'}
                label={'확인 필요'}
                value={filtered.filter((payment) => payment.status === 'PENDING').length}
                unit={'건'}
                tone={'warning'}
                icon={(
                  <ServiceIcon
                    name={'info'}
                  />
                )}
              />
              <SummaryCard
                density={'compact'}
                label={'보류'}
                value={filtered.filter((payment) => payment.status === 'ON_HOLD').length}
                unit={'건'}
                tone={'warning'}
                icon={(
                  <ServiceIcon
                    name={'clock'}
                  />
                )}
              />
              <SummaryCard
                density={'compact'}
                label={'기간 내 수납 확정액'}
                value={formatInteger(total)}
                unit={'원'}
                tone={'success'}
                icon={(
                  <ServiceIcon
                    name={'coins'}
                  />
                )}
              />
              <SummaryCard
                density={'compact'}
                label={'선입금 잔액'}
                value={formatInteger(unallocated)}
                unit={'원'}
                tone={'danger'}
                icon={(
                  <ServiceIcon
                    name={'receipt'}
                  />
                )}
              />
            </div>
            <section
              className={styles.list}
              aria-label={'입금 목록'}
            >
              <div
                className={styles.tabs}
                role={'group'}
                aria-label={'입금 처리 상태'}
              >
                {PAYMENT_TABS.map((item) => (
                  <Button
                    key={item.id}
                    variant={'ghost'}
                    aria-pressed={tab === item.id}
                    onClick={() => setTab(item.id)}
                  >
                    {item.label}
                    {' '}
                    (
                    {filtered.filter((payment) => payment.status === item.id).length}
                    )
                  </Button>
                ))}
              </div>
              <div
                className={styles.filters}
              >
                <MonthPicker
                  label={'조회 월'}
                  value={month}
                  onChange={setMonth}
                />
                <Input
                  aria-label={'입금 검색'}
                  placeholder={'입금자명, 세대, 금액, 적요로 검색하세요'}
                  leadingIcon={(
                    <ServiceIcon
                      name={'search'}
                    />
                  )}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div
                  className={styles.sources}
                  role={'group'}
                  aria-label={'입금 출처'}
                >
                  {[['ALL', '전체'], ['BANK_IMPORT', '엑셀'], ['MANUAL', '수동']].map(([id, label]) => (
                    <Button
                      key={id}
                      variant={'outline'}
                      size={'sm'}
                      aria-pressed={source === id}
                      onClick={() => setSource(id)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              <DataTable
                label={'입금 거래'}
                rows={visible}
                getRowKey={(payment) => payment.id}
                onRowClick={(payment) => openPayment(payment.id)}
                minWidth={650}
                emptyState={'조건에 맞는 입금 거래가 없습니다.'}
                columns={[
                  {
                    key: 'date',
                    header: '입금일',
                    render: (payment) => payment.date.slice(5).replace('-', '.')
                  },
                  {
                    key: 'payer',
                    header: '입금자명 / 출처',
                    rowHeader: true,
                    render: (payment) => (
                      <div
                        className={styles.payer}
                      >
                        <strong>
                          {payment.payer}
                        </strong>
                        <span>
                          {payment.source === 'MANUAL' ? '수동' : '엑셀'}
                        </span>
                      </div>
                    )
                  },
                  {
                    key: 'amount',
                    header: '입금액',
                    align: 'right',
                    render: (payment) => formatWon(payment.amount)
                  },
                  {
                    key: 'unit',
                    header: '세대 후보',
                    render: (payment) => {
                      const units = payment.status === 'PENDING' || payment.status === 'ON_HOLD' ? billedUnits : ledger.units;
                      const unit = units.find((item) => item.id === payment.unitId);

                      return (
                        <PaymentBadge
                          tone={unit ? 'teal' : 'danger'}
                        >
                          {unit?.label ?? '후보 없음'}
                        </PaymentBadge>
                      );
                    }
                  },
                  {
                    key: 'status',
                    header: '상태',
                    render: (payment) => (
                      <PaymentBadge
                        tone={PAYMENT_STATUS_TONES[payment.status]}
                      >
                        {getPaymentStatusLabel(payment)}
                      </PaymentBadge>
                    )
                  }
                ]}
              />
              <p
                className={styles.footer}
              >
                전체
                {' '}
                {visible.length}
                건 · 거래를 선택하면 상세에서 처리할 수 있습니다.
              </p>
            </section>
          </div>
        </div>
      )}
      {detail && (
        <PaymentDetail
          key={detail.id}
          paymentId={detail.id}
          onClose={() => setDetailId(null)}
          onProcessed={processed}
        />
      )}
      {manualOpen && (
        <ManualPayment
          onClose={() => setManualOpen(false)}
          onCreated={(id, date) => {
            setManualOpen(false);
            setTab('PENDING');
            setMonth(date.slice(0, 7));
            setSource('ALL');
            setQuery('');
            openPayment(id);
          }}
        />
      )}
      {importOpen && (
        <ClientModal
          className={styles['import-modal']}
          onClose={() => { if (!reading && !busy) setImportOpen(false); }}
          busy={reading || busy}
          aria-labelledby={'payment-import-title'}
        >
          <div
            className={styles['modal-header']}
          >
            <h2
              id={'payment-import-title'}
            >
              통장 내역 가져오기
            </h2>
            <Button
              variant={'ghost'}
              iconOnly
              aria-label={'통장 내역 가져오기 닫기'}
              disabled={reading || busy}
              onClick={() => setImportOpen(false)}
              leadingIcon={(
                <ServiceIcon
                  name={'close'}
                />
              )}
            />
          </div>
          <p>
            은행 거래내역을 검증한 뒤 가져옵니다. 가져온 거래는 청구월별 금액을 확인한 후 수납으로 확정합니다.
          </p>
          <p>
            관리계좌:
            {ledger.accounts[0]?.label}
          </p>
          <FileDropzone
            label={'통장 거래내역 업로드 영역'}
            inputLabel={'거래내역 파일'}
            accept={'.xlsx,.csv'}
            description={'.xlsx · .csv · 최대 5MB · 5,000행'}
            busy={reading || busy}
            onFile={(file) => { void readFile(file); }}
          />
          {filename && (
            <p
              className={styles.filename}
            >
              {filename}
            </p>
          )}
          <p>
            첫 행에 입금일·입금액·입금자명이 있는 은행 거래내역을 올려주세요.
          </p>
          {prepared.length > 0 && (
            <DataTable
              label={'은행 거래 미리보기'}
              rows={prepared.slice(0, 20)}
              getRowKey={(payment) => `${payment.id}-${prepared.indexOf(payment)}`}
              minWidth={360}
              emptyState={''}
              columns={[
                {
                  key: 'date',
                  header: '입금일',
                  render: (payment) => payment.date
                },
                {
                  key: 'payer',
                  header: '입금자명',
                  render: (payment) => payment.payer
                },
                {
                  key: 'amount',
                  header: '금액',
                  align: 'right',
                  render: (payment) => formatWon(payment.amount)
                }
              ]}
            />
          )}
          <p>
            {reading ? '파일을 확인하고 있습니다.' : `가져오기 후보 ${prepared.length}건 · ${duplicateCount}건 중복 제외 · 거래번호 또는 날짜·입금자·금액을 기준으로 검사합니다.`}
          </p>
          <div
            className={styles.actions}
          >
            <Button
              variant={'outline'}
              disabled={reading || busy}
              onClick={() => setImportOpen(false)}
            >
              취소
            </Button>
            <Button
              loading={busy}
              disabled={reading || !prepared.length}
              onClick={commitImport}
            >
              입금 거래 가져오기
            </Button>
          </div>
        </ClientModal>
      )}
      {error && (
        <Toast
          message={error}
          tone={'error'}
          onClose={() => setError('')}
        />
      )}
    </section>
  );
}
