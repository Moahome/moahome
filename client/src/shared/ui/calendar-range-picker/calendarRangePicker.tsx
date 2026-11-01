'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import {
  formatMonthRange,
  getPresetMonthRange,
  isValidMonthRange,
  type MonthRangePreset
} from '@/shared/lib/month-range';
import {
  formatDateRange,
  getPresetDateRange,
  getTodayDate,
  isValidDateRange,
  type DateRangePreset
} from '@/shared/lib/date-range';
import { Button } from '@/shared/ui/button';
import { CalendarPicker } from '@/shared/ui/calendar-picker';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './calendarRangePicker.module.css';

const MONTH_PRESETS: { value: MonthRangePreset; label: string }[] = [
  {
    value: 'thisMonth',
    label: '이번 달'
  }, {
    value: 'last3Months',
    label: '최근 3개월'
  }, {
    value: 'thisYear',
    label: '올해'
  }
];
const DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  {
    value: 'thisMonth',
    label: '이번 달'
  }, {
    value: 'last3Months',
    label: '최근 3개월'
  }, {
    value: 'thisYear',
    label: '올해'
  }
];

/** 날짜·월 달력을 재사용하고 조회를 누를 때만 완성된 기간을 반영합니다. 닫으면 적용 전 선택은 버립니다. */
export function CalendarRangePicker({ mode, value, onChange, label = '조회 기간', labelHidden = false, referenceDate, disabled = false }: {
  mode: 'date' | 'month';
  value: { start: string; end: string };
  onChange: (value: { start: string; end: string }) => void;
  label?: string;
  labelHidden?: boolean;
  referenceDate?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [custom, setCustom] = useState(false);
  const [error, setError] = useState('');
  const today = referenceDate ?? getTodayDate();
  const startLabel = mode === 'month' ? '시작 월' : '시작일';
  const endLabel = mode === 'month' ? '종료 월' : '종료일';
  const presets = mode === 'month'
    ? MONTH_PRESETS.map((preset) => {
      const range = getPresetMonthRange(preset.value, today.slice(0, 7));
      return {
        label: preset.label,
        range: {
          start: range.startMonth,
          end: range.endMonth
        }
      };
    })
    : DATE_PRESETS.map((preset) => {
      const range = getPresetDateRange(preset.value, today);
      return {
        label: preset.label,
        range: {
          start: range.startDate,
          end: range.endDate
        }
      };
    });

  function formatValue(period: { start: string; end: string }) {
    return mode === 'month' ? formatMonthRange({
      startMonth: period.start,
      endMonth: period.end
    }) : formatDateRange({
      startDate: period.start,
      endDate: period.end
    });
  }

  /** 모달·본문과 뷰포트 경계 안에 배치하며 닫기 전환 중에는 내용의 조작과 읽기를 차단합니다. */
  useLayoutEffect(() => {
    const panel = popup.current;
    const button = trigger.current;
    if (!panel || !button) return;
    if (!open) {
      const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
      const timer = window.setTimeout(() => { if (panel.matches(':popover-open')) panel.hidePopover(); }, delay);
      return () => window.clearTimeout(timer);
    }
    if (!panel.matches(':popover-open')) panel.showPopover();
    function position() {
      if (!panel || !button) return;
      const anchor = button.getBoundingClientRect();
      const boundary = button.closest('dialog[open], main')?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = Math.max((viewport?.offsetLeft ?? 0) + 8, (boundary?.left ?? 0) + 8);
      const right = Math.min((viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth) - 8, (boundary?.right ?? window.innerWidth) - 8);
      const top = (viewport?.offsetTop ?? 0) + 8;
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 8;
      const width = Math.min(660, right - left);
      panel.style.width = `${width}px`;
      const below = bottom - anchor.bottom - 6;
      const above = anchor.top - top - 6;
      const openAbove = below < panel.scrollHeight && above > below;
      panel.style.maxHeight = `${Math.max(80, openAbove ? above : below)}px`;
      const height = Math.min(panel.scrollHeight, Math.max(80, openAbove ? above : below));
      panel.style.left = `${Math.max(left, Math.min(anchor.left, right - width))}px`;
      panel.style.top = `${openAbove ? anchor.top - height - 6 : anchor.bottom + 6}px`;
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(button);
    observer.observe(panel);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  /** 역전되거나 비어 있는 기간은 조회에 반영하지 않고 편집 내용을 유지합니다. */
  function apply() {
    if (!(mode === 'month' ? isValidMonthRange({
      startMonth: draft.start,
      endMonth: draft.end
    }) : isValidDateRange({
      startDate: draft.start,
      endDate: draft.end
    }))) {
      setError(`${startLabel}과 ${endLabel}을 확인해주세요. ${startLabel}은 ${endLabel}보다 늦을 수 없어요.`);
      return;
    }
    onChange(draft);
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div
      className={styles.picker}
      ref={root}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
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
        data-hidden={labelHidden || undefined}
      >
        {label}
      </span>
      <Button
        ref={trigger}
        variant={'outline'}
        tone={'neutral'}
        className={styles.trigger}
        disabled={disabled}
        aria-label={`${label}: ${formatValue(value)}`}
        aria-haspopup={'dialog'}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => { setDraft(value); setCustom(!presets.some((preset) => preset.range.start === value.start && preset.range.end === value.end)); setError(''); setOpen((previous) => !previous); }}
      >
        <ServiceIcon
          name={'closing'}
          size={18}
        />
        <span
          className={styles.value}
        >
          {formatValue(value)}
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
        ref={popup}
        popover={'manual'}
        role={'dialog'}
        aria-label={`${label} 선택`}
        aria-hidden={!open}
        inert={!open}
        data-open={open}
        className={styles.panel}
      >
        <h3>
          {label}
        </h3>
        <div
          className={styles.presets}
          role={'group'}
          aria-label={'빠른 기간 선택'}
        >
          {presets.map((preset, index) => {
            const range = preset.range;
            const selected = !custom && range.start === draft.start && range.end === draft.end;
            return (
              <Button
                key={preset.label}
                ref={index === 0 ? first : undefined}
                variant={selected ? 'primary' : 'ghost'}
                size={'sm'}
                aria-pressed={selected}
                onClick={() => { setDraft(range); setCustom(false); setError(''); }}
              >
                {preset.label}
              </Button>
            );
          })}
          <Button
            variant={custom ? 'primary' : 'ghost'}
            size={'sm'}
            aria-pressed={custom}
            onClick={() => setCustom(true)}
          >
            직접 선택
          </Button>
        </div>
        <div
          className={styles.dates}
        >
          <CalendarPicker
            mode={mode}
            label={startLabel}
            variant={'input'}
            value={draft.start}
            onChange={(start) => { setDraft((previous) => ({
              ...previous,
              start
            })); setCustom(true); setError(''); }}
          />
          <CalendarPicker
            mode={mode}
            label={endLabel}
            variant={'input'}
            value={draft.end}
            onChange={(end) => { setDraft((previous) => ({
              ...previous,
              end
            })); setCustom(true); setError(''); }}
          />
        </div>
        {error && (
          <p
            className={styles.error}
            role={'alert'}
          >
            {error}
          </p>
        )}
        <footer
          className={styles.actions}
        >
          <Button
            variant={'outline'}
            tone={'neutral'}
            onClick={() => { setOpen(false); trigger.current?.focus(); }}
          >
            취소
          </Button>
          <Button
            onClick={apply}
          >
            조회
          </Button>
        </footer>
      </div>
    </div>
  );
}
