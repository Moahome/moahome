'use client';

import { useSession } from '@/entities/session';
import {
  getBillingError,
  saveBillingSettings
} from '@/features/billing-management';
import { Button } from '@/shared/ui/button';
import { ListHeader } from '@/shared/ui/list-header';
import {
  useMutation,
  useQueryClient
} from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { shiftBillingMonth } from '../../model/billing';
import type { ScheduledSettings } from '../../model/billingTypes';
import { BillingLoadState } from '../_components/billing-load-state/billingLoadState';
import { BillingSettingsForm } from '../_components/billing-settings-form/billingSettingsForm';
import { useBillingSettings } from '../_hooks/useBillingData';
import styles from './billingSettingsPage.module.css';

/** 조회한 최신 버전으로 편집하고 저장 성공 뒤 서버 설정을 재조회해 읽기 화면으로 돌아갑니다. */
export function BillingSettingsPage({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const session = useSession();
  const queryClient = useQueryClient();
  const query = useBillingSettings(propertyId);
  const mutation = useMutation({
    mutationFn: (draft: ScheduledSettings) => {
      if (!query.data) throw new Error('Settings unavailable');
      return saveBillingSettings(propertyId, query.data, draft, draft.reason);
    },
    retry: false,
    onSuccess: async (_settings, draft) => {
      await queryClient.invalidateQueries({
        queryKey: ['billing', session.data?.id, propertyId]
      });
      const current = draft.temporaryItems.find((item) => item.month && item.month !== draft.month)?.month;
      if (current) {
        router.replace(`/manage/${propertyId}/billing/monthly?tab=monthly&month=${current}&added=1`);
        return;
      }
      router.replace(`/manage/${propertyId}/billing/monthly?tab=items&saved=1`);
    }
  });
  if (query.isPending || query.isError) return (
    <BillingLoadState
      pending={query.isPending}
      error={query.error}
      onRetry={() => query.refetch()}
    />
  );
  const settings = query.data;
  const nextMonth = shiftBillingMonth(settings.currentMonth, 1);

  return (
    <section
      className={styles.page}
    >
      <ListHeader
        title={'관리비 설정'}
        titleId={'billing-settings-title'}
        menu={'관리비 부과'}
        description={'기본 설정은 다음 달부터, 임시 부과는 선택한 월에 적용됩니다.'}
        actionsClassName={styles['desktop-actions']}
        actions={(
          <Button
            variant={'outline'}
            disabled={mutation.isPending}
            onClick={() => router.replace(`/manage/${propertyId}/billing/monthly?tab=items`)}
          >
            목록
          </Button>
        )}
      />
      <BillingSettingsForm
        key={`${settings.revisionId}-${settings.currentMonth}`}
        settings={settings}
        nextMonth={nextMonth}
        busy={mutation.isPending}
        errorMessage={mutation.isError ? getBillingError(mutation.error) : ''}
        onApply={async (draft) => { try { await mutation.mutateAsync(draft); return true; } catch { return false; } }}
      />
    </section>
  );
}
