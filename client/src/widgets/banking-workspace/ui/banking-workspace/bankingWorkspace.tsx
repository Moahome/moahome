'use client';

import { BankingControls } from './_components/banking-controls/bankingControls';
import { BankingTransactionDialogs } from './_components/banking-transaction-dialogs/bankingTransactionDialogs';
import { LoadingState } from '@/shared/ui/state-message';
import { RequestError } from '@/shared/ui/server-connection-error';
import { useBankingWorkspaceQuery } from './_hooks/useBankingWorkspaceQuery';
import { BankingTransactionResults } from './_components/banking-transaction-results/bankingTransactionResults';
import { BankingImportSettings } from './_components/banking-import-settings/bankingImportSettings';
import { useBankingWorkspace } from './_hooks/useBankingWorkspace';

import { Toast } from '@/shared/ui/toast';
import { BankImportActions } from '../_components/bank-import-actions/bankImportActions';
import styles from './bankingWorkspace.module.css';

/** 필터·페이지를 바꿔도 파일 전체의 선택·분류 초안을 유지하고 실제 저장은 서버 원본 재검증으로 처리합니다. */
export function BankingWorkspace(props: Parameters<typeof useBankingWorkspace>[0]) {
  const loadedQuery = useBankingWorkspaceQuery(props.propertyId);
  if (loadedQuery.isPending)
    return (
      <LoadingState
        title={'통장 정보를 불러오고 있어요.'}
      />
    );
  if (!loadedQuery.data)
    return (
      <RequestError
        error={loadedQuery.error}
        onRetry={() => void loadedQuery.refetch({
          cancelRefetch: false
        })}
      />
    );

  return (
    <BankingWorkspaceContent
      {...props}
      loadedQuery={loadedQuery}
    />
  );
}

function BankingWorkspaceContent({
  loadedQuery,
  ...props
}: Parameters<typeof useBankingWorkspace>[0] & { loadedQuery: ReturnType<typeof useBankingWorkspaceQuery> }) {
  const {
    controls,
    results,
    importSettings,
    dialogs,
    preview,
    selected,
    selectedIncome,
    busy,
    commit,
    notice,
    closeNotice
  } = useBankingWorkspace(props, loadedQuery);

  return (
    <section
      className={styles.page}
      aria-labelledby={'banking-title'}
    >
      <BankingControls
        {...controls}
      />

      <BankingTransactionResults
        {...results}
      />
      <BankingImportSettings
        {...importSettings}
      />
      <BankingTransactionDialogs
        {...dialogs}
      />

      {preview && (
        <BankImportActions
          selectedCount={selected.length}
          incomeCount={selectedIncome}
          busy={busy}
          onSave={() => {
            void commit();
          }}
        />
      )}

      {notice && (
        <Toast
          key={notice.id}
          message={notice.message}
          tone={notice.tone === 'error' ? 'error' : undefined}
          onClose={closeNotice}
        />
      )}
    </section>
  );

}
