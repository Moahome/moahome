'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { Radio } from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { leaveProperty } from '../api/leavePropertyApi';
import type { LeaveReason } from '../api/leavePropertyApiTypes';
import styles from './leavePropertyButton.module.css';

/** 서비스 종료와 실제 퇴거를 명시적으로 선택하게 하고 저장 성공 후에만 화면 접근을 정리합니다. */
export function LeavePropertyButton({
  propertyId,
  propertyName,
  role,
  residentEligible,
  onLeft
}: {
  propertyId: string;
  propertyName: string;
  role: 'ADMIN' | 'MANAGER' | 'RESIDENT';
  residentEligible: boolean;
  onLeft: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<LeaveReason | null>(null);
  const leave = useMutation({
    mutationFn: (selected: LeaveReason) => leaveProperty(propertyId, {
      reason: selected
    }),
    retry: false,
    onSuccess: onLeft
  });
  const chief = role === 'ADMIN';
  let error = '나가기를 처리하지 못했어요. 선택한 내용은 유지되니 잠시 후 다시 시도해주세요.';
  if (leave.error instanceof ApiError) {
    const messages: Record<string, string> = {
      MEMBER_TRANSFER_REQUIRED: '다른 사람에게 관리소장 역할을 인계한 뒤 나갈 수 있어요.',
      MEMBER_REPRESENTATIVE_REQUIRED: '다른 주민이 남아 있어요. 관리소장에게 세대 대표 변경을 요청한 뒤 퇴거해주세요.',
      MEMBER_RESIDENT_REQUIRED: '현재 연결된 거주 정보가 없어요. 서비스 이용만 종료하거나 관리자에게 거주 정보를 확인해주세요.',
      MEMBER_ROLE_CONFLICT: '참여 정보가 변경되었어요. 설정을 다시 열어 확인해주세요.'
    };
    error = messages[leave.error.code] ?? error;
  }

  return (
    <>
      <Button
        tone={'danger'}
        variant={'outline'}
        onClick={() => { setReason(null); leave.reset(); setOpen(true); }}
      >
        나가기
      </Button>
      {open && (
        <ClientModal
          className={styles.dialog}
          aria-labelledby={'leave-property-title'}
          aria-describedby={'leave-property-description'}
          busy={leave.isPending}
          onClose={() => setOpen(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!reason || chief || leave.isPending) return;
              leave.mutate(reason);
            }}
          >
            <header>
              <h2
                id={'leave-property-title'}
              >
                {propertyName}
                에서 나가시겠어요?
              </h2>
              <Button
                variant={'ghost'}
                iconOnly
                aria-label={'나가기 창 닫기'}
                disabled={leave.isPending}
                onClick={() => setOpen(false)}
              >
                <ServiceIcon
                  name={'close'}
                />
              </Button>
            </header>
            <p
              id={'leave-property-description'}
            >
              나가는 이유를 선택해주세요. 두 경우 모두 이곳의 모아홈 서비스 이용이 종료됩니다.
            </p>
            <fieldset
              disabled={leave.isPending}
            >
              <legend>
                나가는 이유
              </legend>
              <Radio
                name={'leave-reason'}
                variant={'card'}
                value={'SERVICE_ONLY'}
                label={'서비스 이용만 종료'}
                aria-label={'서비스 이용만 종료'}
                description={'주민 명부와 거주 정보는 그대로 유지합니다.'}
                checked={reason === 'SERVICE_ONLY'}
                onChange={() => setReason('SERVICE_ONLY')}
              />
              <Radio
                name={'leave-reason'}
                variant={'card'}
                value={'MOVE_OUT'}
                label={'실제 퇴거로 나가기'}
                aria-label={'실제 퇴거로 나가기'}
                description={residentEligible ? '본인의 현재 세대 관계를 종료하고 오늘 날짜를 퇴거일로 기록합니다. 다른 주민의 거주 정보는 유지합니다.' : '현재 연결된 거주 정보가 있어야 선택할 수 있습니다.'}
                checked={reason === 'MOVE_OUT'}
                disabled={!residentEligible}
                onChange={() => setReason('MOVE_OUT')}
              />
            </fieldset>
            <p>
              기존 청구·납부 이력과 다른 곳의 참여는 유지됩니다. 다시 이용하려면 참여 절차를 거쳐야 합니다.
            </p>
            {chief && (
              <p
                className={styles.notice}
                role={'status'}
              >
                관리소장은 다른 사람에게 역할을 인계한 뒤 나갈 수 있어요. 주민 관리에서 인계를 먼저 진행해주세요.
              </p>
            )}
            {leave.isError && (
              <p
                className={styles.error}
                role={'alert'}
              >
                {error}
              </p>
            )}
            <footer>
              <Button
                variant={'outline'}
                disabled={leave.isPending}
                onClick={() => setOpen(false)}
              >
                취소
              </Button>
              <Button
                type={'submit'}
                tone={'danger'}
                disabled={!reason || chief}
                loading={leave.isPending}
              >
                {leave.isPending ? '처리 중…' : '나가기'}
              </Button>
            </footer>
          </form>
        </ClientModal>
      )}
    </>
  );
}
