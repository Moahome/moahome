'use client';

import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  useState,
  type ReactNode
} from 'react';
import type { PreviewPayment } from '../../../model/paymentPreviewTypes';
import { usePaymentWorkspace } from '../../payment-workspace-provider/paymentWorkspaceProvider';
import { PaymentEditor } from '../payment-editor/paymentEditor';
import styles from './paymentDetail.module.css';

/** PC 모달과 모바일 페이지는 동일한 상세 내용을 조합하고 바깥 컨테이너만 구분합니다. */
export function PaymentDetail({ paymentId, presentation = 'modal', menuLabel = '입금 관리', onClose, onProcessed, renderSupplement }: {
  renderSupplement?: (onBusyChange: (busy: boolean) => void) => ReactNode;
  paymentId: string;
  presentation?: 'modal' | 'page';
  menuLabel?: string;
  onClose: () => void;
  onProcessed: (id: string, status: PreviewPayment['status'], receiptType?: PreviewPayment['receiptType']) => void;
}) {
  const { busy: workspaceBusy } = usePaymentWorkspace();
  const [supplementBusy, setSupplementBusy] = useState(false);
  const busy = workspaceBusy || supplementBusy;
  const Title = presentation === 'page' ? 'h1' : 'h2';
  const content = (
    <>
      <header
        className={styles.header}
      >
        <div>
          <p>
            {menuLabel}
          </p>
          <Title
            id={'payment-detail-title'}
          >
            입금 처리 상세
          </Title>
        </div>
        {presentation === 'modal' && (
          <Button
            variant={'ghost'}
            size={'sm'}
            iconOnly
            aria-label={'입금 상세 닫기'}
            disabled={busy}
            onClick={onClose}
            leadingIcon={(
              <ServiceIcon
                name={'close'}
              />
            )}
          />
        )}
      </header>
      <div
        className={styles.body}
      >
        <PaymentEditor
          paymentId={paymentId}
          onProcessed={onProcessed}
          disabled={supplementBusy}
        >
          {renderSupplement?.(setSupplementBusy)}
        </PaymentEditor>
      </div>
    </>
  );
  if (presentation === 'page') return (
    <section
      className={styles.page}
      aria-label={'입금 상세 페이지'}
    >
      {content}
    </section>
  );

  return (
    <ClientModal
      className={styles.modal}
      onClose={onClose}
      busy={busy}
      aria-labelledby={'payment-detail-title'}
      closeOnOutsideClick
    >
      {content}
    </ClientModal>
  );
}
