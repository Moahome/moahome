'use client';

import {
  useRef,
  useState
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useSession } from '@/entities/session';
import {
  getSignupOptions,
  submitSignupRequest
} from '@/features/membership-requests';
import { memberManagementError } from '@/features/member-management';
import { ServiceHeader } from '@/widgets/service-header';
import { ListHeader } from '@/shared/ui/list-header';
import { Button } from '@/shared/ui/button';
import {
  Input,
  Dropdown
} from '@/shared/ui/form-controls';
import styles from './residentJoinPage.module.css';

/** 주민은 초대코드 없이 관리대상 참여 주소에서 세대·연락처를 입력해 승인을 신청합니다. */
export function ResidentJoinPage({ propertyId }: { propertyId?: string }) {
  const router = useRouter();
  const [joinLink, setJoinLink] = useState('');
  const session = useSession();
  const query = useQuery({
    queryKey: ['signup-options', session.data?.id, propertyId],
    queryFn: () => getSignupOptions(propertyId!),
    enabled: Boolean(session.data && propertyId),
    retry: false,
    gcTime: 0
  });
  const [unit, setUnit] = useState('');
  const [phone, setPhone] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  async function submit() {
    if (pending.current || !propertyId || !unit || !phone.trim()) return;
    pending.current = true; setBusy(true); setError('');
    try { await submitSignupRequest(propertyId, unit, phone); setDone(true); setPhone(''); }
    catch (failure) { setError(memberManagementError(failure)); }
    finally { pending.current = false; setBusy(false); }
  }

  if (!propertyId) return (
    <div>
      <ServiceHeader />
      <main
        className={styles.page}
      >
        <ListHeader
          menu={'참여하기'}
          title={'주민으로 참여하기'}
          titleId={'resident-join-title'}
          description={'관리자가 공유한 주민 참여 링크를 입력해주세요.'}
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const url = new URL(joinLink, window.location.origin);
              if (url.origin !== window.location.origin || !/^\/join\/[0-9a-f-]{36}$/i.test(url.pathname)) throw new Error('Invalid link');
              router.push(url.pathname);
            } catch { setError('관리자가 공유한 주민 참여 링크를 확인해주세요.'); }
          }}
        >
          <Input
            label={'주민 참여 링크'}
            value={joinLink}
            onChange={(e) => setJoinLink(e.target.value)}
            required
          />
          <Button
            type={'submit'}
          >
            계속
          </Button>
        </form>
        {error && (
          <p
            role={'alert'}
          >
            {error}
          </p>
        )}
      </main>
    </div>
  );

  return (
    <div>
      <ServiceHeader />
      <main
        className={styles.page}
      >
        <ListHeader
          menu={'참여하기'}
          title={query.data?.propertyName ?? '주민 참여 신청'}
          titleId={'resident-join-title'}
          description={'동·호수와 연락처를 입력하면 관리자가 확인 후 승인합니다.'}
        />
        {!session.data && (
          <p>
            로그인한 뒤 주민 참여 링크를 다시 열어주세요.
          </p>
        )}
        {query.isError && (
          <p
            role={'alert'}
          >
            {memberManagementError(query.error)}
          </p>
        )}
        {done && (
          <p
            role={'status'}
          >
            가입을 신청했어요. 관리자의 승인을 기다려주세요.
          </p>
        )}
        {query.data && !done && (
          <form
            onSubmit={(event) => { event.preventDefault(); void submit(); }}
          >
            <fieldset
              disabled={busy}
            >
              <Dropdown
                label={'동·호수'}
                value={unit}
                options={query.data.units.map((u) => ({
                  value: u.unitId,
                  label: u.label
                }))}
                onChange={setUnit}
                required
              />
              <Input
                label={'연락처'}
                type={'tel'}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={'010-1234-5678'}
                required
                autoComplete={'tel'}
              />
            </fieldset>
            <Button
              type={'submit'}
              loading={busy}
            >
              가입 신청
            </Button>
          </form>
        )}
        {error && (
          <p
            role={'alert'}
          >
            {error}
          </p>
        )}
      </main>
    </div>
  );
}

