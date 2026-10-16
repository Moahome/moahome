'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './calendarPicker.module.css';

/** 월·날짜 선택을 같은 달력으로 제공하고 선택 후 호출 버튼으로 포커스를 돌려줍니다. */
export function CalendarPicker({ label, value, onChange, mode = 'date', clearable = false, required = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mode?: 'month' | 'date';
  clearable?: boolean;
  required?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const selected = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(value.slice(0, 4)) || new Date().getFullYear());
  const selectedMonth = Number(value.slice(5, 7));
  const [month, setMonth] = useState(selectedMonth || new Date().getMonth() + 1);
  const [choosingMonth, setChoosingMonth] = useState(mode === 'month');
  const monthValue = `${year}-${String(month).padStart(2, '0')}`;
  const displayValue = value ? `${value.slice(0, 4)}년 ${selectedMonth}월${mode === 'date' ? ` ${Number(value.slice(8, 10))}일` : ''}` : (mode === 'month' ? '전체 기간' : '날짜 선택');
  const offset = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();

  /** 날짜 모드의 월 이동은 연도 경계를 함께 넘겨 잘못된 날짜 문자열을 만들지 않습니다. */
  function moveMonth(delta: number) {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
  }

  // 선택 목록과 같은 최상위 Popover를 사용해 모달 스크롤에 잘리지 않게 하되 본문 경계를 지킵니다.
  useLayoutEffect(() => {
    const popup = calendar.current;
    const button = trigger.current;
    if (!popup || !button) return;
    if (!open) {
      const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
      const timer = window.setTimeout(() => {
        if (popup.matches(':popover-open')) popup.hidePopover();
      }, delay);
      return () => window.clearTimeout(timer);
    }
    if (!popup.matches(':popover-open')) popup.showPopover();

    /** 입력 왼쪽을 기준으로 열고, 본문·모달과 뷰포트 안에서 위치와 최대 높이를 제한합니다. */
    function positionCalendar() {
      if (!popup || !button) return;
      const anchor = button.getBoundingClientRect();
      const boundary = button.closest('dialog[open], main')?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const left = Math.max(viewportLeft + 8, (boundary?.left ?? viewportLeft) + 8);
      const right = Math.min(viewportRight - 8, (boundary?.right ?? viewportRight) - 8);
      const top = Math.max(viewportTop + 8, (boundary?.top ?? viewportTop) + 8);
      const bottom = Math.min(viewportBottom - 8, boundary?.bottom ?? viewportBottom - 8);
      const width = Math.min(280, right - left);
      popup.style.width = `${width}px`;
      const below = bottom - anchor.bottom - 6;
      const above = anchor.top - top - 6;
      const openAbove = below < popup.scrollHeight && above > below;
      const maxHeight = Math.max(80, openAbove ? above : below);
      popup.style.maxHeight = `${maxHeight}px`;
      const height = Math.min(popup.scrollHeight, maxHeight);
      popup.style.left = `${Math.max(left, Math.min(anchor.left, right - width))}px`;
      popup.style.top = `${openAbove ? anchor.top - height - 6 : anchor.bottom + 6}px`;
    }

    positionCalendar();
    const observer = new ResizeObserver(positionCalendar);
    observer.observe(button);
    observer.observe(popup);
    window.addEventListener('resize', positionCalendar);
    window.addEventListener('scroll', positionCalendar, true);
    window.visualViewport?.addEventListener('resize', positionCalendar);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', positionCalendar);
      window.removeEventListener('scroll', positionCalendar, true);
      window.visualViewport?.removeEventListener('resize', positionCalendar);
    };
  }, [open, year, month, choosingMonth]);

  useEffect(() => {
    if (!open) return;
    (selected.current ?? trigger.current)?.focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);

    return () => document.removeEventListener('pointerdown', outside);
  }, [open, choosingMonth]);

  function choose(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div
      className={styles.picker}
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }}
    >
      <span
        id={`${id}-label`}
        className={styles.label}
      >
        {label}
        {required && (
          <span
            aria-hidden={'true'}
          >
            {' '}
            *
          </span>
        )}
      </span>
      <Button
        ref={trigger}
        variant={'outline'}
        tone={'neutral'}
        className={styles.trigger}
        aria-label={`${label}: ${displayValue}`}
        aria-haspopup={'dialog'}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setYear(Number(value.slice(0, 4)) || new Date().getFullYear());
          setMonth(selectedMonth || new Date().getMonth() + 1);
          setChoosingMonth(mode === 'month');
          setOpen((previous) => !previous);
        }}
      >
        <ServiceIcon
          name={'closing'}
          size={18}
        />
        <span
          className={styles.value}
        >
          {displayValue}
        </span>
        <ServiceIcon
          className={styles.chevron}
          name={'chevron'}
          direction={'down'}
          size={16}
        />
      </Button>
      <div
        id={id}
        ref={calendar}
        popover={'manual'}
        data-open={open}
        aria-hidden={!open}
        inert={!open}
        role={'dialog'}
        aria-labelledby={`${id}-label`}
        className={styles.calendar}
      >
        <div
          className={styles.year}
        >
          <Button
            variant={'ghost'}
            iconOnly
            size={'sm'}
            aria-label={choosingMonth ? '이전 연도' : '이전 달'}
            disabled={year <= 1000}
            onClick={() => choosingMonth ? setYear(year - 1) : moveMonth(-1)}
          >
            <ServiceIcon
              name={'chevron'}
              direction={'left'}
              size={18}
            />
          </Button>
          <Button
            variant={'ghost'}
            aria-label={'연월 선택'}
            onClick={() => setChoosingMonth(true)}
          >
            {year}
            년
            {choosingMonth ? '' : `${month}월`}
          </Button>
          <Button
            variant={'ghost'}
            iconOnly
            size={'sm'}
            aria-label={choosingMonth ? '다음 연도' : '다음 달'}
            disabled={year >= 9998}
            onClick={() => choosingMonth ? setYear(year + 1) : moveMonth(1)}
          >
            <ServiceIcon
              name={'chevron'}
              size={18}
            />
          </Button>
        </div>
        {choosingMonth ? (
          <div
            className={styles.months}
          >
            {Array.from({
              length: 12
            }, (_, index) => index + 1).map((month) => {
              const monthValue = `${year}-${String(month).padStart(2, '0')}`;

              return (
                <Button
                  key={month}
                  ref={month === (selectedMonth || 1) ? selected : undefined}
                  variant={value === monthValue ? 'primary' : 'ghost'}
                  aria-label={`${year}년 ${month}월`}
                  aria-pressed={value === monthValue}
                  onClick={() => {
                    if (mode === 'month') { choose(monthValue); return; }
                    setMonth(month);
                    setChoosingMonth(false);
                  }}
                >
                  {month}
                  월
                </Button>
              );
            })}
          </div>
        ) : (
          <div
            className={styles.days}
          >
            {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
              <span
                key={day}
              >
                {day}
              </span>
            ))}
            {Array.from({
              length: offset
            }, (_, index) => (
              <span
                key={`blank-${index}`}
              />
            ))}
            {Array.from({
              length: days
            }, (_, index) => index + 1).map((day) => {
              const date = `${monthValue}-${String(day).padStart(2, '0')}`;
              return (
                <Button
                  key={date}
                  ref={date === value || (!value.startsWith(monthValue) && day === 1) ? selected : undefined}
                  variant={date === value ? 'primary' : 'ghost'}
                  size={'sm'}
                  aria-label={`${year}년 ${month}월 ${day}일`}
                  aria-pressed={date === value}
                  onClick={() => choose(date)}
                >
                  {day}
                </Button>
              );
            })}
          </div>
        )}
        {clearable && (
          <Button
            variant={'text'}
            size={'sm'}
            onClick={() => choose('')}
          >
            전체 기간
          </Button>
        )}
      </div>
    </div>
  );
}
