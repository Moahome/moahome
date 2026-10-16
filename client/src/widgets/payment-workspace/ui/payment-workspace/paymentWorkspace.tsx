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
import { FilterTabs } from '@/shared/ui/filter-tabs';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { ListHeader } from '@/shared/ui/list-header';
import { MonthPicker } from '@/shared/ui/month-picker';
import { Pagination } from '@/shared/ui/pagination';
import { SummaryCard } from '@/shared/ui/summary-card';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import {
  getPreviewSelectableUnits,
  getPreviewBuildingName,
  getPreviewBuildingOptions,
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
  const [building, setBuilding] = useState('');
  const [tab, setTab] = useState<PreviewPayment['status']>('PENDING');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
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
  const [errorVersion, setErrorVersion] = useState(0);
  const [selection, setSelection] = useState<{ scope: string; ids: string[] } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const selectableUnits = getPreviewSelectableUnits(ledger);
  const unitById = new Map(ledger.units.map((unit) => [unit.id, unit]));
  const filtered = ledger.payments.filter((payment) => {
    const unit = unitById.get(payment.unitId);

    return payment.status !== 'LINKED' && payment.date.startsWith(month)
      && (!building || (unit && getPreviewBuildingName(unit) === building))
      && `${payment.payer} ${unit?.label ?? ''} ${unit?.representativeName ?? ''} ${payment.amount} ${payment.memo ?? ''}`.includes(query.trim());
  });
  // 후보가 없는 거래는 끝에 두고 실제 동·호수를 숫자 순서로 정렬합니다.
  const matches = filtered.filter((payment) => payment.status === tab).sort((left, right) => {
    const leftUnit = unitById.get(left.unitId);
    const rightUnit = unitById.get(right.unitId);
    if (!leftUnit || !rightUnit) return Number(Boolean(rightUnit)) - Number(Boolean(leftUnit)) || right.date.localeCompare(left.date);

    return leftUnit.label.localeCompare(rightUnit.label, 'ko', {
      numeric: true
    }) || right.date.localeCompare(left.date);
  });
  // 수납 처리로 목록이 줄어들어도 현재 페이지를 유효 범위로 제한합니다.
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = matches.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectionScope = JSON.stringify([propertyId, month, tab, query, building, pageSize, currentPage]);
  const isSelecting = selection?.scope === selectionScope;
  const selectedIds = isSelecting ? selection.ids : [];
  const deletable = visible.filter((payment) => payment.status === 'PENDING' || payment.status === 'ON_HOLD');
  const selected = deletable.filter((payment) => selectedIds.includes(payment.id));

  /** 조회 조건·페이지를 벗어난 선택은 사용하지 않고 미확정 입금만 선택 삭제 대상으로 삼습니다. */
  function toggleSelection(payment: PreviewPayment) {
    if (payment.status !== 'PENDING' && payment.status !== 'ON_HOLD') return;
    setSelection({
      scope: selectionScope,
      ids: selectedIds.includes(payment.id) ? selectedIds.filter((id) => id !== payment.id) : [...selectedIds, payment.id]
    });
  }

  function showError(message: string) {
    setError(message);setErrorVersion((version) => version + 1);
  }

  /** 서버에서 선택 전체를 검증·삭제한 결과만 반영하고 실패하면 체크와 확인창을 유지합니다. */
  async function deleteSelected() {
    if (!selected.length) return;
    const failure = await update({
      type: 'delete-many',
      data: {
        paymentIds: selected.map((payment) => payment.id)
      }
    }, '선택한 입금을 삭제했어요.');
    if (failure) { showError(failure); return; }
    setDeleteOpen(false);setSelection(null);setPage(1);
  }

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
    setPage(1);
  }

  /** 은행 파일 원본을 서버에서 검증·미리보기하며 가져오기 전에는 거래나 수납 원장을 변경하지 않습니다. */
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
      showError(paymentError(failure));
    } finally {
      readingRef.current = false;
      setReading(false);
    }
  }

  async function commitImport() {
    if (!selectedFile || !prepared.length) return;
    const previousIds = new Set(ledger.payments.map((payment) => payment.id));
    const failure = await update({
      type: 'import',
      file: selectedFile
    }, '거래를 가져왔어요. 일치 입금은 처리 완료에서, 나머지는 확인 필요에서 확인해주세요.', (saved) => {
      const imported = saved.payments.filter((payment) => !previousIds.has(payment.id));
      const target = imported.find((payment) => payment.status === 'PENDING') ?? imported.find((payment) => payment.status === 'CONFIRMED');
      if (!target) return;
      setMonth(target.date.slice(0, 7));setTab(target.status);
    });
    if (failure) { showError(failure); return; }
    setPage(1);
    setSelection(null);setQuery('');setBuilding(''); setImportOpen(false); setPrepared([]); setSelectedFile(null);
  }

  return (
    <section
      className={styles.page}
      aria-labelledby={'payment-title'}
    >
      <ListHeader
        className={styles.header}
        actionsClassName={[
          styles['header-actions'],
          view === 'monthly' && styles['export-actions']
        ].filter(Boolean).join(' ')}
        menu={'입금 관리'}
        title={view === 'matching' ? '입금 확인·매칭' : '월별 수납 현황'}
        titleId={'payment-title'}
        description={view === 'matching' ? '명단과 일치하는 입금은 자동 확정하고 세대별로 누적합니다.' : '전월 이월액, 당월 부과액, 당월 수납액, 미수금 잔액을 월별로 확인합니다.'}
        actions={view === 'matching' ? (
          <>
            {ledger.payments.some((payment) => payment.source === 'BANK_IMPORT' && payment.status === 'PENDING' && payment.unitId) && (
              <Button
                variant={'outline'}
                loading={busy}
                onClick={async () => {
                  const failure = await update({
                    type: 'confirm-matches'
                  }, '명단과 일치하는 입금을 누적 수납으로 확정했어요.');
                  if (failure) { showError(failure); return; }
                  setSelection(null);setTab('CONFIRMED');
                }}
              >
                일치 입금 자동 확정
              </Button>
            )}
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
        명단의 이름·동호수와 일치하는 입금은 자동 확정하며, 세대별 누적 입금액과 선입금을 관리합니다.
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
              <FilterTabs
                label={'입금 처리 상태'}
                items={PAYMENT_TABS.map((item) => ({
                  value: item.id,
                  label: item.label,
                  count: filtered.filter((payment) => payment.status === item.id).length
                }))}
                value={tab}
                onChange={(value) => {
                  setSelection(null);setTab(value);
                  setPage(1);
                }}
              />
              <div
                className={styles.filters}
              >
                <MonthPicker
                  label={'조회 월'}
                  value={month}
                  onChange={(value) => {
                    setSelection(null);setMonth(value);
                    setPage(1);
                  }}
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
                  onChange={(event) => {
                    setSelection(null);setQuery(event.target.value);
                    setPage(1);
                  }}
                />
                <Dropdown
                  aria-label={'입금 세대 동 필터'}
                  value={building}
                  options={[
                    {
                      value: '',
                      label: '전체 동'
                    },
                    ...getPreviewBuildingOptions(ledger)
                  ]}
                  onChange={(value) => {
                    setSelection(null);setBuilding(value);setPage(1);
                  }}
                />
                <Dropdown
                  aria-label={'입금 표시 개수'}
                  required
                  value={String(pageSize)}
                  options={[10, 20, 50].map((size) => ({
                    value: String(size),
                    label: `${size}개씩 보기`
                  }))}
                  onChange={(value) => {
                    setSelection(null);setPageSize(Number(value));
                    setPage(1);
                  }}
                />
              </div>
              <div
                className={styles['edit-heading']}
              >
                <span>
                  총
                  {matches.length}
                  건
                </span>
                <Button
                  variant={'text'}
                  size={'sm'}
                  aria-pressed={isSelecting}
                  disabled={busy || (!deletable.length && !isSelecting)}
                  onClick={() => setSelection(isSelecting ? null : {
                    scope: selectionScope,
                    ids: []
                  })}
                >
                  {isSelecting ? '완료' : '편집'}
                </Button>
              </div>
              {isSelecting && (
                <div
                  className={styles['selection-bar']}
                >
                  <span
                    role={'status'}
                  >
                    {selected.length}
                    건 선택
                  </span>
                  <Button
                    variant={'outline'}
                    tone={'danger'}
                    size={'sm'}
                    disabled={busy || !selected.length}
                    onClick={() => setDeleteOpen(true)}
                  >
                    선택 삭제
                  </Button>
                </div>
              )}
              <DataTable
                label={'입금 거래'}
                rows={visible}
                getRowKey={(payment) => payment.id}
                onRowClick={(payment) => isSelecting ? toggleSelection(payment) : openPayment(payment.id)}
                minWidth={650}
                emptyState={'조건에 맞는 입금 거래가 없습니다.'}
                columns={[
                  ...(isSelecting ? [{
                    key: 'selection',
                    width: 48,
                    header: (
                      <input
                        type={'checkbox'}
                        aria-label={'현재 페이지 전체 선택'}
                        checked={deletable.length > 0 && selected.length === deletable.length}
                        ref={(element) => { if (element) element.indeterminate = selected.length > 0 && selected.length < deletable.length; }}
                        onChange={(event) => setSelection({
                          scope: selectionScope,
                          ids: event.target.checked ? deletable.map((payment) => payment.id) : []
                        })}
                      />
                    ),
                    render: (payment: PreviewPayment) => (
                      <input
                        type={'checkbox'}
                        aria-label={`${payment.date} ${payment.payer} ${formatWon(payment.amount)} 선택`}
                        checked={selectedIds.includes(payment.id)}
                        disabled={busy || !['PENDING', 'ON_HOLD'].includes(payment.status)}
                        onChange={() => toggleSelection(payment)}
                      />
                    )
                  }] : []),
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
                      const units = payment.status === 'PENDING' || payment.status === 'ON_HOLD' ? selectableUnits : ledger.units;
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
              <div
                className={styles.pagination}
              >
                <Pagination
                  label={'입금 목록 페이지'}
                  unit={'건'}
                  total={matches.length}
                  page={currentPage}
                  pageCount={pageCount}
                  pageSize={pageSize}
                  onPageChange={(value) => { setSelection(null);setPage(value); }}
                />
              </div>
              <p
                className={styles.footer}
              >
                {isSelecting ? '삭제할 입금을 선택해주세요.' : '거래를 선택하면 상세에서 처리할 수 있습니다.'}
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
            setManualOpen(false);setSelection(null);
            setTab('PENDING');
            setMonth(date.slice(0, 7));
            setQuery('');
            setPage(1);
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
            이름 또는 동·호수가 한 세대와 일치하는 입금은 가져올 때 자동 확정합니다. 나머지만 세대를 확인해주세요.
          </p>
          <p>
            관리계좌:
            {ledger.accounts[0]?.label}
          </p>
          <FileDropzone
            label={'통장 거래내역 업로드 영역'}
            inputLabel={'거래내역 파일'}
            accept={'.xls,.xlsx,.csv'}
            description={'.xls · .xlsx · .csv · 최대 5MB · 5,000행'}
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
            은행에서 내려받은 거래내역 파일을 그대로 올려주세요. 거래 머리글을 자동으로 찾고 입금 내역만 가져옵니다. 입금자명 열이 없는 입출금 양식은 적요를 사용합니다.
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
      {deleteOpen && (
        <ClientModal
          className={styles['import-modal']}
          onClose={() => setDeleteOpen(false)}
          busy={busy}
          aria-labelledby={'payment-delete-title'}
        >
          <div
            className={styles['modal-header']}
          >
            <h2
              id={'payment-delete-title'}
            >
              선택한 입금을 삭제할까요?
            </h2>
            <Button
              variant={'ghost'}
              iconOnly
              size={'sm'}
              aria-label={'선택 삭제 확인 닫기'}
              disabled={busy}
              onClick={() => setDeleteOpen(false)}
              leadingIcon={(
                <ServiceIcon
                  name={'close'}
                />
              )}
            />
          </div>
          <p>
            선택한 입금
            {selected.length}
            건을 삭제합니다. 같은 엑셀 파일로 다시 가져올 수 있습니다.
          </p>
          <ul>
            {selected.map((payment) => (
              <li
                key={payment.id}
              >
                {payment.date}
                {' '}
                ·
                {' '}
                {payment.payer}
                {' '}
                ·
                {' '}
                {formatWon(payment.amount)}
              </li>
            ))}
          </ul>
          <div
            className={styles.actions}
          >
            <Button
              variant={'outline'}
              disabled={busy}
              onClick={() => setDeleteOpen(false)}
            >
              취소
            </Button>
            <Button
              variant={'outline'}
              tone={'danger'}
              loading={busy}
              onClick={deleteSelected}
            >
              삭제
            </Button>
          </div>
        </ClientModal>
      )}
      {error && (
        <Toast
          key={errorVersion}
          message={error}
          tone={'error'}
          onClose={() => setError('')}
        />
      )}
    </section>
  );
}
