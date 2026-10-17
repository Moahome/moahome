'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { getManagedPropertiesQueryKey } from '@/entities/property';
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
  discardSubmissionBody,
  getRegistrationInputError,
  isRegistrationRequestId,
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

/** 통신 장애에는 기존 ID로 결과를 확인하고 등록 내역이 없으면 같은 ID로 입력 수정·재등록을 허용합니다. */
export function useRegistrationSubmission(
  userId: string,
  onInputError: (step: RegistrationStep, message: string) => void,
  isCompletionPage: boolean,
  requestedId: string | null,
  entryPath: '/start' | '/properties/add' = '/start'
) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [initial] = useState(() => {
    const savedId = restoreRegistrationReceipt(userId);
    const completionRequested = isCompletionPage || savedId !== null;
    const candidateId = isCompletionPage && requestedId !== null ? requestedId : savedId;
    const completionId = isRegistrationRequestId(candidateId) ? candidateId : null;
    let pending = restorePendingRegistration(userId);
    if (completionRequested) {
      pending = completionId ? {
        requestId: completionId,
        request: null
      } : null;
    }

    return {
      completionRequested,
      completionId,
      pending
    };
  });
  const pendingRef = useRef<PendingRegistration | null>(initial.pending);
  const completedIdRef = useRef(initial.completionId);
  const runningRef = useRef(false);
  const activeRef = useRef(true);
  const checkedRef = useRef(false);
  const inputErrorRef = useRef<{ step: RegistrationStep; message: string } | null>(null);
  const [status, setStatus] = useState<SubmissionStatus>(initial.completionRequested || initial.pending ? 'checking' : 'idle');
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [isCompletionLookup, setIsCompletionLookup] = useState(initial.completionRequested);
  const [message, setMessage] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [resultHasDetails, setResultHasDetails] = useState(false);

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);

  /** 브라우저에는 조회 ID만 남기고 확인된 결과는 현재 화면의 메모리에서만 표시합니다. */
  const finish = useCallback((response: RegistrationResult, hasDetails: boolean) => {
    if (!activeRef.current) return;
    saveRegistrationReceipt(userId, response.requestId);
    void queryClient.invalidateQueries({
      queryKey: getManagedPropertiesQueryKey(userId)
    });
    clearPendingRegistration(userId, response.requestId);
    discardRegistrationDraft();
    pendingRef.current = null;
    completedIdRef.current = response.requestId;
    setIsCompletionLookup(true);
    setResult(response);
    setResultHasDetails(hasDetails);
    setStatus('complete');
    setMessage('');
    setCanRetry(false);
    setCanEdit(false);
  }, [queryClient, userId]);

  /** 404에는 입력 수정을 허용하되 ID를 재사용해 늦게 끝난 원래 요청과 중복 생성되지 않게 합니다. */
  const lookup = useCallback(async (pending: PendingRegistration) => {
    const checkingCompletion = completedIdRef.current === pending.requestId;
    // 완료 화면 재진입에는 저장된 요약·초안을 표시하지 않고 현재 접근 권한부터 확인합니다.
    if (checkingCompletion) {
      setResult(null);
      setResultHasDetails(false);
      discardRegistrationDraft();
      discardSubmissionBody();
    }
    setStatus('checking');
    setMessage('등록 결과를 확인하고 있어요.');
    setCanRetry(false);
    setCanEdit(false);
    try {
      // 조회 결과는 이전 제출의 성공일 수 있으므로 현재 수정 중인 초안을 저장된 상세로 표시하지 않습니다.
      finish(await getRegistrationResult(pending.requestId), false);
    } catch (error) {
      if (!activeRef.current) return;
      const notFound = error instanceof ApiError && error.status === 404 && error.code === 'REGISTRATION_NOT_FOUND';
      if (error instanceof ApiError && (error.status === 401 || error.code === 'ACCOUNT_UNAVAILABLE')) {
        discardRegistrationReceipt();
        // 인증 거부 이후에는 이전 사용자 쿼리와 메모리 토큰을 새 문서로 교체해 로그인 자동 복귀를 막습니다.
        window.location.replace('/login');
        return;
      }
      // 완료 주소는 새 등록 진입점이 아닙니다. 없는 결과나 해제된 권한에는 입력 폼을 열지 않습니다.
      if (checkingCompletion) {
        if (error instanceof ApiError && (error.status === 403 || error.status === 404 || error.status === 400)) {
          discardRegistrationReceipt();
          router.replace(entryPath);
          return;
        }
        setStatus('unknown');
        setMessage('잠시 후 다시 확인해주세요.');
        return;
      }
      // 이탈 뒤 본문이 없는 요청도 조회만 반복시키지 않고 기본 정보부터 다시 입력할 수 있게 합니다.
      if (notFound && pending.request === null) {
        setStatus('idle');
        setMessage('');
        onInputError('basic', '');
        return;
      }
      setStatus('unknown');
      setCanRetry(notFound && pending.request !== null);
      setCanEdit(notFound);
      setMessage(notFound ? '저장된 등록 정보가 없어요. 다시 시도하거나 입력한 내용을 수정해주세요.' : '등록 결과를 확인하지 못했어요. 연결이 복구되면 다시 확인해주세요.');
      if (error instanceof ApiError && error.code === 'ACCESS_DENIED') setMessage('이곳에 접근할 권한이 없어요. 등록 결과를 표시할 수 없습니다.');
    }
  }, [finish, router, onInputError, entryPath]);

  const check = useCallback(async () => {
    const pending = pendingRef.current ?? (completedIdRef.current ? {
      requestId: completedIdRef.current,
      request: null
    } : null);
    if (!pending || runningRef.current) return;
    runningRef.current = true;
    try { await lookup(pending); } finally { runningRef.current = false; }
  }, [lookup]);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    if (initial.completionRequested && !initial.completionId) {
      discardRegistrationReceipt();
      router.replace(entryPath);
      return;
    }
    if (!initial.pending) return;
    // Strict Mode의 첫 정리 이후에도 같은 탭 제출 본문을 보존해 조회 중 새로고침을 복구합니다.
    if (initial.pending.request) savePendingRegistration(userId, initial.pending.request);
    void check();
  }, [initial, check, userId, router, entryPath]);

  useEffect(() => {
    if (!isCompletionPage || requestedId === null || requestedId === completedIdRef.current || runningRef.current) return;
    // 같은 화면에서 조회 ID가 바뀌어도 이전 관리대상의 결과를 재사용하지 않습니다.
    setIsCompletionLookup(true);
    setResult(null);
    setResultHasDetails(false);
    if (!isRegistrationRequestId(requestedId)) {
      discardRegistrationReceipt();
      router.replace(entryPath);
      return;
    }
    completedIdRef.current = requestedId;
    pendingRef.current = {
      requestId: requestedId,
      request: null
    };
    void check();
  }, [isCompletionPage, requestedId, status, check, router, entryPath]);

  useEffect(() => {
    /** 완료 후 뒤로가기는 새 문서에서 로그인과 결과 권한을 다시 확인해 이전 입력의 재제출을 막습니다. */
    function revalidateHistory() {
      if (completedIdRef.current) window.location.reload();
    }
    window.addEventListener('popstate', revalidateHistory);
    return () => window.removeEventListener('popstate', revalidateHistory);
  }, []);

  useEffect(() => {
    if (status === 'complete' && result) saveRegistrationReceipt(userId, result.requestId);
    else if (pendingRef.current?.request) savePendingRegistration(userId, pendingRef.current.request);
  }, [status, result, userId]);

  /** 명확한 입력 오류는 실패 모달에서 안내하고 그 외 오류는 기존 ID의 저장 결과를 먼저 조회합니다. */
  async function send(pending: PendingRegistration) {
    if (!pending.request || runningRef.current) return;
    runningRef.current = true;
    setStatus('submitting');
    setMessage('입력한 정보를 저장하고 있어요.');
    setCanRetry(false);
    setCanEdit(false);
    try {
      finish(await submitRegistration(pending.request), true);
    } catch (error) {
      if (!activeRef.current) return;
      if (error instanceof ApiError && error.status === 400 && error.code === 'INVALID_REQUEST') {
        // 수정 전 요청이 늦게 성공할 수 있어 입력 오류에도 ID를 유지하고 수정한 본문만 새로 만듭니다.
        pendingRef.current = {
          requestId: pending.requestId,
          request: null
        };
        discardSubmissionBody();
        const inputError = getRegistrationInputError(error);
        inputErrorRef.current = inputError;
        setStatus('failed');
        setMessage(inputError.message);
        return;
      }
      await lookup(pending);
    } finally {
      runningRef.current = false;
    }
  }

  /** 첫 제출 직전에 ID와 본문을 만들어 저장하고 동기 잠금으로 빠른 중복 클릭도 차단합니다. */
  function submit(draft: RegistrationDraft) {
    if (runningRef.current || status !== 'idle') return;
    const previousRequestId = pendingRef.current?.requestId;
    const request = createRegistrationRequest(draft, previousRequestId ?? crypto.randomUUID());
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

  /** 등록 내역이 없으면 입력 잠금을 풀며 제출 ID만 유지해 수정한 요청도 서버에서 직렬화합니다. */
  function editRegistration() {
    const pending = pendingRef.current;
    if (!canEdit || !pending || runningRef.current) return;
    pendingRef.current = {
      requestId: pending.requestId,
      request: null
    };
    discardSubmissionBody();
    setStatus('idle');
    setCanRetry(false);
    setCanEdit(false);
    setMessage('');
    onInputError('basic', '');
  }

  /** 저장되지 않은 입력 오류를 확인한 뒤에만 수정 잠금을 풀고 해당 입력 단계로 연결합니다. */
  function dismissFailure(editInput: boolean) {
    if (status !== 'failed') return;
    setStatus('idle');
    const inputError = inputErrorRef.current;
    inputErrorRef.current = null;
    if (editInput && inputError) onInputError(inputError.step, inputError.message);
  }

  return {
    status,
    result,
    message,
    canRetry,
    canEdit,
    resultHasDetails,
    isCompletionLookup,
    submit,
    check,
    retry,
    editRegistration,
    dismissFailure
  };
}
