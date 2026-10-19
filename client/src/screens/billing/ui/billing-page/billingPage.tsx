'use client';

import { Button } from '@/shared/ui/button';
import { ListHeader } from '@/shared/ui/list-header';
import { Toast } from '@/shared/ui/toast';
import {
  usePathname,
  useRouter,
  useSearchParams
} from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent
} from 'react';
import { BILLING_TABS } from '../../model/billing';
import type { BillingTab } from '../../model/billingTypes';
import { BillingHistory } from '../_components/billing-history/billingHistory';
import { BillingItems } from '../_components/billing-items/billingItems';
import { BillingLoadState } from '../_components/billing-load-state/billingLoadState';
import { MonthlyBilling } from '../_components/monthly-billing/monthlyBilling';
import { OpeningBalances } from '../_components/opening-balances/openingBalances';
import { useBillingSettings } from '../_hooks/useBillingData';
import styles from './billingPage.module.css';

/** 공통 관리 레이아웃 안에서 부과·설정·이력·잔액 인계 탭을 조합하고 URL 선택과 서버에서 조회한 현재·예정 설정을 표시합니다. */
export function BillingPage({
  propertyId,
}: {
  propertyId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams();
  const requestedTab = query.get('tab');
  const settings = useBillingSettings(propertyId);
  const tab = BILLING_TABS.find((item) => item.id === requestedTab)?.id ?? (settings.data?.managementStarted === false ? 'opening' : 'monthly');
  const saved = query.get('saved') === '1';
  const [notice, setNotice] = useState<{
    id: number;
    message: string;
  } | null>(() => saved ? {
    id: Date.now(),
    message: '다음 달 적용 설정을 저장했어요.'
  } : null);
  useEffect(() => {
    if (!saved) return;
    const next = new URLSearchParams(query.toString());
    next.delete('saved');
    window.history.replaceState(window.history.state, '', `${pathname}?${next.toString()}`);
  }, [saved, pathname, query]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /** 탭 변경을 이력에 남겨 직접 진입·새로고침·뒤로가기가 같은 화면을 선택하게 합니다. */
  function changeTab(next: BillingTab) {
    if (next === tab) return;
    const params = new URLSearchParams(query.toString());
    params.set('tab', next);
    router.push(`${pathname}?${params.toString()}`, {
      scroll: false
    });
  }

  /** 방향키·Home/End는 탭 선택과 포커스를 함께 이동하며 Tab은 선택한 탭만 거칩니다. */
  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % BILLING_TABS.length;
    else if (event.key === 'ArrowLeft') next = (index + BILLING_TABS.length - 1) % BILLING_TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = BILLING_TABS.length - 1;
    else return;
    event.preventDefault();
    tabRefs.current[next]?.focus();
    changeTab(BILLING_TABS[next].id);
  }

  if (settings.isPending || settings.isError) return (
    <BillingLoadState
      pending={settings.isPending}
      error={settings.error}
      onRetry={() => settings.refetch()}
    />
  );

  return (
    <section
      className={styles.page}
      aria-labelledby={'billing-title'}
    >
      <ListHeader
        menu={'관리비 관리'}
        title={'관리비 부과'}
        titleId={'billing-title'}
        description={'매월 자동으로 부과하고, 세대별 청구 내역을 한눈에 확인하세요.'}
      />
      <div
        className={styles.tabs}
        role={'tablist'}
        aria-label={'관리비 부과 탭'}
      >
        {BILLING_TABS.map((item, index) => (
          <Button
            key={item.id}
            ref={(element) => { tabRefs.current[index] = element; }}
            id={`billing-tab-${item.id}`}
            className={styles.tab}
            variant={'ghost'}
            role={'tab'}
            aria-selected={item.id === tab}
            aria-controls={`billing-panel-${item.id}`}
            tabIndex={item.id === tab ? 0 : -1}
            onClick={() => changeTab(item.id)}
            onKeyDown={(event) => handleTabKey(event, index)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {tab === 'opening' && (
        <div
          id={'billing-panel-opening'}
          role={'tabpanel'}
          aria-labelledby={'billing-tab-opening'}
        >
          <OpeningBalances
            propertyId={propertyId}
          />
        </div>
      )}
      <div
        id={'billing-panel-monthly'}
        role={'tabpanel'}
        aria-labelledby={'billing-tab-monthly'}
        hidden={tab !== 'monthly'}
      >
        {settings.data && (
          <MonthlyBilling
            propertyId={propertyId}
            settings={settings.data}
            onOpenItems={() => changeTab('items')}
          />
        )}
      </div>
      <div
        id={'billing-panel-items'}
        role={'tabpanel'}
        aria-labelledby={'billing-tab-items'}
        hidden={tab !== 'items'}
      >
        {settings.data && (
          <BillingItems
            propertyId={propertyId}
            settings={settings.data}
          />
        )}
      </div>
      <div
        id={'billing-panel-history'}
        role={'tabpanel'}
        aria-labelledby={'billing-tab-history'}
        hidden={tab !== 'history'}
      >
        <BillingHistory
          propertyId={propertyId}
        />
      </div>
      {notice && (
        <Toast
          key={notice.id}
          message={notice.message}
          onClose={() => setNotice(null)}
        />
      )}
    </section>
  );
}
