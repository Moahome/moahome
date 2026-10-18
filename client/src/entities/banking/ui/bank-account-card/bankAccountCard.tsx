'use client';

import {
  useId,
  useState,
  type ReactNode
} from 'react';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { BankAccountFields } from '../bank-account-fields/bankAccountFields';
import type { BankAccountDraft } from '../../model/bankAccount';
import styles from './bankAccountCard.module.css';

/** 모달에서는 입력을 바로 표시하고, 기존 카드 표시에서는 사용자가 펼친 입력만 탐색할 수 있게 합니다. */
export function BankAccountCard({ title, account, onChange, onPrimaryChange, onRemove, disabled = false, presentation = 'card', children }: {
  title: string;
  account: BankAccountDraft;
  onChange: (account: BankAccountDraft) => void;
  onPrimaryChange: (checked: boolean) => void;
  onRemove?: () => void;
  disabled?: boolean;
  presentation?: 'card' | 'form';
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const expanded = presentation === 'form' || open;

  return (
    <fieldset
      className={styles.card}
      data-presentation={presentation}
      aria-label={title}
      disabled={disabled}
    >
      {presentation === 'card' && (
        <div
          className={styles.header}
          data-removable={Boolean(onRemove)}
        >
          <Button
            variant={'ghost'}
            className={styles.collapse}
            aria-label={`${title} ${open ? '접기' : '펼치기'}`}
            aria-expanded={open}
            aria-controls={contentId}
            disabled={disabled}
            onClick={() => setOpen((value) => !value)}
            leadingIcon={(
              <ServiceIcon
                name={'chevron'}
                direction={'up'}
                className={styles.arrow}
              />
            )}
          >
            <span
              className={styles['identity-copy']}
            >
              <span
                className={styles.title}
              >
                {title}
              </span>
              {account.isPrimary && (
                <span
                  className={styles.badge}
                >
                  <ServiceIcon
                    name={'star'}
                  />
                  기본 납부계좌
                </span>
              )}
            </span>
          </Button>
          {onRemove && (
            <Button
              variant={'ghost'}
              iconOnly
              className={styles.remove}
              aria-label={`${title} 삭제`}
              disabled={disabled}
              onClick={onRemove}
              leadingIcon={(
                <ServiceIcon
                  name={'close'}
                />
              )}
            />
          )}
        </div>
      )}
      <div
        className={styles.reveal}
        data-open={expanded}
        id={contentId}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div
          className={styles.clip}
        >
          <div
            className={styles.body}
          >
            <div
              className={styles.fields}
            >
              <BankAccountFields
                account={account}
                onChange={onChange}
                fieldClassName={styles.field}
              />
            </div>
            <label
              className={styles['primary-option']}
            >
              <span
                className={styles.switch}
              >
                <input
                  type={'checkbox'}
                  role={'switch'}
                  checked={account.isPrimary}
                  onChange={(event) => onPrimaryChange(event.target.checked)}
                  aria-label={'기본 납부계좌로 사용'}
                />
                <span
                  className={styles.track}
                  aria-hidden={'true'}
                />
              </span>
              <span
                className={styles['primary-copy']}
              >
                <strong>
                  기본 납부계좌로 사용
                </strong>
                <span>
                  이 통장을 기본 납부계좌로 설정하면, 납부 안내 시 기본으로 사용됩니다.
                </span>
              </span>
            </label>
            {children && (
              <div
                className={styles.balance}
              >
                {children}
              </div>
            )}
          </div>
        </div>
      </div>
    </fieldset>
  );
}
