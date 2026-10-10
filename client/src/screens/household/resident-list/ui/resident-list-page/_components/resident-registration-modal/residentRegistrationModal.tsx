import {
  useRef,
  useState
} from 'react';
import { ResidentRegistrationForm } from '@/features/resident-management';
import { ClientModal } from '@/shared/ui/client-modal';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './residentRegistrationModal.module.css';

/** 공통 모달의 포커스·스크롤·Escape 동작을 재사용하고 저장 중에는 취소와 닫기를 막습니다. */
export function ResidentRegistrationModal({
  propertyId,
  onClose,
  onRegistered
}: {
  propertyId: string;
  onClose: () => void;
  onRegistered: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'resident-registration-title'}
      initialFocusRef={titleRef}
      busy={busy}
      onClose={onClose}
    >
      <header
        className={styles.header}
      >
        <div>
          <h2
            id={'resident-registration-title'}
            ref={titleRef}
            tabIndex={-1}
          >
            주민 등록
          </h2>
          <p>
            주민 정보와 동·호수를 입력해주세요.
          </p>
        </div>
        <Button
          variant={'ghost'}
          iconOnly
          aria-label={'주민 등록 닫기'}
          disabled={busy}
          onClick={onClose}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      </header>
      <ResidentRegistrationForm
        propertyId={propertyId}
        onCancel={onClose}
        onSaved={onRegistered}
        onBusyChange={setBusy}
      />
    </ClientModal>
  );
}
