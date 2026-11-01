import Link from 'next/link';
import {
  ServiceIcon,
  type ServiceIconName
} from '@/shared/ui/service-icon';
import type { DashboardSnapshot } from '../../../api/dashboardApiTypes';
import { DashboardPanel } from '../dashboard-panel/dashboardPanel';
import styles from './dashboardTasks.module.css';

/** 중복될 수 있는 업무를 총합으로 더하지 않고 현재 처리할 항목별 건수를 제공합니다. */
export function DashboardTasks({ tasks, base, businessDate }: {
  tasks: DashboardSnapshot['tasks'];
  base: string;
  businessDate: string;
}) {
  const items: { title: string; description: string; count: number; icon: ServiceIconName; tone: string; path: string }[] = [
    {
      title: '확인 필요 입금',
      description: '아직 입금 용도가 확인되지 않은 거래',
      count: tasks.income,
      icon: 'alert',
      tone: 'danger',
      path: 'banking/transactions?review=income&direction=INCOME&status=PENDING'
    },
    {
      title: '가입·정보 수정 요청',
      description: `가입 ${tasks.joinRequests}건 · 초대 정보 수정 ${tasks.invitationChanges}건`,
      count: tasks.joinRequests + tasks.invitationChanges,
      icon: 'users',
      tone: 'primary',
      path: `invitations${!tasks.joinRequests && tasks.invitationChanges ? '?tab=invited' : ''}`
    },
    {
      title: '미분류 출금',
      description: '확인 필요 상태의 출금을 분류해주세요.',
      count: tasks.expenses,
      icon: 'card',
      tone: 'warning',
      path: 'banking/transactions?review=expenses&direction=EXPENSE&status=PENDING'
    },
    {
      title: '외부 부담금 미회수',
      description: '현재까지 정산 대상에 남아 있는 내역',
      count: tasks.external,
      icon: 'coins',
      tone: 'teal',
      path: `banking/balances?month=${businessDate.slice(0, 7)}&externalStatus=UNRECOVERED#external-settlements`
    },
    {
      title: '중복 의심 거래',
      description: '은행 원본과 수동 등록을 비교해주세요.',
      count: tasks.duplicates,
      icon: 'document',
      tone: 'neutral',
      path: 'banking/transactions?review=duplicates'
    }
  ];

  return (
    <DashboardPanel
      title={'현재 처리할 업무'}
      note={'현재 기준'}
    >
      <ul
        className={styles.tasks}
      >
        {items.map((item) => {
          const content = (
            <>
              <span
                className={styles.icon}
              >
                <ServiceIcon
                  name={item.icon}
                />
              </span>
              <span
                className={styles.copy}
              >
                <strong>
                  {item.title}
                </strong>
                <small>
                  {item.description}
                </small>
              </span>
              <strong
                className={styles.count}
              >
                {item.count}
                건
              </strong>
              <ServiceIcon
                name={'chevron'}
                size={16}
              />
            </>
          );

          return (
            <li
              key={item.title}
            >
              <Link
                className={styles.row}
                href={`${base}/${item.path}`}
                data-tone={item.tone}
                data-active={item.count > 0}
                aria-label={`${item.title} ${item.count}건`}
              >
                {content}
              </Link>
            </li>
          );
        })}
      </ul>
    </DashboardPanel>
  );
}
