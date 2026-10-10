'use client';

import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type KeyboardEvent
} from 'react';
import type { Option } from '@/shared/lib/options';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  FormField,
  getFieldDescription,
  type FormFieldOptions
} from '../form-field/formField';
import styles from './dropdown.module.css';

export type DropdownOption = Option;

export interface DropdownProps extends Omit<ComponentPropsWithRef<'button'>, 'children' | 'type' | 'value' | 'defaultValue' | 'onChange' | 'onClick' | 'onKeyDown'>, FormFieldOptions {
  options: readonly DropdownOption[];
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  clearable?: boolean;
}

/** 입력의 전체 폭에 맞춰 목록을 배치하고 아래 공간이 부족할 때만 위쪽으로 펼칩니다. */
function positionMenu(trigger: HTMLButtonElement, menu: HTMLDivElement) {
  const bounds = trigger.parentElement!.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
  const width = Math.min(bounds.width, viewportWidth - 16);
  const below = viewportBottom - bounds.bottom - 14;
  const above = bounds.top - viewportTop - 14;
  const desiredHeight = Math.min(menu.scrollHeight, 264);
  const openAbove = below < desiredHeight && above > below;
  const maxHeight = Math.max(44, Math.min(264, openAbove ? above : below));
  const height = Math.min(desiredHeight, maxHeight);

  menu.style.width = `${width}px`;
  menu.style.maxHeight = `${maxHeight}px`;
  menu.style.left = `${Math.max(8, Math.min(bounds.left, viewportWidth - width - 8))}px`;
  menu.style.top = `${openAbove ? bounds.top - height - 6 : bounds.bottom + 6}px`;
  menu.dataset.placement = openAbove ? 'top' : 'bottom';
}

/** 목록·선택 표시를 공통 스타일로 고정하고 placeholder를 실제 선택지에 포함하지 않습니다. */
export function Dropdown({
  id,
  ref,
  name,
  form,
  label,
  description,
  error,
  fieldClassName,
  className,
  options,
  placeholder = '선택해주세요',
  value,
  defaultValue = '',
  onChange,
  onBlur,
  required,
  disabled,
  clearable = !required,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-label': ariaLabel,
  ...buttonProps
}: DropdownProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const menuId = `${controlId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef({
    text: '',
    time: 0
  });
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [activeValue, setActiveValue] = useState('');
  const selectedValue = value ?? internalValue;
  const selectedOption = options.find((option) => option.value === selectedValue);
  const enabledOptions = options.filter((option) => !option.disabled);
  const activeIndex = options.findIndex((option) => option.value === activeValue);
  const invalid = error ? true : ariaInvalid;
  const describedBy = getFieldDescription({
    controlId,
    description,
    error,
    describedBy: ariaDescribedBy
  });
  const showClear = clearable && !required && Boolean(selectedValue);

  useImperativeHandle(ref, () => triggerRef.current!);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;

    if (!isOpen || !trigger || !menu) return;

    // Popover의 최상위 표시 영역을 사용해 모달의 overflow에도 목록이 잘리지 않게 합니다.
    if (typeof menu.showPopover === 'function') menu.showPopover();
    else menu.removeAttribute('popover');

    const updatePosition = () => positionMenu(trigger, menu);
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(trigger.parentElement!);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);

    /** 다른 입력을 누르면 선택을 변경하지 않고 펼친 목록만 닫습니다. */
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!trigger?.parentElement?.contains(event.target as Node)) setIsOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      if (typeof menu.hidePopover === 'function' && menu.matches(':popover-open')) menu.hidePopover();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;

    document.getElementById(`${controlId}-option-${activeIndex}`)?.scrollIntoView({
      block: 'nearest'
    });
  }, [isOpen, activeIndex, controlId]);

  useEffect(() => {
    const nativeForm = inputRef.current?.form;

    if (!nativeForm || value !== undefined) return;

    /** 비제어 선택은 기본 form reset 동작에 맞춰 최초 선택값으로 돌아갑니다. */
    function resetValue() {
      setInternalValue(defaultValue);
      setIsOpen(false);
    }

    nativeForm.addEventListener('reset', resetValue);
    return () => nativeForm.removeEventListener('reset', resetValue);
  }, [defaultValue, value]);

  /** 비활성 선택을 건너뛰고 현재 선택 또는 목록 양 끝에서 탐색을 시작합니다. */
  function openMenu(fromEnd = false) {
    if (triggerRef.current?.matches(':disabled') || enabledOptions.length === 0) return;

    const current = enabledOptions.find((option) => option.value === selectedValue);
    setActiveValue(current?.value ?? enabledOptions[fromEnd ? enabledOptions.length - 1 : 0].value);
    setIsOpen(true);
  }

  /** 선택값만 호출자에 전달하고 선택 해제는 필수 입력에 허용하지 않습니다. */
  function selectValue(nextValue: string) {
    if (triggerRef.current?.matches(':disabled') || (!nextValue && required)) return;

    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
    setIsOpen(false);
    triggerRef.current?.focus({
      preventScroll: true
    });
  }

  /** 방향키·Home/End로 탐색하고 Enter/Space는 선택, Escape는 기존 값을 유지하며 닫습니다. */
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      return;
    }

    if (event.key === 'Tab') {
      setIsOpen(false);
      return;
    }

    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!isOpen) {
        openMenu(event.key === 'ArrowUp' || event.key === 'End');
        return;
      }

      const currentIndex = enabledOptions.findIndex((option) => option.value === activeValue);
      let nextIndex = event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = enabledOptions.length - 1;
      const next = enabledOptions[Math.max(0, Math.min(nextIndex, enabledOptions.length - 1))];
      if (next) setActiveValue(next.value);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!isOpen) openMenu();
      else if (activeValue) selectValue(activeValue);
      return;
    }

    // 문자 탐색은 IME 조합과 브라우저 단축키를 가로채지 않습니다.
    if (event.key.length !== 1 || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;

    const now = performance.now();
    const previousText = now - searchRef.current.time < 700 ? searchRef.current.text : '';
    const text = `${previousText}${event.key}`.toLocaleLowerCase();
    searchRef.current = {
      text,
      time: now
    };
    const match = enabledOptions.find((option) => option.label.toLocaleLowerCase().startsWith(text));
    if (!match) return;

    event.preventDefault();
    setActiveValue(match.value);
    setIsOpen(true);
  }

  return (
    <FormField
      controlId={controlId}
      label={label}
      description={description}
      error={error}
      fieldClassName={fieldClassName}
      required={required}
      disabled={disabled}
      invalid={invalid}
    >
      <input
        ref={inputRef}
        className={styles['native-value']}
        type={'text'}
        name={name}
        form={form}
        value={selectedValue}
        required={required}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden={'true'}
        onChange={() => {}}
        onInvalid={(event) => {
          event.preventDefault();
          triggerRef.current?.focus({
            preventScroll: true
          });
        }}
      />
      <button
        {...buttonProps}
        ref={triggerRef}
        id={controlId}
        type={'button'}
        role={'combobox'}
        className={[styles.dropdown, className].filter(Boolean).join(' ')}
        disabled={disabled}
        data-placeholder={!selectedValue || undefined}
        data-clearable={showClear || undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy ?? (label ? `${controlId}-label` : undefined)}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        aria-required={required}
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup={'listbox'}
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${controlId}-option-${activeIndex}` : undefined}
        onClick={() => isOpen ? setIsOpen(false) : openMenu()}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          onBlur?.(event);
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setIsOpen(false);
        }}
      >
        <span
          className={styles.value}
        >
          {selectedOption?.label ?? (selectedValue || placeholder)}
        </span>
        <ServiceIcon
          name={'chevron'}
          className={styles['dropdown-icon']}
          direction={'down'}
          strokeWidth={2}
        />
      </button>
      {showClear && (
        <Button
          className={styles['clear-button']}
          variant={'ghost'}
          size={'sm'}
          iconOnly
          disabled={disabled}
          aria-label={`${label ?? ariaLabel ?? '선택'} 선택 해제`}
          onClick={() => selectValue('')}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      )}
      {/* 닫힘 전환이 끝날 때까지 Popover를 유지하고 닫힌 목록은 접근성과 클릭 대상에서 제외합니다. */}
      <div
        ref={menuRef}
        id={menuId}
        className={styles.menu}
        popover={'manual'}
        role={'listbox'}
        aria-label={label ?? ariaLabel ?? '선택 목록'}
        aria-hidden={!isOpen}
        data-open={isOpen}
      >
        {options.map((option, index) => (
          <div
            key={option.value}
            id={`${controlId}-option-${index}`}
            className={styles.option}
            role={'option'}
            aria-selected={selectedValue === option.value}
            aria-disabled={option.disabled || undefined}
            data-active={activeValue === option.value || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onPointerMove={() => {
              if (!option.disabled) setActiveValue(option.value);
            }}
            onClick={() => {
              if (isOpen && !option.disabled) selectValue(option.value);
            }}
          >
            <span>
              {option.label}
            </span>
            {selectedValue === option.value && (
              <ServiceIcon
                name={'check'}
                strokeWidth={2}
              />
            )}
          </div>
        ))}
      </div>
    </FormField>
  );
}
