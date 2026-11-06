import { BankIcon } from '@/entities/banking';
import { formatWon } from '@/shared/lib/format';
import { ServiceIcon } from '@/shared/ui/service-icon';
import type { DashboardReport } from '../../../model/dashboardTypes';
import { DashboardPanel } from '../dashboard-panel/dashboardPanel';
import styles from './dashboardAccounts.module.css';

/** 상세와 같은 장부 우선 잔액을 표시하며 누락된 통장 금액을 0원으로 합산하지 않습니다. */
export function DashboardAccounts({ report, href, onOpen }: {
  report: DashboardReport;
  href: string;
  onOpen: (id: string) => void;
}) {
  return (
    <DashboardPanel
      title={'통장별 잔액'}
      href={href}
      linkLabel={'잔고·정산'}
    >
      <ul
        className={styles.accounts}
      >
        {report.accounts.map((account) => (
          <li
            key={account.id}
          >
            <button
              type={'button'}
              onClick={() => onOpen(account.id)}
              aria-label={`${account.label} 통장 상세`}
            >
              <span
                className={styles.icon}
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
              </span>
              <span
                className={styles.identity}
              >
                <strong>
                  {account.label}
                </strong>
              </span>
              <span
                className={styles.balance}
              >
                <strong>
                  {account.balance === null ? '확인 필요' : formatWon(account.balance)}
                </strong>
                <small>
                  {account.balance === null ? '잔액 자료가 필요해요.' : `${account.balanceDate} · 장부 계산`}
                </small>
              </span>
              <ServiceIcon
                name={'chevron'}
                size={16}
              />
            </button>
          </li>
        ))}
      </ul>
      {!report.accounts.length && (
        <p
          className={styles.empty}
        >
          선택한 월에 조회할 통장이 없어요.
        </p>
      )}
      <div
        className={styles.total}
      >
        <div>
          <strong>
            전체 통장 잔액
          </strong>
          <strong>
            {report.accountTotal === null ? '확인 필요' : formatWon(report.accountTotal)}
          </strong>
        </div>

      </div>
    </DashboardPanel>
  );
}
