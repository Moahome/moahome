'use client';

import {
  useRef,
  useState
} from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/form-controls';
import styles from './externalBrowserGuide.module.css';

interface ExternalBrowserGuideProps {
  ios: boolean;
  installUrl: string;
}

/** iPhone 또는 브라우저 열기 요청 실패 시에만 수동 전환·주소 복사를 제공합니다. */
export function ExternalBrowserGuide({ ios, installUrl }: ExternalBrowserGuideProps) {
  const addressRef = useRef<HTMLInputElement>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  /** 복사가 차단되면 주소를 선택해 사용자가 직접 복사할 수 있게 합니다. */
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(installUrl);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
      addressRef.current?.focus();
      addressRef.current?.select();
    }
  }

  return (
    <div
      className={styles.guide}
    >
      <p
        id={'app-install-description'}
      >
        카카오톡 안에서는 앱 설치가 제한될 수 있어요.
        {' '}
        외부 브라우저에서 모아홈을 열어 주세요.
      </p>
      {ios ? (
        <ol>
          <li>
            카카오톡 브라우저 메뉴에서 외부 브라우저로 열기를 찾아 Safari로 여세요.
          </li>
          <li>
            Safari로 열리지 않으면 아래 주소를 복사해 Safari 주소창에 붙여넣으세요.
          </li>
          <li>
            Safari의 공유 메뉴에서 홈 화면에 추가를 선택하세요.
          </li>
        </ol>
      ) : (
        <ol>
          <li>
            브라우저에서 모아홈을 연 뒤 앱 설치 또는 홈 화면에 추가를 선택하세요.
          </li>
          <li>
            브라우저가 열리지 않으면 카카오톡 브라우저 메뉴의 다른 브라우저로 열기를 이용하거나 아래 주소를 복사해 주세요.
          </li>
        </ol>
      )}
      <div
        className={styles.address}
      >
        <Input
          ref={addressRef}
          label={'모아홈 설치 주소'}
          value={installUrl}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          variant={'outline'}
          onClick={() => void copyAddress()}
        >
          {copyStatus === 'copied' ? '복사됨' : '주소 복사'}
        </Button>
      </div>
      {copyStatus !== 'idle' && (
        <p
          role={'status'}
        >
          {copyStatus === 'copied' ? '주소를 복사했어요.' : '복사하지 못했어요. 주소를 길게 눌러 직접 복사해 주세요.'}
        </p>
      )}
      <p
        className={styles.note}
      >
        외부 브라우저에서는 다시 로그인해야 할 수 있어요.
      </p>
    </div>
  );
}
