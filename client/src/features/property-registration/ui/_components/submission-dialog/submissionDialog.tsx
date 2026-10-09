'use client';

import {
  useEffect,
  useRef
} from 'react';
import { Button } from '@/shared/ui/button';
import type { SubmissionStatus } from '../registration-review/registrationReview';
import { RegistrationIcon } from '../registration-icon/registrationIcon';
import styles from './submissionDialog.module.css';

/** 저장 결과를 확인할 수 없을 때와 등록 내역이 없을 때의 복구 행동을 구분합니다. */
export function SubmissionDialog({
  status,
  message,
  canRetry,
  canEdit,
  onCheck,
  onRetry,
  onEditRegistration,
  onDismissFailure,
  onDismiss,
}: {
  status: SubmissionStatus;
  message: string;
  canRetry: boolean;
  canEdit: boolean;
  onCheck: () => void;
  onRetry: () => void;
  onEditRegistration: () => void;
  onDismissFailure: (editInput: boolean) => void;
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const backdropPointerDown = useRef(false);
  const busy = status === 'submitting' || status === 'checking';
  const failed = status === 'failed';
  let title = '등록 결과를 확인하지 못했어요';
  let description = '등록이 완료되었을 수 있습니다. 결과를 먼저 확인해주세요.';
  if (canEdit) {
    title = '등록을 완료하지 못했어요';
    description = '아직 저장된 등록 정보가 없습니다. 다시 시도하거나 입력한 내용을 수정해주세요.';
  }
  if (status === 'submitting') {
    title = '관리 환경을 준비하고 있습니다';
    description = '등록 정보를 저장하고 기본 설정을 생성하는 중입니다. 잠시만 기다려주세요.';
  }
  if (status === 'checking') {
    title = '등록 결과를 확인하고 있습니다';
    description = '이미 저장되었는지 확인하고 있습니다. 잠시만 기다려주세요.';
  }
  if (failed) {
    title = '등록에 실패했습니다';
    description = '입력한 정보에 확인이 필요해 저장하지 못했습니다. 정보를 수정한 뒤 다시 시도해주세요.';
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';

    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [status]);

  /** 모달 닫기와 등록 취소를 구분해 미확인 요청은 그대로 두고 확인 화면으로 돌아갑니다. */
  function dismiss() {
    if (busy) return;
    if (failed) {
      onDismissFailure(false);
      return;
    }
    onDismiss();
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={'submission-dialog-title'}
      aria-describedby={'submission-dialog-description'}
      data-state={failed ? 'failed' : 'unknown'}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onPointerDown={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        // 내용에서 시작한 드래그가 배경에서 끝나도 닫히지 않게 누른 위치를 함께 확인합니다.
        backdropPointerDown.current = event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && backdropPointerDown.current) dismiss();
      }}
    >
      {!busy && (
        <Button
          variant={'ghost'}
          size={'sm'}
          iconOnly
          className={styles['close-button']}
          aria-label={'등록 안내 닫기'}
          onClick={dismiss}
          leadingIcon={(
            <RegistrationIcon
              name={'close'}
            />
          )}
        />
      )}
      {busy ? (
        <span
          className={styles.spinner}
          aria-hidden={'true'}
        />
      ) : (
        <span
          className={styles['status-icon']}
          aria-hidden={'true'}
        >
          <RegistrationIcon
            name={'alert'}
          />
        </span>
      )}
      <h2
        ref={headingRef}
        id={'submission-dialog-title'}
        tabIndex={-1}
        aria-live={'polite'}
      >
        {title}
      </h2>
      <p
        id={'submission-dialog-description'}
        className={styles.description}
      >
        {description}
      </p>
      {busy && (
        <>
          <ul
            className={styles['save-items']}
            aria-label={'등록할 정보'}
          >
            {['관리대상', '동·세대', '관리계좌 및 기본 관리비'].map((item) => (
              <li
                key={item}
              >
                <RegistrationIcon
                  name={'receipt'}
                />
                {item}
              </li>
            ))}
          </ul>
          <p
            className={styles.hint}
          >
            확인이 끝날 때까지 이 화면을 유지해주세요.
          </p>
        </>
      )}
      {!busy && (
        <>
          <div
            className={styles.reason}
            role={'alert'}
          >
            <RegistrationIcon
              name={'alert'}
            />
            <div>
              <strong>
                {failed ? '실패 사유' : '확인 안내'}
              </strong>
              <p>
                {message}
              </p>
            </div>
          </div>
          <div
            className={styles.actions}
          >
            {failed ? (
              <>
                <Button
                  variant={'outline'}
                  onClick={() => onDismissFailure(false)}
                >
                  등록 정보로 돌아가기
                </Button>
                <Button
                  onClick={() => onDismissFailure(true)}
                >
                  입력 수정하기
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant={canRetry ? 'outline' : 'primary'}
                  onClick={onCheck}
                >
                  등록 결과 확인
                </Button>
                {canRetry && (
                  <Button
                    onClick={onRetry}
                  >
                    같은 정보로 다시 시도
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant={'outline'}
                    onClick={onEditRegistration}
                  >
                    입력 수정하기
                  </Button>
                )}
              </>
            )}
          </div>
          <p
            className={styles.footer}
          >
            {failed ? '입력한 정보는 유지되어 있습니다.' : '창을 닫아도 저장 요청은 취소되지 않습니다. 결과는 다시 확인할 수 있어요.'}
          </p>
        </>
      )}
    </dialog>
  );
}
