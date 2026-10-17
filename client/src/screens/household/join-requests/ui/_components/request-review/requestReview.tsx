'use client';

import {
  useRef,
  useState
} from 'react';
import type { SignupRequest } from '@/features/membership-requests';
import { ClientModal } from '@/shared/ui/client-modal';
import { Button } from '@/shared/ui/button';
import { Dropdown } from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './requestReview.module.css';

/** 기존 주민 상세와 같은 크기·필드 행·행동 배치로 신청 확인과 명부 선택을 제공합니다. */
export function RequestReview({ request, presentation, busy, onClose, onApprove, onReject }: {
  request: SignupRequest;
  presentation: 'page' | 'modal';
  busy: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [resident, setResident] = useState('');
  const Title = presentation === 'page' ? 'h1' : 'h2';
  const content = (
    <>
      <header
        className={styles.header}
      >
        <Title
          id={'signup-review-title'}
          ref={heading}
          tabIndex={-1}
        >
          가입 요청 확인
        </Title>
        {presentation === 'modal' && (
          <Button
            variant={'ghost'}
            iconOnly
            aria-label={'가입 요청 닫기'}
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
      <dl
        className={styles.fields}
      >
        <div>
          <dt>
            신청 계정
          </dt>
          <dd>
            {request.requesterName}
          </dd>
        </div>
        <div>
          <dt>
            동·호수
          </dt>
          <dd>
            {request.unitLabel}
          </dd>
        </div>
        <div>
          <dt>
            연락처
          </dt>
          <dd>
            ••••
            {request.phoneLast4}
          </dd>
        </div>
        <div>
          <dt>
            신청일
          </dt>
          <dd>
            {new Date(request.requestedAt).toLocaleDateString('ko-KR')}
          </dd>
        </div>
      </dl>
      {request.status === 'PENDING' && (
        <>
          <Dropdown
            label={'연결할 주민'}
            value={resident}
            onChange={setResident}
            disabled={busy}
            options={request.candidates.map((c) => ({
              value: c.residentId,
              label: c.name
            }))}
            placeholder={'명부의 주민을 선택해주세요'}
          />
          <p
            className={styles.notice}
          >
            {request.candidates.length ? '신청 계정은 닉네임으로 표시됩니다. 실제 주민을 확인한 뒤 승인해주세요.' : '연결할 주민이 없습니다. 주민 목록에 해당 세대의 주민을 먼저 등록해주세요.'}
          </p>
          <div
            className={styles.actions}
          >
            <Button
              variant={'outline'}
              tone={'danger'}
              disabled={busy}
              onClick={onReject}
            >
              거절
            </Button>
            <Button
              disabled={busy || !resident}
              loading={busy}
              onClick={() => onApprove(resident)}
            >
              가입 승인
            </Button>
          </div>
        </>
      )}
    </>
  );

  if (presentation === 'page') return (
    <section
      className={styles.page}
    >
      {content}
    </section>
  );

  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'signup-review-title'}
      initialFocusRef={heading}
      busy={busy}
      onClose={onClose}
    >
      {content}
    </ClientModal>
  );
}

