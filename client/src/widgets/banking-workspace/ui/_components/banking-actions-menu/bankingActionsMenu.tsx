'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './bankingActionsMenu.module.css';
import type { ComponentProps } from 'react';

/** 통장 행의 상세 클릭과 메뉴 행동을 분리하고 화면 경계·키보드·닫기 전환을 유지합니다. */
export function BankingActionsMenu({
  label,
  items,
}: {
  label: string;
  items: {
    label: string;
    icon: ComponentProps<typeof ServiceIcon>['name'];
    onSelect: () => void;
    disabled?: boolean;
  }[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const focusFirst = useRef(false);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const bounds = trigger.current?.getBoundingClientRect();
      const height = menu.current?.scrollHeight ?? 130;
      let scroller = root.current?.parentElement;
      while (
        scroller &&
        !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
      )
        scroller = scroller.parentElement;
      const bottom = Math.min(
        window.innerHeight,
        scroller?.getBoundingClientRect().bottom ?? window.innerHeight,
      );
      const top = Math.max(0, scroller?.getBoundingClientRect().top ?? 0);
      if (bounds)
        setAbove(
          bottom - bounds.bottom < height + 20 &&
            bounds.top - top > height + 20,
        );
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    if (focusFirst.current)
      menu.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus({
        preventScroll: true,
      });
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div
      ref={root}
      className={styles.root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Button
        ref={trigger}
        variant={'ghost'}
        iconOnly
        className={styles.trigger}
        aria-label={label}
        aria-haspopup={'menu'}
        aria-expanded={open}
        onClick={() => {
          focusFirst.current = false;
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            focusFirst.current = true;
            setOpen(true);
            if (open)
              menu.current
                ?.querySelector<HTMLButtonElement>('[role=menuitem]')
                ?.focus();
          }
        }}
        leadingIcon={(
          <ServiceIcon
            name={'more'}
          />
        )}
      />
      <div
        ref={menu}
        className={styles.menu}
        role={'menu'}
        aria-label={`${label} 작업`}
        aria-hidden={!open}
        inert={!open}
        data-open={open}
        data-above={above}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            trigger.current?.focus();
            return;
          }
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
            return;
          event.preventDefault();
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              '[role=menuitem]',
            ),
          );
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (index +
                    (event.key === 'ArrowDown' ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }}
      >
        {items.map((item) => (
          <Button
            key={item.label}
            role={'menuitem'}
            variant={'ghost'}
            disabled={item.disabled}
            leadingIcon={(
              <ServiceIcon
                name={item.icon}
              />
            )}
            onClick={() => {
              setOpen(false);
              item.onSelect();
            }}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
