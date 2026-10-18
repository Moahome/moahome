'use client';

import {
  useEffect,
  useRef
} from 'react';
import { Button } from '@/shared/ui/button';
import { useRouter } from 'next/navigation';
import { formatWon } from '@/shared/lib/format';
import {
  ServiceIcon,
  type ServiceIconName
} from '@/shared/ui/service-icon';
import type { RegistrationResult } from '../../../api/registrationApi';
import type { RegistrationDraft } from '../../../model/registrationDraft';
import styles from './registrationComplete.module.css';

/** 성공한 결과로만 완료를 표시하고 계좌·예금주 원문은 현재 메모리에서만 읽습니다. */
export function RegistrationComplete({
  result,
  draft,
  showDetails,
  onReview,
  onDashboard,
}: {
  result: RegistrationResult;
  draft: RegistrationDraft;
  showDetails: boolean;
  onReview: () => void;
  onDashboard: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  const hasDraft = showDetails && draft.basicInfoValidated && draft.units.length > 0;
  const primary = draft.bankAccounts.find((account) => account.isPrimary) ?? draft.bankAccounts[0];
  const information: { label: string; value: string; icon: ServiceIconName }[] = [
    {
      label: '관리할 곳',
      value: result.property.name,
      icon: 'building'
    },
    {
      label: '주소',
      value: hasDraft ? [draft.basicInfo.address, draft.basicInfo.addressDetail].filter(Boolean).join(' ') : '주소 등록 완료',
      icon: 'location'
    },
    {
      label: '동·세대',
      value: `${result.property.hasBuildings ? `${result.summary.buildingCount}개 동` : '동 없음'} · 총 ${result.summary.unitCount}세대`,
      icon: 'users'
    },
    {
      label: '관리계좌',
      value: hasDraft ? `${draft.bankAccounts.length}개 통장 · 기본 ${primary.bankName} ${primary.accountNumber}` : `관리계좌 ${result.summary.bankAccountCount}개 등록 완료`,
      icon: 'bank'
    },
    {
      label: '예금주',
      value: hasDraft ? primary.holderName : '예금주 등록 완료',
      icon: 'person'
    },
    {
      label: '세대당 월 기본 관리비',
      value: formatWon(result.summary.monthlyDefaultAmount),
      icon: 'coins'
    }
  ];

  useEffect(() => {
    headingRef.current?.focus({
      preventScroll: true
    });
    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
  }, []);

  return (
    <main
      className={styles.page}
      aria-labelledby={'registration-complete-title'}
    >
      <div
        className={styles.card}
      >
        <header
          className={styles.intro}
        >
          <span
            className={styles['success-icon']}
            aria-hidden={'true'}
          >
            <ServiceIcon
              name={'check'}
            />
          </span>
          <h1
            ref={headingRef}
            id={'registration-complete-title'}
            tabIndex={-1}
          >
            관리할 곳이 등록되었습니다!
          </h1>
          <p>
            {result.property.name}
            의 관리 환경이 성공적으로 생성되었습니다.
            <br />
            이제 관리 업무를 시작해 보세요.
          </p>
        </header>
        <section
          className={styles.section}
          aria-labelledby={'registered-information-title'}
        >
          <h2
            id={'registered-information-title'}
          >
            등록된 정보
          </h2>
          <dl
            className={styles.information}
          >
            {information.map((item) => (
              <div
                key={item.label}
                className={styles['information-card']}
                data-icon={item.icon}
              >
                <span
                  className={styles.icon}
                  aria-hidden={'true'}
                >
                  <ServiceIcon
                    name={item.icon}
                  />
                </span>
                <div>
                  <dt>
                    {item.label}
                  </dt>
                  <dd>
                    {item.value}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </section>
        <section
          className={styles.section}
          aria-labelledby={'completed-items-title'}
        >
          <h2
            id={'completed-items-title'}
          >
            등록 완료 항목
          </h2>
          <ul
            className={styles['completed-items']}
          >
            {['관리할 곳 등록 완료', '동·세대 설정 완료', '관리계좌 및 기본 관리비 설정 완료'].map((item) => (
              <li
                key={item}
              >
                <span
                  aria-hidden={'true'}
                >
                  <ServiceIcon
                    name={'check'}
                  />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </section>
        <aside
          className={styles.notice}
        >
          <ServiceIcon
            name={'info'}
          />
          <p>
            {result.managementStart ? `잔액 인계와 관리 시작이 완료되었습니다. 첫 관리비 부과월은 ${result.managementStart.firstBillingMonth}입니다.` : '기본 정보가 저장되었습니다. 기존 잔액 인계에서 기준일과 첫 부과월을 확인한 뒤 관리 시작을 확정해주세요.'}
          </p>
        </aside>
        <div
          className={styles.actions}
        >
          <Button
            size={'lg'}
            onClick={() => router.push(`/manage/${result.property.id}/billing/monthly?tab=${result.managementStart ? 'monthly' : 'opening'}`)}
          >
            {result.managementStart ? '관리비 부과 보기' : '기존 잔액 인계 · 관리 시작 설정'}
          </Button>
          <Button
            variant={'outline'}
            size={'lg'}
            onClick={onReview}
          >
            등록 정보 다시 보기
          </Button>
          <Button
            size={'lg'}
            onClick={onDashboard}
          >
            관리자 대시보드로 이동
          </Button>
        </div>
        <p
          className={styles.footer}
        >
          계속하지 않더라도 등록된 정보는 안전하게 저장됩니다.
        </p>
      </div>
    </main>
  );
}
