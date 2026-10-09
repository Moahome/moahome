'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/shared/api';
import {
  getRegistrationResult,
  submitRegistration,
  type RegistrationResult
} from '../../api/registrationApi';
import {
  clearPendingRegistration,
  createRegistrationRequest,
  discardRegistrationReceipt,
  getRegistrationInputError,
  restorePendingRegistration,
  restoreRegistrationReceipt,
  savePendingRegistration,
  saveRegistrationReceipt,
  type PendingRegistration
} from '../../model/registrationSubmission';
import {
  discardRegistrationDraft,
  type RegistrationDraft,
  type RegistrationStep
} from '../../model/registrationDraft';
import type { SubmissionStatus } from '../_components/registration-review/registrationReview';

/** 제출 시점의 본문과 ID를 고정하고 통신 장애 뒤에는 결과 조회가 끝날 때까지 새 등록을 막습니다. */
export function useRegistrationSubmission(userId: string, onInputError: (step: RegistrationStep, message: string) => void) {
  const router = useRouter();
  const [initial] = useState(() => ({
    pending: restorePendingRegistration(userId),
    result: restoreRegistrationReceipt(userId)
  }));
  const pendingRef = useRef<PendingRegistration | null>(initial.pending);
  const runningRef = useRef(false);
  const activeRef = useRef(true);
  const checkedRef = useRef(false);
  const [status, setStatus] = useState<SubmissionStatus>(initial.result ? 'complete' : initial.pending ? 'checking' : 'idle');
  const [result, setResult] = useState<RegistrationResult | null>(initial.result);
  const [message, setMessage] = useState('');
  const [canRetry, setCanRetry] = useState(false);

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);

  /** 성공 응답의 최소 결과만 보관하고 계좌가 포함된 초안과 제출 본문을 폐기합니다. */
  const finish = useCallback((response: RegistrationResult) => {
    if (!activeRef.current) return;
    saveRegistrationReceipt(userId, response);
    clearPendingRegistration(userId, response.requestId);
    discardRegistrationDraft();
    pendingRef.current = null;
    setResult(response);
    setStatus('complete');
    setMessage('');
    setCanRetry(false);
  }, [userId]);

  /** 404는 아직 성공 결과가 없다는 뜻이며 동일 본문 재시도만 허용하고 새 ID로 바꾸지 않습니다. */
  const lookup = useCallback(async (pending: PendingRegistration) => {
    setStatus('checking');
    setMessage('등록 결과를 확인하고 있어요.');
    setCanRetry(false);
    try {
      finish(await getRegistrationResult(pending.requestId));
    } catch (error) {
      if (!activeRef.current) return;
      const notFound = error instanceof ApiError && error.status === 404 && error.code === 'REGISTRATION_NOT_FOUND';
      setStatus('unknown');
      setCanRetry(notFound && pending.request !== null);
      setMessage(notFound ? '아직 저장 완료를 확인하지 못했어요. 등록 결과를 다시 확인해주세요.' : '등록 결과를 확인하지 못했어요. 연결이 복구되면 다시 확인해주세요.');
      if (error instanceof ApiError && (error.status === 401 || error.code === 'ACCOUNT_UNAVAILABLE')) router.replace('/login');
      if (error instanceof ApiError && error.code === 'ACCESS_DENIED') setMessage('이 관리대상에 접근할 권한이 없어요. 등록 결과를 표시할 수 없습니다.');
    }
  }, [finish, router]);

  const check = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || runningRef.current) return;
    runningRef.current = true;
    try { await lookup(pending); } finally { runningRef.current = false; }
  }, [lookup]);

  useEffect(() => {
    if (!initial.pending || initial.result || checkedRef.current) return;
    checkedRef.current = true;
    // Strict Mode의 첫 정리 이후에도 같은 탭 제출 본문을 보존해 조회 중 새로고침을 복구합니다.
    if (initial.pending.request) savePendingRegistration(userId, initial.pending.request);
    void check();
  }, [initial, check, userId]);

  useEffect(() => {
    if (status === 'complete' && result) saveRegistrationReceipt(userId, result);
    else if (pendingRef.current?.request) savePendingRegistration(userId, pendingRef.current.request);
  }, [status, result, userId]);

  /** 명확한 입력 검증 실패만 수정 가능 상태로 돌리고 그 외 실패는 기존 ID의 저장 결과를 먼저 조회합니다. */
  async function send(pending: PendingRegistration) {
    if (!pending.request || runningRef.current) return;
    runningRef.current = true;
    setStatus('submitting');
    setMessage('입력한 정보를 저장하고 있어요.');
    setCanRetry(false);
    try {
      finish(await submitRegistration(pending.request));
    } catch (error) {
      if (!activeRef.current) return;
      if (error instanceof ApiError && error.status === 400 && error.code === 'INVALID_REQUEST') {
        clearPendingRegistration(userId, pending.requestId);
        pendingRef.current = null;
        setStatus('idle');
        const inputError = getRegistrationInputError(error);
        setMessage(inputError.message);
        onInputError(inputError.step, inputError.message);
        return;
      }
      await lookup(pending);
    } finally {
      runningRef.current = false;
    }
  }

  /** 첫 제출 직전에 ID와 본문을 만들어 저장하고 동기 잠금으로 빠른 중복 클릭도 차단합니다. */
  function submit(draft: RegistrationDraft) {
    if (pendingRef.current || runningRef.current || status !== 'idle') return;
    const request = createRegistrationRequest(draft, crypto.randomUUID());
    const pending = {
      requestId: request.requestId,
      request
    };
    pendingRef.current = pending;
    discardRegistrationReceipt();
    savePendingRegistration(userId, request);
    void send(pending);
  }

  /** 결과 조회의 404를 확인한 뒤에만 원래 ID·본문 그대로 재전송합니다. */
  function retry() {
    if (!canRetry || !pendingRef.current) return;
    void send(pendingRef.current);
  }

  return {
    status,
    result,
    message,
    canRetry,
    submit,
    check,
    retry
  };
}
