import { RegistrationIcon } from '../registration-icon/registrationIcon';
import styles from './setupProgress.module.css';

const REGISTRATION_STEPS = ['기본 정보', '동·세대', '관리계좌', '관리비 항목', '등록 정보 확인'];

function getStepState(step: number, currentStep: number) {
  if (step < currentStep) return 'complete';
  if (step === currentStep) return 'current';

  return 'pending';
}

/** PC 단계 목록과 모바일 진행률이 같은 현재 단계를 표시하며 마지막 단계도 저장 전 확인으로 유지합니다. */
export function SetupProgress({
  currentStep,
}: {
  currentStep: number;
}) {
  return (
    <nav
      className={styles.progress}
      aria-label={'초기 설정 진행 단계'}
    >
      <ol>
        {REGISTRATION_STEPS.map((label, index) => (
          <li
            key={label}
            data-step={getStepState(index + 1, currentStep)}
            aria-current={index + 1 === currentStep ? 'step' : undefined}
          >
            <span
              className={styles['step-number']}
              aria-hidden={'true'}
            >
              {index + 1 < currentStep ? (
                <RegistrationIcon
                  name={'check'}
                />
              ) : index + 1}
            </span>
            <span>
              {label}
            </span>
          </li>
        ))}
      </ol>
      <div
        className={styles['mobile-progress']}
        aria-label={`5단계 중 ${currentStep}단계: ${REGISTRATION_STEPS[currentStep - 1]}`}
      >
        <span>
          <strong>
            {currentStep}
          </strong>
          {' / 5'}
        </span>
        <div
          className={styles['progress-track']}
          aria-hidden={'true'}
        >
          <span
            style={{
              width: `${currentStep * 20}%`
            }}
          />
        </div>
      </div>
    </nav>
  );
}
