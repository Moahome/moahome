'use client';

import { useBankingWorkspace } from '../../_hooks/useBankingWorkspace';
import { Button } from '@/shared/ui/button';
import { FileDropzone } from '@/shared/ui/file-dropzone';
import { Dropdown } from '@/shared/ui/form-controls';
import { ListHeader } from '@/shared/ui/list-header';
import { getDateRangeQuery } from '@/shared/lib/date-range';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './bankingControls.module.css';
type Props = ReturnType<typeof useBankingWorkspace>['controls'];
/** BankingControls에 필요한 표시와 공통 UI를 조합합니다. */
export function BankingControls({
  propertyId,
  view,
  renderManualRegistration,
  router,
  searchParams,
  setAccountId,
  setDirection,
  setStatus,
  setPage,
  preview,
  file,
  replacingFile,
  setReplacingFile,
  setSelection,
  setManualOpen,
  setManualExpenseOpen,
  busy,
  review,
  accountId,
  readFile,
  currentMonth,
  accounts,
  activeAccountId,
  importAccount,
  importSupport,
  canImport,
  importMessage,
  accountLabel,
  baseRows,
  downloadExpenses,
  resetUpload,
  title,
  description
}:Props) {
  return (<>
    <ListHeader
      className={styles.header}
      actionsClassName={view === 'upload' ? styles['upload-actions'] : styles['header-actions']}
      menu={'통장 관리'}
      title={title}
      titleId={'banking-title'}
      description={description}
      actions={(
        <>
          {view === 'expenses' && (
            <Button
              variant={'outline'}
              tone={'excel'}
              disabled={!baseRows.length}
              onClick={() => {
                void downloadExpenses();
              }}
              leadingIcon={(
                <ServiceIcon
                  name={'excel'}
                />
              )}
            >
              엑셀 다운로드
            </Button>
          )}
          {view === 'transactions' && renderManualRegistration && (
            <Button
              disabled={busy}
              onClick={() => {
                if (window.matchMedia('(max-width: 767px)').matches) {
                  const query = getDateRangeQuery(searchParams, currentMonth);
                  if (accountId !== 'ALL')
                    query.set('account', accountId);
                  router.push(`/manage/${propertyId}/banking/manual?${query}`);

                  return;
                }
                setManualOpen(true);
              }}
              leadingIcon={(
                <ServiceIcon
                  name={'plus'}
                />
              )}
            >
              수동 입금 등록
            </Button>
          )}
          {view === 'transactions' && (
            <Button
              disabled={busy}
              onClick={() => {
                if (window.matchMedia('(max-width: 767px)').matches) {
                  const query = getDateRangeQuery(searchParams, currentMonth);
                  if (accountId !== 'ALL')
                    query.set('account', accountId);
                  router.push(`/manage/${propertyId}/banking/manual-expense?${query}`);

                  return;
                }
                setManualExpenseOpen(true);
              }}
              leadingIcon={(
                <ServiceIcon
                  name={'plus'}
                />
              )}
            >
              수동 지출 등록
            </Button>
          )}
          {view === 'transactions' && (
            <Button
              variant={'outline'}
              tone={'excel'}
              leadingIcon={(
                <ServiceIcon
                  name={'excel'}
                />
              )}
              disabled={busy || (accountId !== 'ALL' && !canImport)}
              onClick={() => {
                const query = getDateRangeQuery(searchParams, currentMonth);
                if (accountId !== 'ALL')
                  query.set('account', accountId);
                router.push(`/manage/${propertyId}/banking/upload?${query}`);
              }}
            >
              엑셀 업로드
            </Button>
          )}
          {view === 'upload' && (
            <Button
              variant={'outline'}
              disabled={busy}
              onClick={() => router.push(`/manage/${propertyId}/banking/transactions`)}
            >
              목록
            </Button>
          )}
        </>
      )}
    />
    {review === 'duplicates' && (
      <div
        role={'status'}
      >
        중복 의심 수동 거래만 표시하고 있어요. 거래 상세에서 은행 원본과 비교해주세요.
        <Button
          variant={'text'}
          size={'sm'}
          onClick={() => {
            const next = new URLSearchParams(searchParams.toString());
            next.delete('review');
            next.delete('direction');
            next.delete('status');
            setDirection('ALL');
            setStatus('ALL');
            setPage(1);
            router.replace(`/manage/${propertyId}/banking/transactions${next.size ? `?${next}` : ''}`, {
              scroll: false
            });
          }}
        >
          전체 거래
        </Button>
      </div>
    )}
    {view === 'transactions' && accountId !== 'ALL' && !canImport && (
      <p
        role={'status'}
      >
        {`${importAccount?.bankName ?? '선택 통장'}: ${importMessage}`}
      </p>
    )}
    {view === 'upload' && (
      <div
        className={styles['account-filter']}
      >
        <Dropdown
          label={'가져올 통장'}
          aria-label={'가져올 통장'}
          value={activeAccountId ?? ''}
          disabled={busy}
          options={accounts.filter((a) => a.status === 'ACTIVE').map((a) => ({
            value: a.id,
            label: accountLabel(a.id)
          }))}
          onChange={(value) => {
            setAccountId(value);
            setSelection(null);
            setPage(1);
            resetUpload();
          }}
        />
      </div>
    )}
    {view === 'upload' && (!preview || replacingFile) && (
      <FileDropzone
        label={'통장 거래 파일 업로드'}
        inputLabel={'통장 거래 파일 선택'}
        accept={importSupport?.extensions.join(',') ?? ''}
        description={canImport ? `${importAccount?.bankName} 거래내역만 업로드해주세요. ${importMessage} · 최대 5MB·5,000행` : `${importAccount?.bankName ?? '선택 통장'}: ${importMessage}`}
        busy={busy}
        disabled={!canImport}
        onFile={(next) => {
          void readFile(next);
        }}
      />
    )}
    {preview && (
      <div
        className={styles['upload-info']}
      >
        <div
          className={styles['file-info']}
        >
          <span
            className={styles['file-icon']}
          >
            <ServiceIcon
              name={'excel'}
            />
          </span>
          <div>
            <strong>
              {file?.name}
            </strong>
            {preview.period && (
              <p>
                {`거래 기간 ${preview.period.from} ~ ${preview.period.to}`}
              </p>
            )}
            <p>
              {`미리보기 ${preview.rows.length}건 · 중복 제외 ${preview.duplicateCount}건 · 인계 이전 제외 ${preview.beforeCutoffCount}건`}
            </p>
          </div>
        </div>
        <Button
          variant={'outline'}
          tone={'excel'}
          leadingIcon={(
            <ServiceIcon
              name={'excel'}
            />
          )}
          disabled={busy}
          onClick={() => setReplacingFile((current) => !current)}
        >
          {replacingFile ? '파일 선택 닫기' : '다른 파일 선택'}
        </Button>
      </div>
    )}
  </>);
}
