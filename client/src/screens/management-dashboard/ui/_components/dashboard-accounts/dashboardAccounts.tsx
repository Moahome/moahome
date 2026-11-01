import { BankIcon } from '@/entities/banking';
import { formatWon } from '@/shared/lib/format';
import { ServiceIcon } from '@/shared/ui/service-icon';
import type { DashboardReport } from '../../../model/dashboardTypes';
import { DashboardPanel } from '../dashboard-panel/dashboardPanel';
import styles from './dashboardAccounts.module.css';

const SOURCES: Record<string, string> = {
  DIRECT_CHECK: '직접 확인',
  BANK_TRANSACTION: '은행 거래',
  BANK_IMPORT: '은행 거래',
  OPENING: '시작 잔액',
  ACCOUNT_OPENING: '시작 잔액',
  HANDOVER: '잔액 인계'
};

/** 실제 확인 잔액과 그 시점을 표시하며 누락된 통장 금액을 0원으로 합산하지 않습니다. */
export function DashboardAccounts({ report, href, onOpen }: {
  report: DashboardReport;
  href: string;
  onOpen: (id: string) => void;
}) {
  return (
    <DashboardPanel
      title={'통장별 확인 잔액'}
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
                <small>
                  {account.bankName}
                  {' '}
                  ····
                  {account.last4}
                </small>
              </span>
              <span
                className={styles.balance}
              >
                <strong>
                  {account.balance === null ? '확인 필요' : formatWon(account.balance)}
                </strong>
                <small>
                  {account.balance === null ? '은행 확인 자료가 필요해요.' : `${account.confirmationDate} ${account.confirmationTime?.slice(0, 5) ?? ''} · ${SOURCES[account.source ?? ''] ?? '확인 잔액'}`}
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
            전체 통장 잔액 (참고)
          </strong>
          <strong>
            {report.referenceTotal === null ? '확인 필요' : formatWon(report.referenceTotal)}
          </strong>
        </div>
        <p>
          각 통장의 확인 시점이 달라 단순 합산은 참고용입니다.
        </p>
      </div>
    </DashboardPanel>
  );
}
