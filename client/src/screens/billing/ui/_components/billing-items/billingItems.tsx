import type {
  BillingSettings,
  BillingTemplate
} from '@/entities/billing';
import { Button } from '@/shared/ui/button';
import { ListCard } from '@/shared/ui/list-card';
import { useRouter } from 'next/navigation';
import { formatBillingMonth } from '../../../lib/billingLabel';
import {
  getBillingDates,
  shiftBillingMonth
} from '../../../model/billing';
import { BillingTemplateSummary } from '../billing-template-summary/billingTemplateSummary';
import styles from './billingItems.module.css';

/** 관리비 설정 탭은 현재·예약 설정을 조회하며 명시적인 설정하기에서만 별도 편집 페이지로 이동합니다. */
export function BillingItems({ propertyId, settings }: { propertyId: string; settings: BillingSettings }) {
  const router = useRouter();
  // 현재 청구의 납부기한과 지금 변경할 설정의 적용월을 구분하고 서버 한국시간 기준월을 사용합니다.
  const { dueDate } = getBillingDates(settings.currentMonth);
  const effectiveMonth = shiftBillingMonth(settings.currentMonth, 1);
  const [, dueMonth, dueDay] = dueDate.split('-');

  return (
    <div
      className={styles.content}
    >
      <div
        className={`${styles['card-heading']} ${styles['settings-heading']}`}
      >
        <div>
          <h2>
            관리비 기본 설정
          </h2>
          <p>
            현재 적용 중인 항목과 다음 달 적용 예정 내용을 확인하세요.
          </p>
        </div>
        <Button
          onClick={() => router.push(`/manage/${propertyId}/billing/monthly/settings`)}
        >
          설정하기
        </Button>
      </div>
      <TemplateCard
        buildings={settings.buildings ?? []}
        template={settings.current}
        title={'현재 적용 중인 기본 항목'}
      />
      {settings.scheduled && (
        <TemplateCard
          buildings={settings.buildings ?? []}
          template={settings.scheduled}
          title={'다음 달 적용 예정 항목'}
        />
      )}
      <ListCard>
        <dl
          className={styles.schedule}
        >
          <div>
            <dt>
              자동 부과
            </dt>
            <dd>
              매월 1일 00시 (한국시간)
            </dd>
          </div>
          <div>
            <dt>
              이번 달 납부기한
            </dt>
            <dd>
              {`${Number(dueMonth)}월 ${Number(dueDay)}일`}
            </dd>
          </div>
          <div>
            <dt>
              설정 변경 적용월
            </dt>
            <dd>
              {formatBillingMonth(effectiveMonth)}
            </dd>
          </div>
          <div>
            <dt>
              변경 적용
            </dt>
            <dd>
              다음 달부터
            </dd>
          </div>
        </dl>
      </ListCard>
    </div>
  );
}
function TemplateCard({ template, title, buildings }: { template: BillingTemplate; title: string; buildings: NonNullable<BillingSettings['buildings']> }) {
  return (
    <ListCard>
      <div
        className={styles['card-heading']}
      >
        <h2>
          {title}
        </h2>
        <span
          className={styles.badge}
        >
          {formatBillingMonth(template.effectiveMonth)}
          {' '}
          기준
        </span>
      </div>
      <BillingTemplateSummary
        template={template}
        buildings={buildings}
        label={title}
      />
      {template.reason && (
        <p
          className={styles.reason}
        >
          {`수정 사유: ${template.reason}`}
        </p>
      )}
    </ListCard>
  );
}
