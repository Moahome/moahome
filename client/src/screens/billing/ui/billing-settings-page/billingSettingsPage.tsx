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
      return saveBillingSettings(propertyId, query.data, draft.items, draft.reason);
    },
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['billing', session.data?.id, propertyId]
      });
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
        description={'변경한 항목과 금액은 다음 달 부과부터 적용됩니다.'}
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
        key={settings.revisionId}
        currentItems={settings.current.items}
        nextMonth={nextMonth}
        scheduled={settings.scheduled ? {
          month: settings.scheduled.effectiveMonth,
          items: settings.scheduled.items,
          reason: settings.scheduled.reason ?? ''
        } : null}
        busy={mutation.isPending}
        errorMessage={mutation.isError ? getBillingError(mutation.error) : ''}
        onApply={async (draft) => { try { await mutation.mutateAsync(draft); return true; } catch { return false; } }}
      />
    </section>
  );
}
