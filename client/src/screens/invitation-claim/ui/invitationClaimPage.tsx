'use client';

import {
  useEffect,
  useRef,
  useState
} from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/entities/session';
import {
  requestMemberInvitation,
  memberManagementError
} from '@/features/member-management';
import { ServiceHeader } from '@/widgets/service-header';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/form-controls';
import { ListHeader } from '@/shared/ui/list-header';
import styles from './invitationClaimPage.module.css';

/** 초대코드는 URL·저장소에 남기지 않고 로그인한 계정의 참여 신청 본문으로만 제출합니다. */
export function InvitationClaimPage() {
  const session = useSession();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    if (!session.isPending && !session.data) router.replace('/login');
  }, [session.isPending, session.data, router]);
  async function submit() {
    if (pending.current || !code.trim() || !session.data) return;
    pending.current = true; setBusy(true); setError('');
    try { const response = await requestMemberInvitation(code); setResult(response.propertyName); setCode(''); }
    catch (failure) { setError(memberManagementError(failure)); }
    finally { pending.current = false; setBusy(false); }
  }

  return (
    <div>
      <ServiceHeader />
      <main
        className={styles.page}
      >
        <ListHeader
          menu={'참여하기'}
          title={'초대코드 입력'}
          titleId={'invitation-title'}
          description={'초대코드로 신청한 뒤 관리소장의 승인을 기다려주세요.'}
        />
        {session.isPending && (
          <p
            role={'status'}
          >
            로그인 정보를 확인하고 있어요.
          </p>
        )}
        {session.data && (result ? (
          <div
            role={'status'}
          >
            <p>
              {result}
              에 참여를 신청했어요. 관리소장이 계정을 확인하고 승인하면 이용할 수 있어요.
            </p>
            <Button
              onClick={() => router.push('/start')}
            >
              모아홈으로 이동
            </Button>
          </div>
        ) :
          (
            <form
              onSubmit={(event) => { event.preventDefault(); void submit(); }}
            >
              <Input
                label={'초대코드'}
                value={code}
                autoComplete={'off'}
                maxLength={100}
                disabled={busy}
                onChange={(event) => setCode(event.target.value)}
                required
              />
              <p>
                코드는 발급 후 1일 동안 유효하며, 입력만으로 관리자 권한을 받지 않습니다.
              </p>
              <Button
                type={'submit'}
                loading={busy}
              >
                참여 신청
              </Button>
            </form>
          ))}
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

