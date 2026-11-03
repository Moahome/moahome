'use client';

import { BankImportEditor } from '@/entities/banking';
import { ApiError } from '@/shared/api';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { DataTable } from '@/shared/ui/data-table';
import { FileDropzone } from '@/shared/ui/file-dropzone';
import { FilterTabs } from '@/shared/ui/filter-tabs';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { Pagination } from '@/shared/ui/pagination';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import { StateMessage } from '@/shared/ui/state-message';
import {
  useEffect,
  useRef,
  useState
} from 'react';
import {
  previewRegistrationBank,
  readRegistrationBankFile
} from '../../../api/registrationBankApi';
import type { RegistrationAccount } from '../../../model/bankAccountTypes';
import {
  createRegistrationBankChoice,
  getRegistrationBankError,
  getRegistrationBankBalance
} from '../../../model/registrationBank';
import type {
  RegistrationBankChoice,
  RegistrationBankDraft,
  RegistrationBankRow,
  RegistrationBankSupport
} from '../../../model/registrationBankTypes';
import type {
  BuildingDraft,
  UnitDraft
} from '../../../model/unitSetupTypes';
import styles from './registrationBankUpload.module.css';

/** 은행별 검증과 기존 거래 설정을 재사용하며 모든 입력은 최종 등록 전까지 초안으로만 유지합니다. */
export function RegistrationBankUpload({ account, cutoffDate, draft, units, buildings, support, onChange, onBalance, onBusyChange }: {
  support: RegistrationBankSupport;
  account: RegistrationAccount;
  cutoffDate: string;
  draft?: RegistrationBankDraft;
  units: UnitDraft[];
  buildings: BuildingDraft[];
  onChange: (draft: RegistrationBankDraft) => void;
  onBalance: (amount: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const activeRef = useRef(true);
  const [replacing, setReplacing] = useState(false);
  const [direction, setDirection] = useState('ALL');
  const [query, setQuery] = useState('');
  const [processing, setProcessing] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
  const row = draft?.rows.find((entry) => entry.id === editingId);
  const labels = units.map((unit) => ({
    id: unit.clientId,
    label: `${buildings.find((building) => building.clientId === unit.buildingClientId)?.name ?? ''} ${unit.unitNumber}${unit.unitNumber.endsWith('호') ? '' : '호'}`.trim()
  }));
  const targets = buildings.map((building) => ({
    id: building.clientId,
    label: building.name
  }));

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; onBusyChange(false); };
  }, [onBusyChange]);

  /** 검증에 실패한 새 파일은 기존 거래 선택·입력을 덮어쓰지 않습니다. */
  async function upload(file: File) {
    if (!support?.enabled || busyRef.current) return;
    if (!support.extensions.some((extension) => file.name.toLowerCase().endsWith(extension)) || file.size > 5 * 1024 * 1024) {
      setNotice((previous) => ({
        id: (previous?.id ?? 0) + 1,
        message: `${support.message} · 최대 5MB까지 업로드할 수 있습니다.`
      })); return;
    }
    busyRef.current = true; setBusy(true); onBusyChange(true);
    try {
      const [result, content] = await Promise.all([previewRegistrationBank(file, account.bankCode), readRegistrationBankFile(file)]);
      if (!activeRef.current) return;
      onChange({
        fileName: file.name,
        content,
        bankCode: account.bankCode,
        accountNumber: account.accountNumber,
        rows: result.rows,
        choices: Object.fromEntries(result.rows.map((entry) => [entry.id, createRegistrationBankChoice(entry, units, buildings)])),
        period: result.period
      });
      setPage(1); setQuery(''); setDirection('ALL'); setProcessing('ALL'); setEditingId(null); setReplacing(false);
    } catch (error) {
      if (activeRef.current) setNotice((previous) => ({
        id: (previous?.id ?? 0) + 1,
        message: error instanceof ApiError && error.code === 'INVALID_BANK_HEADER' ? '선택한 통장 은행의 거래내역 파일인지 확인해주세요.' : '은행 파일을 확인하지 못했습니다. 형식과 내용을 확인한 뒤 다시 선택해주세요.'
      }));
    } finally {
      busyRef.current = false;
      if (activeRef.current) { setBusy(false); onBusyChange(false); }
    }
  }

  function updateChoice(id: string, patch: Partial<RegistrationBankChoice>) {
    if (!draft) return;
    onChange({
      ...draft,
      choices: {
        ...draft.choices,
        [id]: {
          ...draft.choices[id],
          ...patch
        }
      }
    });
  }

  function kind(entry: RegistrationBankRow) {
    const choice = draft?.choices[entry.id];
    if (choice?.transfer) return 'TRANSFER';
    if (entry.direction === 'EXPENSE') return 'EXPENSE';
    return choice?.receipt.kind === 'AUTO' ? 'NEEDS' : choice?.receipt.kind ?? 'NEEDS';
  }

  function processingLabel(entry: RegistrationBankRow) {
    const choice = draft?.choices[entry.id];
    if (choice?.transfer) return '관리 통장 간 이체';
    if (entry.direction === 'EXPENSE') {
      if (choice?.expense.mode === 'PROPERTY') return '지출';
      return choice?.expense.allocations.length ? `지출 · ${choice.expense.allocations.length}곳 부담` : '지출 배분 필요';
    }
    if (choice?.receipt.kind === 'HOUSEHOLD') return `세대 수납 · ${labels.find((unit) => unit.id === choice.receipt.unitId)?.label ?? '세대 선택 필요'}`;
    if (choice?.receipt.kind === 'OTHER') return '기타 입금';
    if (choice?.receipt.kind === 'SHARED') return `동별 입금 · ${choice.expense.allocations.length}개 동 배분`;
    return '입금 분류 필요';
  }

  const rows = draft?.rows ?? [];
  const selected = rows.filter((entry) => draft?.choices[entry.id]?.included);
  const filtered = rows.filter((entry) => (direction === 'ALL' || entry.direction === direction) && (processing === 'ALL' || kind(entry) === processing)
    && `${entry.payer} ${entry.memo ?? ''} ${processingLabel(entry)}`.includes(query.trim()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allChecked = pageRows.length > 0 && pageRows.every((entry) => draft?.choices[entry.id]?.included);
  const fileBalance = getRegistrationBankBalance(draft, cutoffDate);

  useEffect(() => {
    if (account.openingAmount !== (fileBalance ?? '')) onBalance(fileBalance ?? '');
  }, [fileBalance, account.openingAmount, onBalance]);

  function selectMany(ids: string[], included: boolean) {
    if (!draft) return;
    const choices = {
      ...draft.choices
    };
    for (const id of ids) choices[id] = {
      ...choices[id],
      included
    };
    onChange({
      ...draft,
      choices
    });
  }

  /** 현재 거래 설정을 검사하되 다른 페이지 거래의 검증은 다음 단계에서도 전체 기준으로 수행합니다. */
  function completeSetting() {
    if (!draft || !row) return;
    const error = getRegistrationBankError({
      ...draft,
      rows: [row]
    }, cutoffDate, units, buildings);
    if (error) { setNotice((previous) => ({
      id: (previous?.id ?? 0) + 1,
      message: error
    })); return; }
    setEditingId(null);
  }

  return (
    <section
      className={styles.section}
      aria-label={'초기 은행 거래내역 업로드'}
    >
      {(!draft || replacing || !draft.content) && (
        <FileDropzone
          label={'은행 거래내역 파일'}
          inputLabel={'은행 거래내역 파일 선택'}
          accept={support.extensions.join(',')}
          description={support.message}
          disabled={!support.enabled}
          busy={busy}
          onFile={(file) => void upload(file)}
        />
      )}
      {draft && (
        <>
          <div
            className={styles['file-info']}
          >
            <div>
              <strong>
                {draft.fileName}
              </strong>
              <p>
                {`거래 기간 ${draft.period.from} ~ ${draft.period.to}`}
              </p>
            </div>
            <Button
              variant={'outline'}
              size={'sm'}
              disabled={busy}
              onClick={() => setReplacing(true)}
            >
              파일 변경
            </Button>
          </div>
          <p>
            가져올 거래를 선택하고 행을 눌러 입금 세대·용도와 출금 배분을 확인해주세요. 마지막 등록 시 함께 저장됩니다.
          </p>
          {fileBalance !== null && (
            <div
              className={styles['file-info']}
            >
              <p>
                {`${cutoffDate} 파일 잔액 ${formatWon(BigInt(fileBalance))}`}
              </p>
            </div>
          )}
          <FilterTabs
            label={'업로드 입출금 구분'}
            value={direction}
            onChange={(value) => { setDirection(value); setProcessing('ALL'); setPage(1); }}
            items={[{
              value: 'ALL',
              label: '전체',
              count: rows.length
            }, {
              value: 'INCOME',
              label: '입금',
              count: rows.filter((entry) => entry.direction === 'INCOME').length
            }, {
              value: 'EXPENSE',
              label: '출금',
              count: rows.filter((entry) => entry.direction === 'EXPENSE').length
            }]}
          />
          <div
            className={styles.filters}
          >
            <Input
              label={'거래 검색'}
              aria-label={'거래 검색'}
              value={query}
              placeholder={'입금자·지출명으로 검색'}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
            />
            <Dropdown
              label={'처리 내용'}
              value={processing}
              onChange={(value) => { setProcessing(value); setPage(1); }}
              options={[{
                value: 'ALL',
                label: '전체'
              }, {
                value: 'NEEDS',
                label: '입금 분류 필요'
              }, {
                value: 'HOUSEHOLD',
                label: '세대 수납'
              }, {
                value: 'OTHER',
                label: '기타 입금'
              }, {
                value: 'SHARED',
                label: '동별 입금'
              }, {
                value: 'EXPENSE',
                label: '지출'
              }, {
                value: 'TRANSFER',
                label: '계좌 간 이체'
              }]}
            />
            <Dropdown
              label={'표시 개수'}
              value={String(pageSize)}
              onChange={(value) => { setPageSize(Number(value)); setPage(1); }}
              options={[10, 20, 50].map((count) => ({
                value: String(count),
                label: `${count}개씩 보기`
              }))}
            />
          </div>
          <div
            className={styles.selection}
          >
            <Button
              variant={'text'}
              size={'sm'}
              onClick={() => selectMany(rows.map((entry) => entry.id), true)}
            >
              전체 거래 선택
            </Button>
            <Button
              variant={'text'}
              size={'sm'}
              onClick={() => selectMany(rows.map((entry) => entry.id), false)}
            >
              전체 선택 해제
            </Button>
          </div>
          <DataTable
            label={'초기 업로드 거래 미리보기'}
            rows={pageRows}
            getRowKey={(entry) => entry.id}
            emptyState={(
              <StateMessage
                variant={'no-results'}
                layout={'inline'}
                title={'조건에 맞는 거래가 없어요.'}
                description={'검색어나 입출금 필터를 변경해주세요.'}
              />
            )}
            onRowClick={(entry) => setEditingId(entry.id)}
            columns={[
              {
                key: 'select',
                header: (
                  <input
                    type={'checkbox'}
                    aria-label={'현재 페이지 거래 전체 선택'}
                    checked={allChecked}
                    onChange={(event) => selectMany(pageRows.map((entry) => entry.id), event.target.checked)}
                  />
                ),
                render: (entry) => (
                  <input
                    type={'checkbox'}
                    aria-label={`${entry.date} ${entry.payer} 선택`}
                    checked={draft.choices[entry.id]?.included ?? false}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => updateChoice(entry.id, {
                      included: event.target.checked
                    })}
                  />
                )
              },
              {
                key: 'date',
                header: '거래일',
                render: (entry) => entry.date
              },
              {
                key: 'direction',
                header: '구분',
                render: (entry) => entry.direction === 'INCOME' ? '입금' : '출금'
              },
              {
                key: 'payer',
                header: '입금자·지출명',
                render: (entry) => entry.payer
              },
              {
                key: 'processing',
                header: '처리 내용',
                render: processingLabel
              },
              {
                key: 'amount',
                header: '금액',
                render: (entry) => formatWon(BigInt(entry.amount) * (entry.direction === 'EXPENSE' ? BigInt(-1) : BigInt(1)))
              },
              {
                key: 'balance',
                header: '은행 잔액',
                render: (entry) => entry.balance === null ? '—' : formatWon(BigInt(entry.balance))
              }
            ]}
          />
          <Pagination
            label={'업로드 거래'}
            unit={'건'}
            total={filtered.length}
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            onPageChange={setPage}
          />
          <p
            role={'status'}
          >
            {`선택 ${selected.length}건 · 입금 ${selected.filter((entry) => entry.direction === 'INCOME').length}건 · 출금 ${selected.filter((entry) => entry.direction === 'EXPENSE').length}건`}
          </p>
        </>
      )}
      {row && draft && (
        <ClientModal
          className={styles['editor-modal']}
          onClose={() => setEditingId(null)}
          aria-labelledby={'registration-bank-editor-title'}
          closeOnOutsideClick
        >
          <header
            className={styles['modal-header']}
          >
            <h2
              id={'registration-bank-editor-title'}
            >
              거래 설정
            </h2>
            <Button
              variant={'ghost'}
              iconOnly
              aria-label={'거래 설정 닫기'}
              onClick={() => setEditingId(null)}
            >
              <ServiceIcon
                name={'close'}
              />
            </Button>
          </header>
          <div
            className={styles['modal-body']}
          >
            <p>
              {`${row.date} · ${row.payer} · ${formatWon(BigInt(row.amount))}`}
            </p>
            <label
              className={styles.transfer}
            >
              <input
                type={'checkbox'}
                checked={draft.choices[row.id].transfer}
                onChange={(event) => updateChoice(row.id, {
                  transfer: event.target.checked
                })}
              />
              관리 통장 간 이체
            </label>
            {!draft.choices[row.id].transfer && (
              <BankImportEditor
                direction={row.direction}
                amount={row.amount}
                suggestedUnitId={draft.choices[row.id].receipt.unitId}
                units={labels}
                buildings={targets}
                receipt={draft.choices[row.id].receipt}
                expense={draft.choices[row.id].expense}
                onReceiptChange={(receipt) => updateChoice(row.id, {
                  receipt
                })}
                onExpenseChange={(expense) => updateChoice(row.id, {
                  expense
                })}
              />
            )}
          </div>
          <footer
            className={styles['modal-actions']}
          >
            <Button
              onClick={completeSetting}
            >
              설정 완료
            </Button>
          </footer>
        </ClientModal>
      )}
      {notice && (
        <Toast
          key={notice.id}
          message={notice.message}
          tone={'error'}
          onClose={() => setNotice(null)}
        />
      )}
    </section>
  );
}
