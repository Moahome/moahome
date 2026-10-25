import type {
  QueryClient,
  QueryKey
} from '@tanstack/react-query';
import type { PropertyQueryScope } from './propertyQueryScopeTypes';

const revisions = new Map<string, number>();

/** 비동기 저장을 시작한 화면의 계정·대상 수명을 고정해 늦은 응답이 새 화면의 캐시를 덮어쓰지 않게 합니다. */
export function capturePropertyQueryScope(userId: string | undefined, propertyId: string): PropertyQueryScope {
  return {
    userId,
    propertyId,
    revision: revisions.get(`${userId}:${propertyId}`) ?? 0
  };
}

/** 실제 접근 상실 때만 범위 버전을 변경하며 동일 권한의 재조회·장애는 진행 중 저장 결과를 폐기하지 않습니다. */
export function endPropertyQueryScope(userId: string, propertyId: string) {
  const key = `${userId}:${propertyId}`;
  revisions.set(key, (revisions.get(key) ?? 0) + 1);
}

/** 서버 Mutation은 끝까지 두되 접근 상실·계정 전환 뒤 도착한 응답은 이전 업무 캐시를 재생성하지 않습니다. */
export function setPropertyQueryData<T>(client: QueryClient, key: QueryKey, data: T, scope: PropertyQueryScope) {
  const currentUser = client.getQueryData(['session', 'current-user']);
  if (!scope.userId || !currentUser || typeof currentUser !== 'object' || !('id' in currentUser)
    || currentUser.id !== scope.userId || key[1] !== scope.userId || key[2] !== scope.propertyId
    || capturePropertyQueryScope(scope.userId, scope.propertyId).revision !== scope.revision) return;
  client.setQueryData(key, data);
}
