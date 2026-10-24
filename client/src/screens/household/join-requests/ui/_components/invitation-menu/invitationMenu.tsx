'use client';

import {
  useRef,
  useState
} from 'react';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './invitationMenu.module.css';

/** 미발급은 바로 초대하고 발급 후에는 같은 행에서 전달·재발급·철회를 선택합니다. */
export function InvitationMenu({ name, active, reviewing, disabled, onOpen, onIssue, onRevoke }: {
  name: string;
  active: boolean;
  reviewing: boolean;
  disabled: boolean;
  onOpen: () => void;
  onIssue: () => void;
  onRevoke: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({
    left: 0,
    top: 0
  });
  function close() { menu.current?.hidePopover(); trigger.current?.focus(); }
  function toggle() {
    if (!active) { onIssue(); return; }
    if (open) { close(); return; }
    const bounds = trigger.current!.getBoundingClientRect();
    const menuHeight = 142;
    const below = bounds.bottom + 8;
    setPosition({
      left: Math.min(window.innerWidth - 160, Math.max(8, bounds.right - 152)),
      top: below + menuHeight <= window.innerHeight - 8 ? below : Math.max(8, bounds.top - menuHeight - 8)
    });
    menu.current?.showPopover();
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }
  return (
    <div
      className={styles.root}
    >
      <Button
        ref={trigger}
        className={styles.trigger}
        size={'sm'}
        variant={'outline'}
        disabled={disabled}
        aria-label={`${name} 개인 초대${active ? ' 메뉴' : ''}`}
        aria-haspopup={active ? 'menu' : undefined}
        aria-expanded={active ? open : undefined}
        leadingIcon={!active ? (
          <ServiceIcon
            name={'link'}
          />
        ) : undefined}
        trailingIcon={active ? (
          <span
            className={styles.chevron}
            data-open={open}
          >
            <ServiceIcon
              name={'chevron'}
            />
          </span>
        ) : undefined}
        onClick={toggle}
        onKeyDown={(event) => { if (active && event.key === 'ArrowDown') { event.preventDefault(); toggle(); } }}
      >
        개인 초대
      </Button>
      <div
        ref={menu}
        role={'menu'}
        aria-label={`${name} 개인 초대 작업`}
        popover={'auto'}
        className={styles.menu}
        style={position}
        onToggle={(event) => setOpen(event.newState === 'open')}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) close(); }}
        onKeyDown={(event) => {
          const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
          const current = items.indexOf(document.activeElement as HTMLButtonElement);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(current + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
          if (event.key === 'Escape') { event.preventDefault(); close(); }
        }}
      >
        <Button
          role={'menuitem'}
          variant={'ghost'}
          disabled={reviewing || disabled}
          leadingIcon={(
            <ServiceIcon
              name={'link'}
            />
          )}
          onClick={() => { close(); onOpen(); }}
        >
          개인 초대
        </Button>
        <Button
          role={'menuitem'}
          variant={'ghost'}
          disabled={reviewing || disabled}
          leadingIcon={(
            <ServiceIcon
              name={'reset'}
            />
          )}
          onClick={() => { close(); onIssue(); }}
        >
          재발급
        </Button>
        <Button
          role={'menuitem'}
          variant={'ghost'}
          disabled={disabled}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
          onClick={() => { close(); onRevoke(); }}
        >
          철회
        </Button>
      </div>
    </div>
  );
}
