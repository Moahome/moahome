import { endPropertyQueryScope } from '@/entities/property';
import type {
  Query,
  QueryClient
} from '@tanstack/react-query';

/** 접근이 끝난 계정·대상의 조회만 정리하고 다른 대상·계정과 진행 중 Mutation은 유지합니다. */
export async function clearPropertyQueries(client: QueryClient, userId: string, propertyId: string) {
  endPropertyQueryScope(userId, propertyId);
  const filters = {
    predicate: (query: Query) => query.queryKey[0] !== 'property-access'
      && query.queryKey[1] === userId && query.queryKey[2] === propertyId
  };
  await client.cancelQueries(filters);
  client.removeQueries(filters);
  await Promise.all([
    client.invalidateQueries({
      queryKey: ['managed-properties', userId],
      refetchType: 'none'
    }),
    client.invalidateQueries({
      queryKey: ['resident-properties', userId],
      refetchType: 'none'
    })
  ]);
}
