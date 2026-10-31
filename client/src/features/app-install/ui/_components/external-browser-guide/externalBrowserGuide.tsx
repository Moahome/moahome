'use client';

import {
  useRef,
  useState
} from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/form-controls';
import styles from './externalBrowserGuide.module.css';

interface ExternalBrowserGuideProps {
  android: boolean;
  ios: boolean;
  installUrl: string;
}

const ANDROID_BROWSERS = [
  {
    label: 'Chrome에서 열기',
    packageName: 'com.android.chrome',
  },
  {
    label: '삼성 인터넷에서 열기',
    packageName: 'com.sec.android.app.sbrowser',
  },
];

/** 고정된 설치 진입 주소를 지정한 브라우저에 전달하고 앱 실행이 막히면 같은 주소로 돌아옵니다. */
function getBrowserHref(installUrl: string, packageName: string) {
  const url = new URL(installUrl);

  return `intent://${url.host}${url.pathname}#Intent;scheme=${url.protocol.slice(0, -1)};package=${packageName};S.browser_fallback_url=${encodeURIComponent(installUrl)};end`;
}

/** 카카오톡의 브라우저 전환 제한에 대비해 직접 선택 링크와 수동 열기·주소 복사를 함께 제공합니다. */
export function ExternalBrowserGuide({ android, ios, installUrl }: ExternalBrowserGuideProps) {
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
        {android ? ' 설치할 브라우저를 선택해 주세요.' : ' 외부 브라우저에서 모아홈을 열어 주세요.'}
      </p>
      {android && (
        <div
          className={styles.browsers}
          aria-label={'설치할 브라우저'}
        >
          {ANDROID_BROWSERS.map((browser) => (
            <a
              key={browser.packageName}
              href={getBrowserHref(installUrl, browser.packageName)}
              className={styles.browser}
            >
              {browser.label}
            </a>
          ))}
        </div>
      )}
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
        {android && '설치된 브라우저만 열 수 있으며 카카오톡 버전에 따라 전환이 제한될 수 있어요. '}
        외부 브라우저에서는 다시 로그인해야 할 수 있어요.
      </p>
    </div>
  );
}
