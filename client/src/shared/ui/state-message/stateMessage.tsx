'use client';

import Image from 'next/image';
import {
  useId,
  type ReactNode
} from 'react';
import styles from './stateMessage.module.css';

const STATE_MESSAGES = {
  'coming-soon': {
    image: '/images/states/comingSoon.webp',
    title: '새로운 기능을 준비하고 있어요!',
  },
  maintenance: {
    image: '/images/states/maintenance.webp',
    title: '더 안정적인 서비스를 위해 점검하고 있어요.',
  },
  'empty-data': {
    image: '/images/states/emptyData.webp',
    title: '아직 등록된 내역이 없어요.',
  },
  'no-results': {
    image: '/images/states/noResults.webp',
    title: '조건에 맞는 검색 결과가 없어요.',
  },
  'server-error': {
    image: '/images/errors/serverError.webp',
    title: '서버에 연결하지 못했어요',
  },
  forbidden: {
    image: '/images/states/forbidden.webp',
    title: '이 페이지에 접근할 권한이 없어요.',
  },
  'not-found': {
    image: '/images/states/notFound.webp',
    title: '찾으시는 페이지가 없어요.',
  },
  'approval-pending': {
    image: '/images/states/approvalPending.webp',
    title: '가입 신청이 완료되었어요. 관리자의 승인을 기다리고 있어요.',
  },
  success: {
    image: '/images/states/success.webp',
    title: '정상적으로 처리되었어요!',
  },
  'login-required': {
    image: '/images/states/loginRequired.webp',
    title: '로그인이 필요한 서비스예요.',
  },
  'network-error': {
    image: '/images/states/networkError.webp',
    title: '연결이 원활하지 않아요.',
  },
  'empty-notice': {
    image: '/images/states/emptyNotice.webp',
    title: '아직 등록된 공지사항이 없어요.',
  },
  'file-upload': {
    image: '/images/states/fileUpload.webp',
    title: '파일을 업로드하여 시작해 보세요.',
  },
  'review-required': {
    image: '/images/states/reviewRequired.webp',
    title: '확인이 필요한 항목이 있어요.',
  },
  loading: {
    image: '/images/states/loading.webp',
    title: '정보를 불러오고 있어요.',
  },
} as const;

/** 그림만 필요한 기존 완료·업로드·검토 UI도 동일한 상태 자산과 크기를 재사용합니다. */
export function StateIllustration({ variant, layout = 'page' }: {
  variant: keyof typeof STATE_MESSAGES;
  layout?: 'page' | 'inline';
}) {
  const landscape = variant === 'server-error' || variant === 'loading';

  return (
    <Image
      className={styles.illustration}
      data-state={variant}
      data-layout={layout}
      src={STATE_MESSAGES[variant].image}
      alt={''}
      width={landscape ? 1536 : 768}
      height={landscape ? 1024 : 768}
      sizes={layout === 'inline' ? '200px' : '(max-width: 600px) 80vw, 420px'}
      loading={'eager'}
    />
  );
}

/** 상태 판단은 호출부에 두고 페이지·목록의 그림과 안내를 같은 표현으로 제공합니다. */
export function StateMessage({
  variant,
  title,
  description,
  actions,
  layout = 'page',
  role = 'status',
  busy = false,
}: {
  variant?: keyof typeof STATE_MESSAGES;
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  layout?: 'page' | 'inline';
  role?: 'alert' | 'status';
  busy?: boolean;
}) {
  const titleId = useId();
  const state = variant ? STATE_MESSAGES[variant] : undefined;

  return (
    <section
      className={styles.message}
      data-layout={layout}
      data-state={variant}
      role={role}
      aria-labelledby={titleId}
      aria-busy={busy}
    >
      {variant && (
        <StateIllustration
          variant={variant}
          layout={layout}
        />
      )}
      <h2
        id={titleId}
      >
        {title ?? state?.title ?? '정보를 불러오지 못했어요'}
      </h2>
      {description && (
        <div
          className={styles.description}
        >
          {description}
        </div>
      )}
      {actions && (
        <div
          className={styles.actions}
        >
          {actions}
        </div>
      )}
    </section>
  );
}
