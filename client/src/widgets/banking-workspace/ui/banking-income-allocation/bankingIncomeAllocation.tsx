'use client';

import {
  AllocationEditor,
  IncomeAllocationSummary
} from '@/entities/banking';
import { Button } from '@/shared/ui/button';
import { Toast } from '@/shared/ui/toast';
import styles from './bankingIncomeAllocation.module.css';

import { useBankingIncomeAllocation } from './_hooks/useBankingIncomeAllocation';

/** 배분 입력과 저장된 배분 결과를 표시하고 상태·저장은 전용 훅에 위임합니다. */
export function BankingIncomeAllocation(props: { propertyId: string;
paymentId: string;
onBusyChange?: (busy: boolean) => void }) {
  const {
    row,
    allocation,
    draft,
    buildings,
    busy,
    error,
    notice,
    setEdited,
    save,
    closeNotice
  } = useBankingIncomeAllocation(props);

  if (!row || !draft || row.receiptType !== 'OTHER' || row.status !== 'CONFIRMED')
    return null;

  return (
    <section
      className={styles.section}
      aria-label={'기타 입금 동별 배분'}
    >
      {allocation ? (
        <IncomeAllocationSummary
          total={row.amount}
          allocations={allocation.allocations}
        />
      ) : (
        <>
          <h3>
            동별 입금 배분
          </h3>
          <p>
            공동 입금을 관리 동과 외부 동의 몫으로 나눕니다. 관리 동 몫은 동별 잔고에, 외부 몫은 외부 보관금에 반영합니다.
          </p>
          <AllocationEditor
            purpose={'income'}
            showDetails={false}
            total={row.amount}
            draft={draft}
            buildings={buildings}
            disabled={busy}
            onChange={setEdited}
          />
          {error && (
            <p
              role={'alert'}
            >
              {error}
            </p>
          )}
          <div
            className={styles.actions}
          >
            <Button
              loading={busy}
              onClick={() => {
                void save();
              }}
            >
              입금 배분 확정
            </Button>
          </div>
        </>
      )}
      {notice && (
        <Toast
          message={'동별 입금 배분을 저장했어요.'}
          onClose={closeNotice}
        />
      )}
    </section>
  );
}
