'use client';

import { useId } from 'react';
import styles from './phoneConsent.module.css';

/** 본인의 동의와 관리자의 사전 동의 확인을 구분하며 동의가 필요한 입력의 명시적 선택을 전달합니다. */
export function PhoneConsent({ checked, onChange, self = false, disabled = false, error }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  self?: boolean;
  disabled?: boolean;
  error?: string;
}) {
  const id = useId();
  return (
    <div
      className={styles.consent}
    >
      <label>
        <input
          type={'checkbox'}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span>
          {self ? '[선택] 전화번호 수집·이용에 동의합니다.' : '주민의 전화번호 수집·이용 동의를 받았습니다.'}
        </span>
      </label>
      {error && (
        <p
          id={`${id}-error`}
          className={styles.error}
          role={'alert'}
        >
          {error}
        </p>
      )}
    </div>
  );
}
