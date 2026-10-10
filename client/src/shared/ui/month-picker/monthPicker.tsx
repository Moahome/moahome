'use client';

import {
  useEffect,
  useId,
  useRef,
  useState
} from 'react';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './monthPicker.module.css';

/** 브라우저 기본 달력 대신 연도와 12개월을 선택하고 닫을 때 선택 버튼으로 포커스를 돌려줍니다. */
export function MonthPicker({ label, value, onChange, clearable = false }: {
  label: string;
  value: string;
  onChange: (month: string) => void;
  clearable?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(value.slice(0, 4)) || new Date().getFullYear());
  const selectedMonth = Number(value.slice(5));

  useEffect(() => {
    if (!open) return;
    selected.current?.focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);

    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function choose(month: string) {
    onChange(month);
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
      </span>
      <Button
        ref={trigger}
        variant={'outline'}
        tone={'neutral'}
        className={styles.trigger}
        aria-label={`${label}: ${value ? `${value.slice(0, 4)}년 ${selectedMonth}월` : '전체 기간'}`}
        aria-haspopup={'dialog'}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setYear(Number(value.slice(0, 4)) || new Date().getFullYear());
          setOpen((previous) => !previous);
        }}
      >
        <ServiceIcon
          name={'closing'}
          size={18}
        />
        {value ? `${value.slice(0, 4)}년 ${selectedMonth}월` : '전체 기간'}
        <ServiceIcon
          name={'chevron'}
          direction={'down'}
          size={16}
        />
      </Button>
      {open && (
        <div
          id={id}
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
              aria-label={'이전 연도'}
              disabled={year <= 1000}
              onClick={() => setYear(year - 1)}
            >
              <ServiceIcon
                name={'chevron'}
                direction={'left'}
                size={18}
              />
            </Button>
            <strong
              aria-live={'polite'}
            >
              {year}
              년
            </strong>
            <Button
              variant={'ghost'}
              iconOnly
              size={'sm'}
              aria-label={'다음 연도'}
              disabled={year >= 9998}
              onClick={() => setYear(year + 1)}
            >
              <ServiceIcon
                name={'chevron'}
                size={18}
              />
            </Button>
          </div>
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
                  onClick={() => choose(monthValue)}
                >
                  {month}
                  월
                </Button>
              );
            })}
          </div>
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
      )}
    </div>
  );
}
