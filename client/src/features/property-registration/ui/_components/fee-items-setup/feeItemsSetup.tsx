'use client';

import {
  useEffect,
  useRef,
  useState
} from 'react';
import { Button } from '@/shared/ui/button';
import { HomeIllustration } from '@/shared/ui/home-illustration';
import {
  formatFeeAmount,
  getFeeItemsError,
  getFeeItemsTotal,
  type FeeItemDraft
} from '../../../model/feeItems';
import { FeeItemEditor } from '../fee-item-editor/feeItemEditor';
import { RegistrationIcon } from '../registration-icon/registrationIcon';
import { SetupProgress } from '../setup-progress/setupProgress';
import { UnitDeleteConfirmation } from '../unit-delete-confirmation/unitDeleteConfirmation';
import styles from './feeItemsSetup.module.css';

/** 세대당 월 기본 항목만 편집하며 실제 청구와 저장은 마지막 등록 단계의 책임으로 유지합니다. */
export function FeeItemsSetup({
  propertyName,
  items,
  onChange,
  onPrevious,
}: {
  propertyName: string;
  items: FeeItemDraft[];
  onChange: (items: FeeItemDraft[]) => void;
  onPrevious: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState<{ item: FeeItemDraft | null } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [nextMessage, setNextMessage] = useState('');
  const error = getFeeItemsError(items);
  const pendingItem = items.find((item) => item.clientId === pendingDeleteId);

  useEffect(() => {
    headingRef.current?.focus({
      preventScroll: true
    });
    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
  }, []);

  /** 추가·수정을 원래 순서에 반영하고 다른 항목과 이전 단계의 입력을 유지합니다. */
  function saveItem(item: FeeItemDraft) {
    const exists = items.some((entry) => entry.clientId === item.clientId);
    onChange(exists ? items.map((entry) => entry.clientId === item.clientId ? item : entry) : [...items, item]);
    setEditing(null);
    setNextMessage('');
  }

  /** 확인한 항목 ID만 제거하며 취소 시 편집창과 미확정 입력을 그대로 유지합니다. */
  function deleteItem() {
    if (!pendingItem) return;
    onChange(items.filter((item) => item.clientId !== pendingItem.clientId));
    setPendingDeleteId(null);
    setEditing(null);
    setNextMessage('');
    requestAnimationFrame(() => addRef.current?.focus());
  }

  /** 후속 확인 화면의 준비 상태를 정확히 안내하고 최종 저장 API는 호출하지 않습니다. */
  function continueSetup() {
    if (error) return;
    setNextMessage('관리비 항목을 확인했어요. 다음 등록 정보 확인 화면은 준비 중이에요. 입력한 정보는 아직 저장되지 않았어요.');
  }

  return (
    <main
      className={styles.page}
    >
      <div
        className={styles['mobile-navigation']}
      >
        <Button
          variant={'ghost'}
          iconOnly
          aria-label={'관리계좌 설정으로 돌아가기'}
          onClick={onPrevious}
          leadingIcon={(
            <RegistrationIcon
              name={'back'}
            />
          )}
        />
        <span>
          초기 설정
        </span>
      </div>
      <header
        className={styles['setup-heading']}
      >
        <h1>
          {propertyName}
          {' '}
          초기 설정
        </h1>
        <p>
          관리 운영에 필요한 정보를 설정해주세요.
        </p>
      </header>
      <SetupProgress
        currentStep={4}
      />
      <section
        className={styles.card}
        aria-labelledby={'fee-items-setup-title'}
      >
        <header
          className={styles.intro}
        >
          <div
            className={styles.illustration}
            aria-hidden={'true'}
          >
            <HomeIllustration
              kind={'create'}
              showAction={false}
            />
            <span>
              ₩
            </span>
          </div>
          <div
            className={styles['intro-copy']}
          >
            <h2
              id={'fee-items-setup-title'}
              ref={headingRef}
              tabIndex={-1}
            >
              관리비 항목 설정
            </h2>
            <p>
              <span>
                매월 세대에 부과할 기본 관리비 항목을 설정해주세요.
              </span>
              <span>
                등록한 항목은 매월 관리비 부과 시 기본값으로 사용됩니다.
              </span>
            </p>
          </div>
        </header>
        <div
          className={styles.content}
        >
          <table
            className={styles.table}
          >
            <caption>
              기본 관리비 항목
            </caption>
            <thead>
              <tr>
                <th
                  scope={'col'}
                >
                  항목명
                </th>
                <th
                  scope={'col'}
                >
                  금액
                </th>
                <th
                  scope={'col'}
                >
                  관리
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.clientId}
                >
                  <td>
                    {item.itemName}
                  </td>
                  <td>
                    {formatFeeAmount(item.defaultAmount)}
                  </td>
                  <td>
                    <div
                      className={styles['row-actions']}
                    >
                      <Button
                        variant={'outline'}
                        size={'sm'}
                        className={styles['edit-button']}
                        aria-label={`${item.itemName} 수정`}
                        onClick={() => setEditing({
                          item
                        })}
                      >
                        수정
                      </Button>
                      <Button
                        variant={'outline'}
                        size={'sm'}
                        className={styles['delete-button']}
                        aria-label={`${item.itemName} 삭제`}
                        onClick={() => setPendingDeleteId(item.clientId)}
                      >
                        삭제
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul
            className={styles['mobile-list']}
            aria-label={'기본 관리비 항목'}
          >
            {items.map((item) => (
              <li
                key={item.clientId}
              >
                <span
                  className={styles['item-icon']}
                >
                  <RegistrationIcon
                    name={'receipt'}
                  />
                </span>
                <div
                  className={styles['item-copy']}
                >
                  <strong>
                    {item.itemName}
                  </strong>
                  <span>
                    {formatFeeAmount(item.defaultAmount)}
                  </span>
                </div>
                <Button
                  variant={'ghost'}
                  size={'sm'}
                  aria-label={`${item.itemName} 수정`}
                  onClick={() => setEditing({
                    item
                  })}
                  trailingIcon={(
                    <RegistrationIcon
                      name={'next'}
                    />
                  )}
                >
                  수정
                </Button>
              </li>
            ))}
          </ul>
          {!items.length && (
            <div
              className={styles.empty}
            >
              <RegistrationIcon
                name={'receipt'}
              />
              <p>
                등록된 관리비 항목이 없어요.
              </p>
              <span>
                아래 버튼으로 첫 항목을 추가해주세요.
              </span>
            </div>
          )}
          <Button
            ref={addRef}
            variant={'outline'}
            className={styles['add-button']}
            onClick={() => setEditing({
              item: null
            })}
            leadingIcon={(
              <RegistrationIcon
                name={'plus'}
              />
            )}
          >
            관리비 항목 추가
          </Button>
          <div
            className={styles.total}
            aria-live={'polite'}
            aria-label={'세대당 월 기본 관리비'}
          >
            <strong>
              세대당 월 기본 관리비
            </strong>
            <span>
              {formatFeeAmount(getFeeItemsTotal(items))}
            </span>
          </div>
          <aside
            className={styles.notice}
          >
            <RegistrationIcon
              name={'info'}
            />
            <p>
              설정한 금액은 기본값입니다. 실제 관리비 부과 시 세대별 금액을 수정할 수 있어요.
            </p>
          </aside>
          {error && (
            <p
              className={styles.error}
              role={'alert'}
            >
              {error}
            </p>
          )}
          {nextMessage && (
            <p
              className={styles['next-message']}
              role={'status'}
            >
              {nextMessage}
            </p>
          )}
          <footer
            className={styles.actions}
          >
            <Button
              variant={'outline'}
              onClick={onPrevious}
            >
              이전
            </Button>
            <Button
              disabled={Boolean(error)}
              onClick={continueSetup}
              trailingIcon={(
                <RegistrationIcon
                  name={'next'}
                />
              )}
            >
              다음
            </Button>
          </footer>
        </div>
      </section>
      {editing && (
        <FeeItemEditor
          key={editing.item?.clientId ?? 'new'}
          item={editing.item}
          onSave={saveItem}
          onDelete={() => setPendingDeleteId(editing.item!.clientId)}
          onClose={() => setEditing(null)}
        />
      )}
      {pendingItem && (
        <UnitDeleteConfirmation
          title={'관리비 항목 삭제 확인'}
          label={pendingItem.itemName}
          description={'이 항목이 기본 관리비 목록에서 삭제됩니다.'}
          fallbackFocusRef={editing ? undefined : addRef}
          onConfirm={deleteItem}
          onClose={() => setPendingDeleteId(null)}
        />
      )}
    </main>
  );
}
