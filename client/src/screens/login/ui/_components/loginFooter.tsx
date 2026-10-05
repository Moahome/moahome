'use client';

import {
  useRef,
  useState
} from 'react';
import styles from '../loginPage.module.css';

export function LoginFooter() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [documentTitle, setDocumentTitle] = useState('');

  function openNotice(title: string) {
    setDocumentTitle(title);
    dialogRef.current?.showModal();
  }

  return (
    <footer
      className={styles.footer}
    >
      <div
        className={styles['legal-links']}
      >
        <button
          type={'button'}
          onClick={() => openNotice('이용약관')}
        >
          이용약관
        </button>
        <span
          aria-hidden={'true'}
        >
          ·
        </span>
        <button
          type={'button'}
          onClick={() => openNotice('개인정보처리방침')}
        >
          개인정보처리방침
        </button>
      </div>
      <dialog
        ref={dialogRef}
        className={styles['legal-dialog']}
        aria-labelledby={'legal-title'}
      >
        <h2
          id={'legal-title'}
        >
          {documentTitle}
        </h2>
        <p>
          {documentTitle}
          을 준비하고 있어요. 서비스 시작 전에 안내해 드릴게요.
        </p>
        <form
          method={'dialog'}
        >
          <button
            type={'submit'}
          >
            확인
          </button>
        </form>
      </dialog>
    </footer>
  );
}
