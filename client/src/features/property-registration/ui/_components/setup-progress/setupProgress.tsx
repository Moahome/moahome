'use client';

import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './setupProgress.module.css';

const REGISTRATION_STEPS = ['기본 정보', '동·세대 및 담당자', '관리계좌 및 잔고', '관리비 설정', '최종 확인'];

function getStepState(step: number, currentStep: number) {
  if (step < currentStep) return 'complete';
  if (step === currentStep) return 'current';

  return 'pending';
}

/** PC 단계 목록과 모바일 진행률이 같은 현재 단계를 표시하며 마지막 단계도 저장 전 확인으로 유지합니다. */
export function SetupProgress({
  currentStep,
  complete = false,
  mobileCountInHeader = false,
}: {
  currentStep: number;
  complete?: boolean;
  mobileCountInHeader?: boolean;
}) {
  const steps = REGISTRATION_STEPS;
  const displayedStep = currentStep;

  return (
    <nav
      className={styles.progress}
      aria-label={'초기 설정 진행 단계'}
    >
      <ol>
        {steps.map((label, index) => (
          <li
            key={label}
            data-step={complete ? 'complete' : getStepState(index + 1, displayedStep)}
            aria-current={index + 1 === displayedStep ? 'step' : undefined}
          >
            <span
              className={styles['step-number']}
              aria-hidden={'true'}
            >
              {complete || index + 1 < displayedStep ? (
                <ServiceIcon
                  name={'check'}
                />
              ) : index + 1}
            </span>
            <span>
              {complete && index === steps.length - 1 ? '완료' : label}
            </span>
          </li>
        ))}
      </ol>
      <div
        className={styles['mobile-progress']}
        data-count-in-header={mobileCountInHeader}
        aria-label={`${steps.length}단계 중 ${displayedStep}단계: ${steps[displayedStep - 1]}`}
      >
        <span>
          <strong>
            {displayedStep}
          </strong>
          {` / ${steps.length}`}
        </span>
        <div
          className={styles['progress-track']}
          aria-hidden={'true'}
        >
          <span
            style={{
              width: `${displayedStep / steps.length * 100}%`
            }}
          />
        </div>
      </div>
    </nav>
  );
}
