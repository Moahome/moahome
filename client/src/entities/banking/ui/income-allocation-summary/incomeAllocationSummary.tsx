import { formatWon } from '@/shared/lib/format';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  sortExpenseLabels,
  type BankingAllocation
} from '../../model/allocation';
import styles from './incomeAllocationSummary.module.css';

/** 저장된 금액의 표시 비율만 소수 둘째 자리로 반올림하며 실제 배분 금액은 바꾸지 않습니다. */
function displayRatio(amount: bigint, total: bigint) {
  if (total <= BigInt(0)) return {
    value: 0,
    label: '—'
  };
  const rate = (amount * BigInt(20000) + total) / (total * BigInt(2));
  return {
    value: Number(rate),
    label: `${(Number(rate) / 100).toLocaleString('ko-KR', {
      maximumFractionDigits: 2
    })}%`
  };
}

/** 수동·은행 입금의 확정 배분을 같은 표로 보여주고 취소된 이력을 완료 상태로 안내하지 않습니다. */
export function IncomeAllocationSummary({ total, allocations, label = '저장된 동별 배분', active = true }: {
  total: string;
  allocations: readonly BankingAllocation[];
  label?: string;
  active?: boolean;
}) {
  const amount = BigInt(total);
  const sum = allocations.reduce((value, part) => value + BigInt(part.amount), BigInt(0));
  const complete = active && amount > BigInt(0) && sum === amount;
  const totalRatio = displayRatio(sum, amount);
  let status = '배분 금액 합계를 확인해주세요.';
  if (complete) status = '총 금액이 모두 배분되었습니다.';
  if (!active) status = '취소된 배분 내역입니다.';

  return (
    <section
      className={styles.summary}
      aria-label={label}
    >
      <header
        className={styles.header}
      >
        <h3>
          배분 내역
        </h3>
        <p
          className={styles.status}
          data-complete={complete}
        >
          <ServiceIcon
            name={complete ? 'check' : 'info'}
            size={18}
          />
          {status}
        </p>
      </header>
      <div
        className={styles['table-wrapper']}
      >
        <table
          aria-label={'동별 입금 배분표'}
        >
          <thead>
            <tr>
              <th
                scope={'col'}
              >
                동
              </th>
              <th
                scope={'col'}
              >
                배분 금액
              </th>
              <th
                scope={'col'}
              >
                배분 비율
              </th>
              <th
                scope={'col'}
                className={styles.note}
              >
                비고
              </th>
            </tr>
          </thead>
          <tbody>
            {sortExpenseLabels(allocations).map((part) => {
              const ratio = displayRatio(BigInt(part.amount), amount);
              return (
                <tr
                  key={part.buildingId ?? part.label}
                >
                  <th
                    scope={'row'}
                  >
                    {part.label}
                  </th>
                  <td
                    className={styles.amount}
                  >
                    {formatWon(part.amount)}
                  </td>
                  <td>
                    <div
                      className={styles.ratio}
                    >
                      <span>
                        {ratio.label}
                      </span>
                      <progress
                        max={10000}
                        value={ratio.value}
                        aria-label={`${part.label} 배분 비율 ${ratio.label}`}
                      />
                    </div>
                  </td>
                  <td
                    className={styles.note}
                  >
                    —
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th
                scope={'row'}
              >
                합계
              </th>
              <td
                className={styles.amount}
              >
                {formatWon(sum)}
              </td>
              <td>
                <div
                  className={styles.ratio}
                >
                  <span>
                    {totalRatio.label}
                  </span>
                  <progress
                    max={10000}
                    value={totalRatio.value}
                    aria-label={`총 배분 비율 ${totalRatio.label}`}
                  />
                </div>
              </td>
              <td
                className={styles.note}
              >
                —
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
