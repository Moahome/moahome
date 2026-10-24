'use client';

import { LoadingState } from '@/shared/ui/state-message';

import { RequestError } from '@/shared/ui/server-connection-error';

import {
  useRef,
  useState
} from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import {
  getOpeningBalances,
  saveOpeningBalances,
  changeOpeningBalances,
  previewOpeningExcel,
  openingBalanceError,
  type OpeningWorkspace,
  type OpeningInput
} from '@/features/billing-management';
import { Button } from '@/shared/ui/button';
import { useRouter } from 'next/navigation';
import { ListCard } from '@/shared/ui/list-card';
import { CalendarPicker } from '@/shared/ui/calendar-picker';
import {
  AmountInput,
  Input
} from '@/shared/ui/form-controls';
import { createInputWorkbook } from '@/shared/lib/excel-report';
import { DataTable } from '@/shared/ui/data-table';
import { FileDropzone } from '@/shared/ui/file-dropzone';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import { formatInteger } from '@/shared/lib/format';
import styles from './openingBalances.module.css';

/** 계정·관리대상별 초안을 읽고 저장 성공한 서버 버전으로만 편집 화면을 교체합니다. */
export function OpeningBalances({ propertyId }: { propertyId: string }) {
  const session = useSession();
  const client = useQueryClient();
  const queryKey = ['opening-balances', session.data?.id, propertyId];
  const query = useQuery({
    queryKey,
    queryFn: () => getOpeningBalances(propertyId),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0
  });
  if (query.isPending) return (
    <LoadingState
      title={'기존 잔액을 불러오고 있어요.'}
    />
  );
  if (query.isError) return (
    <RequestError
      error={query.error}
      onRetry={() => void query.refetch({
        cancelRefetch: false
      })}
    />
  );

  return (
    <OpeningForm
      key={`${propertyId}:${query.data.batch?.id}:${query.data.batch?.revision}`}
      data={query.data}
      onSaved={(saved) => {
        client.setQueryData(queryKey, saved);
        void client.invalidateQueries({
          predicate: (q) => ['billing', 'payment-workspace'].includes(String(q.queryKey[0]))
        });
      }}
    />
  );
}

function OpeningForm({ data, onSaved }: { data: OpeningWorkspace; onSaved: (data: OpeningWorkspace) => void }) {
  const router = useRouter();
  const month = data.asOf.slice(0, 7);
  const previousEnd = new Date(`${month}-01T00:00:00Z`);
  previousEnd.setUTCDate(0);
  const [cutoff, setCutoff] = useState(data.batch?.cutoffDate ?? data.cutoffDate ?? previousEnd.toISOString().slice(0, 10));
  const [first, setFirst] = useState(data.batch?.firstBillingMonth ?? data.firstBillingMonth ?? month);
  const [units, setUnits] = useState(data.units);
  const [accounts, setAccounts] = useState(data.accounts);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [canceling, setCanceling] = useState(false);
  const confirmed = data.batch?.status === 'CONFIRMED';
  const legacy = data.managementStarted && data.cutoffDate === null;
  const total = (key: 'receivable' | 'credit') => units.reduce((sum, u) => sum + (/^[0-9]+$/.test(u[key]) ? BigInt(u[key]) : BigInt(0)), BigInt(0));

  /** 저장 중 중복 클릭과 입력 변경을 막고 실패하면 작성 내용을 유지합니다. */
  async function run(action: () => Promise<OpeningWorkspace>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setNotice('');
    try { onSaved(await action()); }
    catch (failure) { setNotice(openingBalanceError(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  function updateUnit(id: string, key: 'receivable' | 'credit' | 'originMonth' | 'responsibility', value: string) {
    setUnits((rows) => rows.map((u) => u.unitId === id ? {
      ...u,
      [key]: value
    } : u)); setDirty(true);
  }
  async function save() {
    if (units.some((u) => !/^[0-9]{1,15}$/.test(u.receivable) || !/^[0-9]{1,15}$/.test(u.credit))
      || accounts.some((a) => !/^[0-9]{1,15}$/.test(a.amount))) { setNotice('금액은 0원 이상의 정수로 입력해주세요.'); return; }
    const input: OpeningInput = {
      batchId: data.batch?.id ?? null,
      revision: data.batch?.revision ?? null,
      cutoffDate: cutoff,
      firstBillingMonth: first,
      units: units.map(({ label: _label, ...u }) => u),
      accounts: accounts.map(({ label: _label, ...a }) => a)
    };
    await run(() => saveOpeningBalances(data.propertyId, input));
  }
  /** 서버의 엑셀 검증 결과를 편집 초안에만 반영하며 별도 저장·확정 전에는 원장을 변경하지 않습니다. */
  async function upload(file: File) {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const result = await previewOpeningExcel(data.propertyId, file);
      const indexed = new Map(result.map((u) => [u.unitId, u]));
      setUnits((rows) => rows.map((u) => ({
        ...u,
        ...indexed.get(u.unitId)
      }))); setDirty(true);
      setNotice(`${result.length}세대의 입력을 가져왔어요. 금액을 확인하고 초안을 저장해주세요.`);
    } catch (error) { setNotice(openingBalanceError(error)); }
    finally { pending.current = false; setBusy(false); }
  }
  /** 재업로드 헤더와 세대 식별자는 유지하고 공통 서식·작성 안내만 적용합니다. */
  async function download() {
    const headers = ['세대 ID', '세대', '기존 미납', '기존 선납', '발생월', '부담 주체 메모'];
    const blob = await createInputWorkbook({
      title: '모아홈 기존 잔액 인계',
      sheet: '기존 잔액 인계',
      columns: headers.map((label, index) => ({
        label,
        width: [40, 24, 24, 24, 18, 50][index]
      })),
      rows: units.map((u) => [u.unitId, u.label, u.receivable, u.credit, u.originMonth ?? '', u.responsibility ?? '']),
      instructions: ['첫 시트의 열 제목·순서와 세대 ID를 변경하지 마세요.', '기존 미납·기존 선납은 원 단위 숫자로 입력합니다. 수식은 사용할 수 없습니다.', '발생월과 부담 주체 메모는 선택 항목입니다.', '이 양식의 세대 미납·선납은 동별 통장 보유금과 별개입니다.']
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');link.href = url;link.download = '기존_잔액_인계.xlsx';link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (legacy) return (
    <ListCard>
      <section
        className={styles['existing-state']}
        aria-labelledby={'existing-balance-title'}
      >
        <div
          className={styles['state-icon']}
        >
          <ServiceIcon
            name={'receipt'}
          />
        </div>
        <h2
          id={'existing-balance-title'}
        >
          이미 관리비 부과를 시작한 곳이에요
        </h2>
        <p>
          기존 잔액 인계는 첫 관리비를 부과하기 전에 입력합니다.
          <br />
          이곳에 저장된 관리비와 납부 내역은 아래에서 확인할 수 있어요.
        </p>
        <div
          className={styles['state-actions']}
        >
          <Button
            onClick={() => router.push(`/manage/${data.propertyId}/billing/monthly?tab=monthly`)}
          >
            월별 부과 보기
          </Button>
          <Button
            variant={'outline'}
            onClick={() => router.push(`/manage/${data.propertyId}/payments/monthly`)}
          >
            수납 현황 보기
          </Button>
        </div>
      </section>
    </ListCard>
  );

  return (
    <div
      className={styles.panel}
    >
      <p>
        기존 장부의 미납·선납금과 통장 잔액을 옮겨주세요. 등록만으로 관리비를 부과하지 않으며, 인계를 확정하면 지정한 첫 부과월부터 관리합니다.
      </p>
      <fieldset
        disabled={busy || confirmed}
        className={styles.form}
      >
        <div
          className={styles.dates}
        >
          <CalendarPicker
            label={'기존 장부 기준일'}
            value={cutoff}
            onChange={(value) => { setCutoff(value); setDirty(true); }}
            required
          />
          <CalendarPicker
            label={'첫 신규 관리비 부과월'}
            mode={'month'}
            value={first}
            onChange={(value) => { setFirst(value); setDirty(true); }}
            required
          />
        </div>
        <p>
          10월분을 새로 부과하려면 9월 30일 기준·첫 부과월 10월로 입력하세요. 10월분을 이미 고지했다면 최근 정리일 기준의 남은 잔액을 옮기고 첫 부과월을 11월로 선택하세요.
        </p>
        {!confirmed && (
          <div
            className={styles.tools}
          >
            <Button
              variant={'outline'}
              tone={'excel'}
              leadingIcon={(
                <ServiceIcon
                  name={'excel'}
                />
              )}
              onClick={() => void download()}
            >
              엑셀 양식 다운로드
            </Button>
            <FileDropzone
              label={'기존 잔액 엑셀 업로드'}
              inputLabel={'엑셀 파일 선택'}
              accept={'.xlsx'}
              description={'내려받은 양식을 사용해주세요. 5MB·10,000세대까지 지원합니다.'}
              busy={busy}
              onFile={(file) => void upload(file)}
            />
          </div>
        )}
        <DataTable
          label={'세대별 기존 잔액'}
          rows={units}
          getRowKey={(u) => u.unitId}
          minWidth={900}
          emptyState={'등록된 세대가 없어요.'}
          columns={[
            {
              key: 'unit',
              header: '세대',
              rowHeader: true,
              render: (u) => u.label
            },
            {
              key: 'receivable',
              header: '기존 미납',
              render: (u) => (
                <AmountInput
                  aria-label={`${u.label} 기존 미납`}
                  value={u.receivable}
                  onChange={(v) => updateUnit(u.unitId, 'receivable', v)}
                />
              )
            },
            {
              key: 'credit',
              header: '기존 선납',
              render: (u) => (
                <AmountInput
                  aria-label={`${u.label} 기존 선납`}
                  value={u.credit}
                  onChange={(v) => updateUnit(u.unitId, 'credit', v)}
                />
              )
            },
            {
              key: 'origin',
              header: '발생월 (선택)',
              render: (u) => (
                <CalendarPicker
                  label={`${u.label} 발생월`}
                  labelHidden
                  placeholder={'발생월 선택'}
                  mode={'month'}
                  value={u.originMonth ?? ''}
                  onChange={(v) => updateUnit(u.unitId, 'originMonth', v)}
                />
              )
            },
            {
              key: 'note',
              header: '부담 주체 메모 (선택)',
              render: (u) => (
                <Input
                  aria-label={`${u.label} 부담 주체 메모`}
                  value={u.responsibility ?? ''}
                  maxLength={500}
                  onChange={(e) => updateUnit(u.unitId, 'responsibility', e.target.value)}
                />
              )
            }
          ]}
        />
        <p
          className={styles.totals}
        >
          기존 미납 합계
          {' '}
          {formatInteger(total('receivable'))}
          원 · 기존 선납 합계
          {' '}
          {formatInteger(total('credit'))}
          원
        </p>
        <h3>
          계좌별 시작 통장 잔액
        </h3>
        <p>
          기준일의 실제 은행 잔액을 입력하세요. 세대 미납·선납금과 별도로 관리하며 새 입금액에 더하지 않습니다.
        </p>
        {accounts.map((a) => (
          <AmountInput
            key={a.accountId}
            label={a.label}
            value={a.amount}
            onChange={(value) => {
              setAccounts((rows) => rows.map((row) => row.accountId === a.accountId ? {
                ...row,
                amount: value
              } : row)); setDirty(true);
            }}
          />
        ))}
      </fieldset>
      {confirmed ? (
        <div
          className={styles.actions}
        >
          <p>
            인계 확정 완료 · 기준일 이전 입금은 신규 수납으로 반영하지 않습니다.
          </p>
          <Button
            variant={'outline'}
            onClick={() => setCanceling(true)}
            disabled={busy}
          >
            인계 정정
          </Button>
        </div>
      ) : (
        <div
          className={styles.actions}
        >
          <Button
            variant={'outline'}
            loading={busy}
            onClick={() => void save()}
          >
            초안 저장
          </Button>
          <Button
            disabled={busy || dirty || !data.batch}
            onClick={() => void run(() => changeOpeningBalances(data.propertyId, data.batch!, 'confirm'))}
          >
            인계 확정 · 관리 시작
          </Button>
          {dirty && (
            <p>
              변경한 내용을 저장한 뒤 확정해주세요.
            </p>
          )}
        </div>
      )}
      {canceling && data.batch && (
        <div
          className={styles.correction}
        >
          <p>
            확정 수납이 없을 때만 취소 후 잔액을 다시 인계할 수 있습니다. 기존 월별 청구는 보존하며 기준일과 첫 부과월은 유지합니다.
          </p>
          <Input
            label={'인계 취소 사유'}
            value={reason}
            maxLength={500}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
          />
          <div
            className={styles.actions}
          >
            <Button
              variant={'outline'}
              disabled={busy}
              onClick={() => setCanceling(false)}
            >
              취소
            </Button>
            <Button
              tone={'danger'}
              disabled={busy || !reason.trim()}
              onClick={() => void run(() => changeOpeningBalances(data.propertyId, data.batch!, 'cancel', reason))}
            >
              기존 인계 취소
            </Button>
          </div>
        </div>
      )}
      {data.history.length > 0 && (
        <div>
          <h3>
            인계 이력
          </h3>
          <ul>
            {data.history.map((b) => (
              <li
                key={b.id}
              >
                {b.cutoffDate}
                {' '}
                기준 ·
                {' '}
                {b.status === 'CANCELED' ? `취소: ${b.cancelReason}` : b.status === 'CONFIRMED' ? '확정' : '초안'}
              </li>
            ))}
          </ul>
        </div>
      )}
      {notice && (
        <Toast
          message={notice}
          onClose={() => setNotice('')}
        />
      )}
    </div>
  );
}

