'use client';

import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type KeyboardEvent,
  type ReactNode
} from 'react';
import type { Option } from '@/shared/lib/options';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  FormField,
  getFieldDescription,
  type FormFieldOptions
} from '../form-field/formField';
import styles from './selectDropdown.module.css';

export interface SelectDropdownOption extends Option {
  icon?: ReactNode;
  iconPosition?: 'start' | 'end';
  searchKeywords?: readonly string[];
}

export interface SelectDropdownProps extends Omit<ComponentPropsWithRef<'input'>, 'children' | 'type' | 'value' | 'defaultValue' | 'onChange' | 'size'>, FormFieldOptions {
  options: readonly SelectDropdownOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  layout?: 'list' | 'grid';
  searchLayout?: 'list' | 'grid';
  iconPosition?: 'start' | 'end';
  clearable?: boolean;
  emptyMessage?: string;
}

/** 표시 이름과 별칭만 검색하며 내부 선택값을 검색 결과의 이름으로 노출하지 않습니다. */
function normalizeSearch(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase();
}

/** 선택 입력 아래에 목록을 고정하고 화면 폭·모바일 키보드에 맞춰 스크롤 높이를 제한합니다. */
function positionMenu(input: HTMLInputElement, menu: HTMLDivElement) {
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
  let bounds = input.parentElement!.getBoundingClientRect();
  // 화면 하단·키보드 환경에서도 입력 아래에 후보 한 줄을 확보하도록 입력을 스크롤합니다.
  if (viewportBottom - bounds.bottom < 120 && bounds.top > viewportTop + 24) {
    input.scrollIntoView({
      block: 'start',
      inline: 'nearest',
      behavior: 'instant'
    });
    bounds = input.parentElement!.getBoundingClientRect();
  }
  const width = Math.min(bounds.width, viewportWidth - 16);

  menu.style.width = `${width}px`;
  menu.style.left = `${Math.max(viewportLeft + 8, Math.min(bounds.left, viewportLeft + viewportWidth - width - 8))}px`;
  menu.style.top = `${bounds.bottom + 6}px`;
  menu.style.maxHeight = `${Math.max(44, Math.min(360, viewportBottom - bounds.bottom - 14))}px`;
}

/** 검색 초안과 확정 선택을 분리해 타이핑·취소는 기존 값을 유지하고 옵션 선택만 호출자에 전달합니다. */
export function SelectDropdown({
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
  value,
  defaultValue = '',
  onChange,
  onBlur,
  onFocus,
  onClick,
  onKeyDown,
  placeholder = '선택하거나 검색해주세요',
  required,
  disabled,
  readOnly,
  layout = 'list',
  searchLayout = layout,
  iconPosition = 'start',
  clearable = !required,
  emptyMessage = '검색 결과가 없어요.',
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  ...inputProps
}: SelectDropdownProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const menuId = `${controlId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [activeValue, setActiveValue] = useState('');
  const selectedValue = value ?? internalValue;
  const selectedOption = options.find((option) => option.value === selectedValue);
  const normalizedQuery = normalizeSearch(query ?? '');
  const visibleOptions = options.filter((option) => [option.label, ...option.searchKeywords ?? []]
    .some((text) => normalizeSearch(text).includes(normalizedQuery)));
  const enabledOptions = visibleOptions.filter((option) => !option.disabled);
  const activeOption = enabledOptions.find((option) => option.value === activeValue)
    ?? enabledOptions.find((option) => option.value === selectedValue)
    ?? enabledOptions[0];
  const expanded = isOpen && !disabled && !readOnly;
  const displayIcon = query === null ? selectedOption?.icon : undefined;
  const selectedIconPosition = selectedOption?.iconPosition ?? iconPosition;
  const invalid = error ? true : ariaInvalid;
  const describedBy = getFieldDescription({
    controlId,
    description,
    error,
    describedBy: ariaDescribedBy
  });
  const optionId = (optionValue: string) => `${controlId}-option-${encodeURIComponent(optionValue)}`;

  useImperativeHandle(ref, () => inputRef.current!);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const menu = menuRef.current;
    if (!expanded || !input || !menu) return;

    // Popover 최상위 영역에서 표시해 부모 카드·모달의 overflow에도 목록이 잘리지 않게 합니다.
    if (typeof menu.showPopover === 'function') menu.showPopover();
    else menu.removeAttribute('popover');
    const updatePosition = () => positionMenu(input, menu);
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(input.parentElement!);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);

    /** 목록 밖 클릭은 검색만 취소하고 확정 선택은 변경하지 않습니다. */
    function closeOutside(event: PointerEvent) {
      if (!input?.parentElement?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery(null);
      }
    }

    document.addEventListener('pointerdown', closeOutside);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
      document.removeEventListener('pointerdown', closeOutside);
      if (typeof menu.hidePopover === 'function' && menu.matches(':popover-open')) menu.hidePopover();
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded || !activeOption || !menuRef.current) return;
    const option = document.getElementById(`${controlId}-option-${encodeURIComponent(activeOption.value)}`);
    const menu = menuRef.current;
    if (!option) return;

    // 페이지를 움직이지 않고 현재 후보만 팝업의 스크롤 영역 안으로 이동합니다.
    if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop;
    if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
    }
  }, [expanded, activeOption, controlId]);

  useEffect(() => {
    const nativeForm = nativeRef.current?.form;
    if (!nativeForm || value !== undefined) return;

    /** 비제어 선택은 form reset에서 기본값으로 돌아가며 검색 상태도 함께 폐기합니다. */
    function resetValue() {
      setInternalValue(defaultValue);
      setQuery(null);
      setIsOpen(false);
    }

    nativeForm.addEventListener('reset', resetValue);
    return () => nativeForm.removeEventListener('reset', resetValue);
  }, [value, defaultValue]);

  /** 목록을 열 때 검색을 비워 전체를 표시하고 현재 선택을 탐색의 시작점으로 유지합니다. */
  function openMenu(fromEnd = false) {
    if (disabled || readOnly) return;
    setQuery(null);
    const enabled = options.filter((option) => !option.disabled);
    setActiveValue(enabled.find((option) => option.value === selectedValue)?.value
      ?? enabled[fromEnd ? enabled.length - 1 : 0]?.value ?? '');
    setIsOpen(true);
    inputRef.current?.focus({
      preventScroll: true
    });
    inputRef.current?.select();
  }

  /** 검색어를 선택값으로 저장하지 않으며 활성 선택지만 확정해 호출자에게 전달합니다. */
  function selectValue(nextValue: string) {
    const option = options.find((entry) => entry.value === nextValue);
    if (disabled || readOnly || (!nextValue && required) || (nextValue && (!option || option.disabled))) return;
    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
    setQuery(null);
    setIsOpen(false);
    inputRef.current?.focus({
      preventScroll: true
    });
  }

  /** 한글 조합과 입력 편집은 유지하고 위아래 키로 탐색·Enter로 확정·Escape로 검색을 취소합니다. */
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229 || disabled || readOnly) return;
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      setQuery(null);
      return;
    }
    if (event.key === 'Tab') {
      setIsOpen(false);
      setQuery(null);
      return;
    }
    if (event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!expanded) {
        openMenu(event.key === 'ArrowUp');
        return;
      }
      const index = enabledOptions.findIndex((option) => option.value === activeOption?.value);
      const nextIndex = Math.max(0, Math.min(index + (event.key === 'ArrowUp' ? -1 : 1), enabledOptions.length - 1));
      setActiveValue(enabledOptions[nextIndex]?.value ?? '');
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!expanded) openMenu();
      else if (activeOption) selectValue(activeOption.value);
    }
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
      readOnly={readOnly}
      invalid={invalid}
    >
      <input
        ref={nativeRef}
        className={styles['native-value']}
        type={'text'}
        name={name}
        form={form}
        value={selectedValue}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        tabIndex={-1}
        aria-hidden={'true'}
        onChange={() => {}}
        onInvalid={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      />
      {displayIcon && selectedIconPosition === 'start' && (
        <span
          className={styles['selected-icon']}
          aria-hidden={'true'}
        >
          {displayIcon}
        </span>
      )}
      <input
        {...inputProps}
        ref={inputRef}
        id={controlId}
        type={'text'}
        role={'combobox'}
        className={[styles.input, className].filter(Boolean).join(' ')}
        value={query ?? selectedOption?.label ?? ''}
        placeholder={placeholder}
        autoComplete={'off'}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy ?? (label ? `${controlId}-label` : undefined)}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        aria-required={required}
        aria-expanded={expanded}
        aria-controls={expanded ? menuId : undefined}
        aria-haspopup={'listbox'}
        aria-autocomplete={'list'}
        aria-activedescendant={expanded && activeOption ? optionId(activeOption.value) : undefined}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented && !expanded) openMenu();
        }}
        onFocus={(event) => {
          event.currentTarget.select();
          onFocus?.(event);
        }}
        onBlur={(event) => {
          composingRef.current = false;
          setIsOpen(false);
          setQuery(null);
          onBlur?.(event);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveValue('');
          setIsOpen(true);
        }}
        onCompositionStart={(event) => {
          composingRef.current = true;
          inputProps.onCompositionStart?.(event);
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          inputProps.onCompositionEnd?.(event);
        }}
        onKeyDown={handleKeyDown}
      />
      {displayIcon && selectedIconPosition === 'end' && (
        <span
          className={styles['selected-icon']}
          aria-hidden={'true'}
        >
          {displayIcon}
        </span>
      )}
      {clearable && !required && selectedValue && !readOnly && (
        <Button
          variant={'ghost'}
          size={'sm'}
          iconOnly
          disabled={disabled}
          aria-label={`${label ?? ariaLabel ?? '선택'} 선택 해제`}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => selectValue('')}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      )}
      <Button
        className={styles['toggle-button']}
        variant={'ghost'}
        size={'sm'}
        iconOnly
        tabIndex={-1}
        disabled={disabled || readOnly}
        aria-label={`${label ?? ariaLabel ?? '선택'} 목록 ${expanded ? '닫기' : '열기'}`}
        aria-expanded={expanded}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          if (!expanded) openMenu();
          else {
            setIsOpen(false);
            setQuery(null);
          }
        }}
        leadingIcon={(
          <ServiceIcon
            name={'chevron'}
            direction={'down'}
            strokeWidth={2}
          />
        )}
      />
      <div
        ref={menuRef}
        id={menuId}
        className={styles.menu}
        popover={'manual'}
        role={'listbox'}
        aria-label={label ?? ariaLabel ?? '선택 목록'}
        aria-hidden={!expanded}
        data-open={expanded}
        data-layout={normalizedQuery ? searchLayout : layout}
      >
        {visibleOptions.map((option) => (
          <div
            key={option.value}
            id={optionId(option.value)}
            className={styles.option}
            role={'option'}
            aria-selected={selectedValue === option.value}
            aria-disabled={option.disabled || undefined}
            data-active={activeOption?.value === option.value || undefined}
            data-icon-position={option.iconPosition ?? iconPosition}
            onPointerDown={(event) => event.preventDefault()}
            onPointerMove={(event) => {
              if (event.pointerType === 'mouse' && !option.disabled) setActiveValue(option.value);
            }}
            onClick={() => {
              if (expanded) selectValue(option.value);
            }}
          >
            {option.icon && (
              <span
                className={styles['option-icon']}
                aria-hidden={'true'}
              >
                {option.icon}
              </span>
            )}
            <span
              className={styles['option-label']}
            >
              {option.label}
            </span>
            {selectedValue === option.value && (
              <ServiceIcon
                name={'check'}
                className={styles.check}
                strokeWidth={2}
              />
            )}
          </div>
        ))}
        {!visibleOptions.length && (
          <p
            className={styles.empty}
            role={'status'}
          >
            {emptyMessage}
          </p>
        )}
      </div>
    </FormField>
  );
}
