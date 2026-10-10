'use client';

import { ServiceIcon } from '@/shared/ui/service-icon';
import { HomeIllustration } from '@/shared/ui/home-illustration';
import motion from '../../startMotion.module.css';
import styles from './startCard.module.css';

const START_OPTIONS = {
  create: {
    title: '관리할 곳 만들기',
    mobileTitle: '관리 시작하기',
    description: '빌라 또는 공동주택을 등록하고',
    continuation: '관리자로 시작합니다.',
    action: '관리 시작하기',
    mobileAction: '관리할 곳 만들기',
  },
  join: {
    title: '초대코드로 참여하기',
    mobileTitle: '초대로 참여하기',
    description: '관리자가 전달한 초대코드로',
    continuation: '우리 집에 참여합니다.',
    action: '초대코드 입력',
    mobileAction: '초대코드 입력',
  },
} as const;

/** 관리 시작과 초대 참여의 문구·일러스트를 구분하고 카드 구조는 공유합니다. */
export function StartCard({
  kind,
  onSelect,
}: {
  kind: keyof typeof START_OPTIONS;
  onSelect: () => void;
}) {
  const option = START_OPTIONS[kind];

  return (
    <section
      className={`${styles['start-card']} ${motion.reveal}`}
      data-kind={kind}
      aria-labelledby={`start-${kind}-title`}
    >
      <div
        className={styles['card-illustration']}
      >
        <HomeIllustration
          kind={kind}
        />
      </div>
      <div
        className={styles['card-copy']}
      >
        <h2
          id={`start-${kind}-title`}
        >
          <span
            className={styles['desktop-label']}
          >
            {option.title}
          </span>
          <span
            className={styles['mobile-label']}
          >
            {option.mobileTitle}
          </span>
        </h2>
        <p>
          {option.description}
          <br />
          {option.continuation}
        </p>
      </div>
      <button
        type={'button'}
        className={styles['start-action']}
        data-kind={kind}
        aria-label={option.title}
        onClick={onSelect}
      >
        <span
          className={styles['desktop-label']}
        >
          {option.action}
        </span>
        <span
          className={styles['mobile-label']}
        >
          {option.mobileAction}
        </span>
        <ServiceIcon
          name={'chevron'}
        />
      </button>
    </section>
  );
}
