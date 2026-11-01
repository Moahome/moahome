'use client';

import {
  capturePropertyQueryScope,
  setPropertyQueryData
} from '@/entities/property';

import { LoadingState } from '@/shared/ui/state-message';

import { RequestError } from '@/shared/ui/server-connection-error';

import {
  useEffect,
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
import { BankIcon } from '@/entities/banking';
import { SummaryCard } from '@/shared/ui/summary-card';
import { OpeningUnitList } from './openingUnitList';
import { ClientModal } from '@/shared/ui/client-modal';
import { InitialBalanceEditor } from './initialBalanceEditor';
import { OpeningUnitEditor } from './openingUnitEditor';
import { ListCard } from '@/shared/ui/list-card';
import { CalendarPicker } from '@/shared/ui/calendar-picker';
import {
  AmountInput,
  Input
} from '@/shared/ui/form-controls';
import { createInputWorkbook } from '@/shared/lib/excel-report';
import { OpeningUploadContent } from './openingUploadContent';
import type { OpeningBalanceDraft as DraftSeed } from '../../_types/openingBalanceDraftTypes';
import { goBackToRoute } from '@/shared/lib/navigation-history';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import { formatInteger } from '@/shared/lib/format';
import styles from './openingBalances.module.css';

/** 계정·관리대상별 초안을 읽고 저장 성공한 서버 버전으로만 편집 화면을 교체합니다. */
export function OpeningBalances({ propertyId, uploadPage = false, correctionPage = false }: { propertyId: string; uploadPage?: boolean; correctionPage?: boolean }) {
  const session = useSession();
  const propertyScope = capturePropertyQueryScope(session.data?.id, propertyId);
  const client = useQueryClient();
  const queryKey = ['opening-balances', session.data?.id, propertyId];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getOpeningBalances(propertyId, signal),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0
  });
  const draftKey = ['opening-balance-draft', session.data?.id, propertyId];
  const draftQuery = useQuery<DraftSeed | null>({
    queryKey: draftKey,
    queryFn: () => null,
    initialData: null,
    enabled: false,
    gcTime: 5 * 60 * 1000
  });
  const draftSeed = draftQuery.data;
  const currentDraft = draftSeed && draftSeed.batchId === (query.data?.batch?.id ?? null)
    && draftSeed.revision === (query.data?.batch?.revision ?? null) ? draftSeed : null;
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
      key={`${propertyId}:${query.data.batch?.id}:${query.data.batch?.revision}:${currentDraft?.version ?? 0}`}
      data={query.data}
      uploadPage={uploadPage}
      correctionPage={correctionPage}
      initialDraft={currentDraft}
      onDraft={(draft) => setPropertyQueryData(client, draftKey, {
        ...draft,
        owner: session.data?.id
      }, propertyScope)}
      onSaved={(saved, seed) => {
        // 취소 응답의 현재 세대·계좌 범위를 유지하고 이전 금액만 편집 초안으로 복원합니다.
        const unitDrafts = new Map(seed?.units.map((unit) => [unit.unitId, unit]));
        const accountDrafts = new Map(seed?.accounts.map((account) => [account.accountId, account]));
        setPropertyQueryData(client, draftKey, seed ? {
          ...seed,
          owner: session.data?.id,
          batchId: saved.batch?.id ?? null,
          revision: saved.batch?.revision ?? null,
          units: saved.units.map((unit) => ({
            ...unit,
            ...unitDrafts.get(unit.unitId)
          })),
          accounts: saved.accounts.map((account) => ({
            ...account,
            ...accountDrafts.get(account.accountId)
          }))
        } : null, propertyScope);
        setPropertyQueryData(client, queryKey, saved, propertyScope);
        void client.invalidateQueries({
          predicate: (q) => ['billing', 'payment-workspace', 'banking-balances', 'monthly-settlement'].includes(String(q.queryKey[0]))
          && q.queryKey[1] === session.data?.id && q.queryKey[2] === propertyId
        });
      }}
    />
  );
}

function OpeningForm({ data, initialDraft, onSaved, uploadPage, correctionPage, onDraft }: { data: OpeningWorkspace; initialDraft: DraftSeed | null; uploadPage: boolean; correctionPage: boolean; onDraft: (draft: DraftSeed) => void; onSaved: (data: OpeningWorkspace, seed?: DraftSeed) => void }) {
  const router = useRouter();
  const month = data.asOf.slice(0, 7);
  const previousEnd = new Date(`${month}-01T00:00:00Z`);
  previousEnd.setUTCDate(0);
  const [cutoff, setCutoff] = useState(initialDraft?.cutoff ?? data.batch?.cutoffDate ?? data.cutoffDate ?? previousEnd.toISOString().slice(0, 10));
  const [first, setFirst] = useState(initialDraft?.first ?? data.batch?.firstBillingMonth ?? data.firstBillingMonth ?? month);
  const [units, setUnits] = useState(initialDraft?.units ?? data.units);
  const [accounts, setAccounts] = useState(initialDraft?.accounts ?? data.accounts);
  const [dirty, setDirty] = useState(initialDraft?.dirty ?? false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [notice, setNotice] = useState(initialDraft?.message ?? '');
  const [noticeTone, setNoticeTone] = useState<'success' | 'error'>(initialDraft?.message ? 'success' : 'error');
  const [noticeId, setNoticeId] = useState(0);
  const [reason, setReason] = useState('');
  const [canceling, setCanceling] = useState(false);
  const [editing, setEditing] = useState<string | null>(initialDraft?.editId ?? null);
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const [correctingInitial, setCorrectingInitial] = useState(false);
  const [importing, setImporting] = useState(false);
  const confirmed = data.batch?.status === 'CONFIRMED';
  const initialLocked = data.managementStarted && Boolean(data.correctionDeadline && data.asOf > data.correctionDeadline);
  const legacy = data.managementStarted && data.cutoffDate === null;
  const total = (key: 'receivable' | 'credit') => units.reduce((sum, u) => sum + (/^[0-9]+$/.test(u[key]) ? BigInt(u[key]) : BigInt(0)), BigInt(0));

  /** 모바일 왕복에서는 미저장 금액·기준일을 메모리에만 보관하고 서버 원장과 분리합니다. */
  function snapshot(): DraftSeed {
    return {
      propertyId: data.propertyId,
      batchId: data.batch?.id ?? null,
      revision: data.batch?.revision ?? null,
      cutoff,
      first,
      units,
      accounts,
      dirty,
      editId: null,
      version: Date.now()
    };
  }

  function openUpload() {
    if (window.matchMedia('(max-width: 767px)').matches) {
      onDraft(snapshot());
      router.push(`/manage/${data.propertyId}/billing/monthly/opening-upload`);
      return;
    }
    setImporting(true);
  }

  /** 같은 오류를 재시도해도 알림 시간을 다시 시작하며 입력은 유지합니다. */
  function showNotice(message: string, tone: 'success' | 'error' = 'error') {
    setNotice(message); setNoticeTone(tone); setNoticeId((id) => id + 1);
  }

  /** 저장 중 중복 클릭과 입력 변경을 막고 실패하면 작성 내용을 유지합니다. */
  async function run(action: () => Promise<OpeningWorkspace>, seed?: DraftSeed) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setNotice('');
    try { onSaved(await action(), seed); }
    catch (failure) { showNotice(openingBalanceError(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  /** 표시 중인 페이지와 관계없이 전체 세대·계좌를 검증하고 표시 메타데이터는 저장 요청에서 제외합니다. */
  async function save() {
    if (units.some((u) => !/^[0-9]{1,15}$/.test(u.receivable) || !/^[0-9]{1,15}$/.test(u.credit))
      || accounts.some((a) => !/^[0-9]{1,15}$/.test(a.amount))) { showNotice('금액은 0원 이상의 정수로 입력해주세요.'); return; }
    const input: OpeningInput = {
      batchId: data.batch?.id ?? null,
      revision: data.batch?.revision ?? null,
      cutoffDate: cutoff,
      firstBillingMonth: first,
      units: units.map(({ unitId, receivable, credit, originMonth, responsibility }) => ({
        unitId,
        receivable,
        credit,
        originMonth,
        responsibility
      })),
      accounts: accounts.map(({ accountId, amount }) => ({
        accountId,
        amount
      }))
    };
    await run(() => saveOpeningBalances(data.propertyId, input));
  }
  /** 서버의 엑셀 검증 결과를 편집 초안에만 반영하며 별도 저장·확정 전에는 원장을 변경하지 않습니다. */
  async function upload(file: File) {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const result = await previewOpeningExcel(data.propertyId, file);
      // 모바일 헤더 뒤로가기 뒤의 늦은 검증 응답이 새 편집 화면을 덮어쓰지 않게 합니다.
      if (!active.current) return;
      const indexed = new Map(result.map((u) => [u.unitId, u]));
      const updated = units.map((unit) => ({
        ...unit,
        ...indexed.get(unit.unitId)
      }));
      const message = `${result.length}세대의 입력을 가져왔어요. 금액을 확인하고 임시 저장해주세요.`;
      if (uploadPage) {
        onDraft({
          ...snapshot(),
          units: updated,
          dirty: true,
          message
        });
        goBackToRoute(`/manage/${data.propertyId}/billing/monthly?tab=opening`, (href) => router.replace(href));
        return;
      }
      setUnits(updated); setDirty(true); setImporting(false);
      showNotice(message, 'success');
    } catch (error) { showNotice(openingBalanceError(error)); }
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
    <div
      className={styles.panel}
    >
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
      <InitialBalanceHistoryView
        changes={data.corrections}
      />
    </div>
  );

  if (correctionPage) return (
    <ListCard>
      <InitialBalanceEditor
        data={data}
        page
        onClose={() => goBackToRoute(`/manage/${data.propertyId}/billing/monthly?tab=opening`, (href) => router.replace(href))}
        onSaved={(saved) => {
          onSaved(saved);
          goBackToRoute(`/manage/${data.propertyId}/billing/monthly?tab=opening`, (href) => router.replace(href));
        }}
      />
    </ListCard>
  );

  if (uploadPage) return (
    <ListCard>
      {confirmed ? (
        <p>
          확정된 인계입니다. 기존 잔액 인계 화면에서 정정한 뒤 업로드해주세요.
        </p>
      ) : (
        <OpeningUploadContent
          busy={busy}
          onFile={(file) => void upload(file)}
          onDownload={() => void download()}
        />
      )}
      {notice && (
        <Toast
          key={noticeId}
          tone={noticeTone}
          message={notice}
          onClose={() => setNotice('')}
        />
      )}
    </ListCard>
  );

  const selected = units.find((unit) => unit.unitId === editing);

  return (
    <div
      className={styles.panel}
    >
      <ListCard>
        <div
          className={styles['section-heading']}
        >
          <div
            className={styles['heading-copy']}
          >
            <span
              className={styles['state-icon']}
            >
              <ServiceIcon
                name={'receipt'}
              />
            </span>
            <div>
              <h2>
                기존 잔액 인계
              </h2>
              <p>
                이전 기간의 미납·선납금과 통장 시작 잔액을 입력하여 새 부과를 위한 기존 잔액으로 인계합니다.
              </p>
              <p>
                세대별 미납·선납금과 계좌의 시작 잔액은 별도로 관리되며, 새 입금액에 더하지 않습니다.
              </p>
            </div>
          </div>
          <div
            className={styles.actions}
          >
            {!initialLocked && (
              <>
                {confirmed && (
                  <Button
                    variant={'outline'}
                    disabled={busy || data.initialCorrectionAllowed !== true}
                    onClick={() => {
                      if (window.matchMedia('(max-width: 767px)').matches) {
                        router.push(`/manage/${data.propertyId}/billing/monthly/initial-correction`); return;
                      }
                      setCorrectingInitial(true);
                    }}
                  >
                    초기 기준 정정
                  </Button>
                )}
                {confirmed ? (
                  <Button
                    variant={'outline'}
                    disabled={busy || data.initialCorrectionAllowed === false}
                    onClick={() => { setCorrectionId(null); setCanceling(true); }}
                  >
                    인계 정정
                  </Button>
                ) : (
                  <>
                    <Button
                      variant={'outline'}
                      loading={busy}
                      onClick={() => void save()}
                      leadingIcon={(
                        <ServiceIcon
                          name={'receipt'}
                        />
                      )}
                    >
                      임시 저장
                    </Button>
                    <Button
                      disabled={busy || dirty || !data.batch}
                      onClick={() => void run(() => changeOpeningBalances(data.propertyId, data.batch!, 'confirm'))}
                      leadingIcon={(
                        <ServiceIcon
                          name={'check'}
                        />
                      )}
                    >
                      인계 확정
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        {data.managementStarted && data.correctionDeadline && (
          <p
            className={styles['correction-period']}
          >
            {!initialLocked ? `초기 기준 정정 가능: ${data.correctionDeadline}까지` : `초기 기준 잠금 · 정정 기한 ${data.correctionDeadline}`}
          </p>
        )}
        <fieldset
          className={styles.dates}
          disabled={busy || confirmed || data.managementStarted}
        >
          <CalendarPicker
            label={'기존 장부 기준일'}
            value={cutoff}
            maxDate={data.asOf}
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
        </fieldset>
        <p>
          기준일 이전 장부의 남은 금액을 입력하고, 기준일 이후 새로 부과할 첫 달을 선택해주세요.
        </p>
        {confirmed && (
          <p
            className={styles['saved-state']}
          >
            인계 확정 완료 · 기준일 이전 입금은 신규 수납으로 반영하지 않습니다.
          </p>
        )}
        {dirty && (
          <p
            className={styles['draft-state']}
          >
            변경한 내용을 임시 저장한 뒤 확정해주세요.
          </p>
        )}
      </ListCard>
      <div
        className={styles.summary}
      >
        <SummaryCard
          density={'compact'}
          label={'기존 미납 합계'}
          value={formatInteger(total('receivable'))}
          unit={'원'}
          tone={'primary'}
          icon={(
            <ServiceIcon
              name={'receipt'}
            />
          )}
        />
        <SummaryCard
          density={'compact'}
          label={'기존 선납 합계'}
          value={formatInteger(total('credit'))}
          unit={'원'}
          tone={'teal'}
          icon={(
            <ServiceIcon
              name={'coins'}
            />
          )}
        />
        <SummaryCard
          density={'compact'}
          label={'세대 수'}
          value={units.length}
          unit={'세대'}
          tone={'neutral'}
          icon={(
            <ServiceIcon
              name={'users'}
            />
          )}
        />
        <SummaryCard
          density={'compact'}
          label={'관리 계좌'}
          value={accounts.length}
          unit={'개'}
          tone={'primary'}
          icon={(
            <ServiceIcon
              name={'bank'}
            />
          )}
        />
      </div>
      <OpeningUnitList
        units={units}
        busy={busy}
        confirmed={confirmed}
        locked={initialLocked}
        onUpload={openUpload}
        onEdit={(unitId) => {
          if (confirmed) { setCorrectionId(unitId); setCanceling(true); return; }
          setEditing(unitId);
        }}
      />
      <ListCard>
        <div
          className={styles['account-heading']}
        >
          <ServiceIcon
            name={'bank'}
          />
          <h2>
            계좌별 시작 잔액
          </h2>
          <p>
            세대 미납·선납과 별도로 관리되는 실제 은행 시작 잔액입니다.
          </p>
        </div>
        <fieldset
          className={styles.accounts}
          disabled={busy || confirmed || initialLocked}
        >
          {accounts.map((account) => (
            <div
              className={styles.account}
              key={account.accountId}
            >
              <div
                className={styles['account-label']}
              >
                {account.bankCode ? (
                  <BankIcon
                    bankCode={account.bankCode}
                  />
                ) : (
                  <ServiceIcon
                    name={'bank'}
                  />
                )}
                <strong>
                  {account.label}
                </strong>
              </div>
              {confirmed ? (
                <div
                  className={styles['account-amount']}
                >
                  <span>
                    시작 잔액
                  </span>
                  <strong>
                    {account.initialBalance === false ? '인계 기록 없음' : `${formatInteger(account.amount)}원`}
                  </strong>
                </div>
              ) : (
                <AmountInput
                  label={'시작 잔액'}
                  aria-label={`${account.label} 시작 잔액`}
                  value={account.amount}
                  onChange={(value) => {
                    setAccounts((rows) => rows.map((row) => row.accountId === account.accountId ? {
                      ...row,
                      amount: value
                    } : row)); setDirty(true);
                  }}
                />
              )}
            </div>
          ))}
          {!accounts.length && (
            <p>
              등록된 관리 계좌가 없어요.
            </p>
          )}
        </fieldset>
      </ListCard>
      <ListCard>
        <div
          className={styles['account-heading']}
        >
          <ServiceIcon
            name={'clock'}
          />
          <h2>
            인계 이력
          </h2>
        </div>
        {data.history.length ? (
          <ul
            className={styles.history}
          >
            {data.history.map((batch) => (
              <li
                key={batch.id}
              >
                <span>
                  {batch.cutoffDate}
                  {' '}
                  기준 ·
                  {' '}
                  {batch.firstBillingMonth}
                  {' '}
                  첫 부과
                </span>
                <span
                  className={styles.badge}
                  data-tone={batch.status === 'CONFIRMED' ? 'teal' : undefined}
                >
                  {batch.status === 'CANCELED' ? '취소' : batch.status === 'CONFIRMED' ? '확정' : '임시 저장'}
                </span>
                {batch.cancelReason && (
                  <p>
                    {batch.cancelReason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            아직 저장된 인계 이력이 없어요.
          </p>
        )}
      </ListCard>
      <InitialBalanceHistoryView
        changes={data.corrections}
      />
      {correctingInitial && (
        <InitialBalanceEditor
          data={data}
          onClose={() => setCorrectingInitial(false)}
          onSaved={(saved) => { setCorrectingInitial(false); onSaved(saved); }}
        />
      )}
      {selected && (
        <OpeningUnitEditor
          unit={selected}
          onClose={() => setEditing(null)}
          onApply={(unit) => {
            setUnits((rows) => rows.map((row) => row.unitId === unit.unitId ? unit : row)); setDirty(true); setEditing(null);
          }}
        />
      )}
      {importing && (
        <ClientModal
          className={styles.modal}
          aria-labelledby={'opening-import-title'}
          busy={busy}
          onClose={() => setImporting(false)}
        >
          <header
            className={styles['section-heading']}
          >
            <h2
              id={'opening-import-title'}
            >
              기존 잔액 엑셀 업로드
            </h2>
            <Button
              iconOnly
              variant={'ghost'}
              aria-label={'엑셀 업로드 닫기'}
              disabled={busy}
              onClick={() => setImporting(false)}
              leadingIcon={(
                <ServiceIcon
                  name={'close'}
                />
              )}
            />
          </header>
          <OpeningUploadContent
            busy={busy}
            onFile={(file) => void upload(file)}
            onDownload={() => void download()}
          />
        </ClientModal>
      )}
      {canceling && data.batch && (
        <ClientModal
          className={styles.modal}
          aria-labelledby={'opening-cancel-title'}
          busy={busy}
          onClose={() => setCanceling(false)}
        >
          <header
            className={styles['section-heading']}
          >
            <h2
              id={'opening-cancel-title'}
            >
              확정 인계 정정
            </h2>
            <Button
              iconOnly
              variant={'ghost'}
              aria-label={'확정 인계 정정 닫기'}
              disabled={busy}
              onClick={() => setCanceling(false)}
              leadingIcon={(
                <ServiceIcon
                  name={'close'}
                />
              )}
            />
          </header>
          <div
            className={styles.editor}
          >
            <p>
              확정 수납이 없을 때만 기존 인계 전체를 취소하고 다시 인계할 수 있습니다. 기존 입력은 편집 초안으로 유지됩니다. 기존 월별 청구와 기준일·첫 부과월은 유지합니다.
            </p>
            <Input
              label={'인계 취소 사유'}
              value={reason}
              maxLength={500}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
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
                onClick={() => void run(() => changeOpeningBalances(data.propertyId, data.batch!, 'cancel', reason), {
                  ...snapshot(),
                  dirty: true,
                  editId: correctionId
                })}
              >
                기존 인계 취소
              </Button>
            </div>
          </div>
        </ClientModal>
      )}
      {notice && (
        <Toast
          key={noticeId}
          tone={noticeTone}
          message={notice}
          onClose={() => setNotice('')}
        />
      )}
    </div>
  );
}

/** 정정 기한이나 원 인계 유무와 무관하게 저장한 초기 기준 정정 이력은 계속 조회합니다. */
function InitialBalanceHistoryView({ changes }: { changes?: OpeningWorkspace['corrections'] }) {
  if (!changes?.length) return null;
  return (
    <ListCard>
      <h2>
        초기 기준 정정 이력
      </h2>
      <ul
        className={styles.history}
      >
        {changes.map((change) => (
          <li
            key={change.id}
          >
            <strong>
              {change.kind === 'BUILDING' ? '동별 시작 잔고' : change.kind === 'ACCOUNT' ? '통장 시작 잔액' : '인계 기준일·통장 시작 잔액'}
            </strong>
            <span>
              {new Date(change.changedAt).toLocaleString('ko-KR', {
                timeZone: 'Asia/Seoul'
              })}
              {' '}
              ·
              {' '}
              {change.changedByName}
            </span>
            <p>
              기준일
              {change.previousDate ?? '미설정'}
              {' '}
              →
              {change.newDate ?? '미설정'}
            </p>
            {change.details.map((detail) => (
              <p
                key={detail.targetId}
              >
                {detail.label}
                :
                {' '}
                {detail.previousBillingMonth ?? (detail.previousAmount === null ? '미설정' : `${formatInteger(detail.previousAmount)}원`)}
                {' '}
                →
                {' '}
                {detail.newBillingMonth ?? (detail.newAmount === null ? '미설정' : `${formatInteger(detail.newAmount)}원`)}
                {detail.generatedMonths?.length ? ` · 추가 부과: ${detail.generatedMonths.join(', ')}` : ''}
              </p>
            ))}
            <p>
              사유:
              {' '}
              {change.reason}
            </p>
          </li>
        ))}
      </ul>
    </ListCard>
  );
}
