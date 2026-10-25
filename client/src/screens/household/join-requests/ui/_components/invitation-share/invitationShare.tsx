'use client';

import {
  useRef,
  useState
} from 'react';
import {
  restoreResidentInvitation,
  memberManagementError,
  type ResidentInvitationShare
} from '@/features/member-management';
import { ClientModal } from '@/shared/ui/client-modal';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './invitationShare.module.css';

/** 같은 초대를 코드 또는 바로 가입 가능한 링크로 전달하며 메시지는 기기의 공유 기능에서 선택합니다. */
export function InvitationShare({ issued, name, propertyId, personal, onClose, onRestored }: {
  issued: ResidentInvitationShare;
  name: string;
  propertyId: string;
  personal: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [notice, setNotice] = useState('');
  const [token, setToken] = useState(issued.token);
  const [original, setOriginal] = useState('');
  const [restoring, setRestoring] = useState(false);
  const pending = useRef(false);
  const [restoreError, setRestoreError] = useState('');
  const [failed, setFailed] = useState(false);
  const validity = personal ? '30분' : '24시간';
  // 서버가 개인 초대코드를 읽지 않고도 주민용 미리보기를 선택할 수 있게 공유 용도만 쿼리로 전달합니다.
  const link = () => `${window.location.origin}${personal ? '/invitations?type=resident' : `/join/${propertyId}`}#${token}`;
  async function copy(kind: 'code' | 'link') {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(kind === 'code' ? token : link());
      setFailed(false);
      setNotice(kind === 'code' ? '초대코드를 복사했어요.' : '가입 링크를 복사했어요.');
    } catch { setFailed(true); setNotice('복사할 수 없어요. 표시된 코드를 선택해 복사해주세요.'); }
  }
  async function share() {
    if (!token) return;
    const text = `모아홈 초대코드: ${token}\n발급 후 ${validity} 동안 사용할 수 있어요.\n${link()}`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: `${name} 초대`,
          text,
          url: link()
        });
        return;
      }
      // 공유 API가 없는 PC에서는 전송했다고 표시하지 않고 문자·카카오톡에 붙여넣을 문장을 복사합니다.
      await navigator.clipboard.writeText(text);
      setFailed(false);
      setNotice('초대 메시지를 복사했어요. 문자·카카오톡에 붙여넣어 전달하세요.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFailed(true); setNotice('공유할 수 없어요. 코드 또는 링크를 복사해주세요.');
    }
  }
  /** 붙여넣은 링크는 로컬에서 fragment만 추출하고 서버에는 코드를 본문으로만 보냅니다. */
  async function restore() {
    if (pending.current) return;
    pending.current = true; setRestoring(true); setRestoreError('');
    try {
      const input = original.trim();
      const value = /^R-?/i.test(input) ? input : decodeURIComponent(new URL(input).hash.slice(1));
      if (!/^R[A-HJ-NP-Z2-9]{12}$/i.test(value.replaceAll('-', ''))) { setRestoreError('기존 개인 초대코드나 가입 링크를 확인해주세요.'); return; }
      const restored = await restoreResidentInvitation(propertyId, issued.id, value);
      setToken(restored.token); setOriginal(''); onRestored();
    } catch (failure) { setRestoreError(failure instanceof TypeError || failure instanceof URIError ? '기존 개인 초대코드나 가입 링크를 확인해주세요.' : memberManagementError(failure)); }
    finally { pending.current = false; setRestoring(false); }
  }
  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'resident-invitation-share-title'}
      initialFocusRef={heading}
      onClose={onClose}
      busy={restoring}
    >
      <header
        className={styles.header}
      >
        <span
          className={styles['title-icon']}
        >
          <ServiceIcon
            name={'user-plus'}
          />
        </span>
        <div
          className={styles['header-copy']}
        >
          <h2
            id={'resident-invitation-share-title'}
            ref={heading}
            tabIndex={-1}
          >
            {personal ? `${name} 개인 초대` : '전체 주민 초대'}
          </h2>
          <p>
            코드나 링크 중 원하는 방식으로 전달하세요.
          </p>
        </div>
        <Button
          className={styles.close}
          variant={'ghost'}
          iconOnly
          aria-label={'초대 전달 닫기'}
          disabled={restoring}
          onClick={onClose}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      </header>
      <div
        className={styles.content}
      >
        {!token && (
          <form
            className={styles.recovery}
            onSubmit={(event) => { event.preventDefault(); void restore(); }}
          >
            <p>
              보관한 기존 초대코드나 가입 링크로 초대를 복원해주세요. 기존 링크와 만료 시각은 유지됩니다.
            </p>
            <Input
              label={'기존 초대코드 또는 가입 링크'}
              value={original}
              onChange={(event) => setOriginal(event.target.value)}
              autoComplete={'off'}
              maxLength={2048}
              disabled={restoring}
              required
            />
            {restoreError && (
              <p
                role={'alert'}
              >
                {restoreError}
              </p>
            )}
            <Button
              variant={'outline'}
              type={'submit'}
              loading={restoring}
            >
              확인
            </Button>
          </form>
        )}
        {token && (
          <Input
            fieldClassName={styles['code-field']}
            label={'초대코드'}
            value={token}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            trailingContent={
              (
                <Button
                  variant={'ghost'}
                  size={'sm'}
                  iconOnly
                  aria-label={'초대코드 복사'}
                  disabled={!token}
                  onClick={() => void copy('code')}
                  leadingIcon={(
                    <ServiceIcon
                      name={'copy'}
                    />
                  )}
                />
              )
            }
          />
        )
        }
        <div
          className={styles.expiry}
        >
          <ServiceIcon
            name={'clock'}
          />
          <span>
            유효기간:
            {new Date(issued.expiresAt).toLocaleString('ko-KR')}
            {`까지 (발급 후 ${validity})`}
          </span>
        </div>
        {token && (
          <div
            className={styles.guidance}
          >
            <div
              className={styles['guidance-row']}
            >
              <span
                className={styles['guidance-icon']}
              >
                <ServiceIcon
                  name={'document'}
                />
              </span>
              <p>
                {personal ? '본인 정보가 맞으면 바로 가입하고, 정정 요청은 관리자가 확인합니다.' : '가입 시 이름은 필수이며 연락처는 선택입니다. 신청 후 관리자가 승인합니다.'}
              </p>
            </div>
            <div
              className={styles['guidance-row']}
            >
              <span
                className={styles['guidance-icon']}
              >
                <ServiceIcon
                  name={'link'}
                />
              </span>
              <div>
                <p>
                  링크를 열면 코드 입력을 건너뛰고 바로 가입 절차가 열립니다.
                </p>
                <p
                  className={styles['sub-copy']}
                >
                  재발급하면 이전 초대코드와 링크는 사용할 수 없어요.
                </p>
              </div>
            </div>
          </div>
        )
        }
        {notice && (
          <div
            className={styles.notice}
            data-error={failed}
            role={failed ? 'alert' : 'status'}
          >
            <span
              className={styles['notice-icon']}
            >
              <ServiceIcon
                name={failed ? 'alert' : 'check'}
              />
            </span>
            <div>
              <strong>
                {notice}
              </strong>
              {!failed && (
                <p>
                  링크를 열면 코드 입력 없이 가입 절차로 연결됩니다.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      {token && (
        <footer
          className={styles.actions}
        >
          <Button
            variant={'outline'}
            disabled={!token}
            onClick={() => void copy('code')}
            leadingIcon={(
              <ServiceIcon
                name={'copy'}
              />
            )}
          >
            코드 복사
          </Button>
          <Button
            variant={'outline'}
            disabled={!token}
            onClick={() => void copy('link')}
            leadingIcon={(
              <ServiceIcon
                name={'link'}
              />
            )}
          >
            가입 링크 복사
          </Button>
          <Button
            variant={'outline'}
            disabled={!token}
            onClick={() => void share()}
            leadingIcon={(
              <ServiceIcon
                name={'send'}
              />
            )}
          >
            메시지로 공유
          </Button>
        </footer>
      )}
    </ClientModal>
  );
}
