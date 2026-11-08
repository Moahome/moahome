'use client';

import {
  ApiError,
  customAPI
} from '@/shared/api';
import { SESSION_LOCK_NAME } from '../model/restoreSession';
import { clearSession } from '../model/sessionStore';
import { authenticatedAPI } from './authenticatedApi';
import type {
  AccountRecovery,
  WithdrawalReceipt,
  WithdrawalStatus
} from './accountLifecycleApiTypes';

/** 탈퇴 버튼의 사전 안내이며 최종 신청 권한은 서버에서 다시 검증합니다. */
export async function getWithdrawalStatus(): Promise<WithdrawalStatus> {
  const result = await authenticatedAPI<WithdrawalStatus>({
    url: '/api/users/me/withdrawal'
  });
  if (!result || typeof result.userId !== 'string' || typeof result.canWithdraw !== 'boolean'
    || !Array.isArray(result.managedProperties)
    || result.managedProperties.some((item) => !item || typeof item.id !== 'string' || typeof item.name !== 'string')
    || result.canWithdraw !== (result.managedProperties.length === 0)) {
    throw new ApiError(200, 'INVALID_RESPONSE', '탈퇴 가능 여부를 확인하지 못했어요.');
  }
  return result;
}

/** 확인창의 명시적 신청만 전송하며, 성공 전에는 메모리 로그인 상태를 지우지 않습니다. */
export async function requestAccountWithdrawal(): Promise<WithdrawalReceipt> {
  const result = await authenticatedAPI<WithdrawalReceipt>({
    url: '/api/users/me/withdrawal',
    method: 'POST',
    data: {
      confirmed: true
    }
  });
  if (!result || !Number.isFinite(Date.parse(result.requestedAt))
    || !Number.isFinite(Date.parse(result.recoverableUntil))
    || Date.parse(result.recoverableUntil) <= Date.parse(result.requestedAt)) {
    throw new ApiError(200, 'INVALID_RESPONSE', '탈퇴 신청 결과를 확인하지 못했어요. 다시 로그인해주세요.');
  }
  return result;
}

/** 일반 Bearer 대신 카카오 재인증으로 발급한 복구 전용 HttpOnly 쿠키를 사용합니다. */
export async function getAccountRecovery(): Promise<AccountRecovery> {
  const result = await customAPI<AccountRecovery>({
    url: '/api/auth/web/account-recovery'
  });
  if (!result || !['PENDING', 'RESTORED'].includes(result.state) || typeof result.displayName !== 'string'
    || typeof result.csrfToken !== 'string' || !result.csrfToken
    || (result.state === 'PENDING' && (!result.requestedAt || !result.recoverableUntil
      || !Number.isFinite(Date.parse(result.requestedAt)) || !Number.isFinite(Date.parse(result.recoverableUntil))))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '계정 복구 정보를 확인하지 못했어요.');
  }
  return result;
}

/** 정상 Refresh Rotation·로그아웃과 같은 브라우저 잠금으로 복구 쿠키 교체의 응답 순서를 보장합니다. */
export async function recoverAccount(csrfToken: string): Promise<void> {
  if (!navigator.locks) throw new ApiError(0, 'BROWSER_UNSUPPORTED', '브라우저를 업데이트해주세요.');
  await navigator.locks.request(SESSION_LOCK_NAME, async () => {
    await customAPI<void>({
      url: '/api/auth/web/account-recovery',
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': csrfToken
      }
    });
    clearSession();
  });
}

/** 같은 브라우저의 다른 탭도 이전 계정 화면을 즉시 비우도록 내부 계정 ID만 알립니다. */
export function notifyAccountWithdrawal(userId: string) {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel('moahome-account-lifecycle');
  channel.postMessage({
    type: 'withdrawal-requested',
    userId
  });
  channel.close();
}

export function subscribeAccountWithdrawal(onWithdrawal: (userId: string) => void) {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel('moahome-account-lifecycle');
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (data && typeof data === 'object' && 'type' in data && data.type === 'withdrawal-requested'
      && 'userId' in data && typeof data.userId === 'string') onWithdrawal(data.userId);
  };
  return () => channel.close();
}
