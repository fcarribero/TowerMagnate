import { useEffect, useRef, useState } from 'preact/hooks';
import { PixelArrow } from './PixelArrow';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface DropdownProps<T extends string> {
  id: string;
  label: string;
  options: readonly DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Submitted with a surrounding form under this name. */
  name?: string;
  disabled?: boolean;
  /** Keeps the label for screen readers only, when the row already names the field. */
  isLabelHidden?: boolean;
}

const MIN_ROOM_OPTIONS = 3;

/**
 * Viewport position of the open list, so a scrolling window body does not clip it.
 * The list opens upward when there is little room below the field and more above.
 */
interface ListPlace {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  '--tm-dropdown-room': string;
}

function placeList(field: HTMLElement): ListPlace {
  const rect = field.getBoundingClientRect();
  const optionHeight = (rect.height * 14) / 16;
  const roomBelow = window.innerHeight - rect.bottom;
  const roomAbove = rect.top;
  const opensUp = roomBelow < optionHeight * MIN_ROOM_OPTIONS && roomAbove > roomBelow;
  const base = {
    left: rect.left,
    width: rect.width,
    '--tm-dropdown-room': `${Math.max(opensUp ? roomAbove : roomBelow, 0)}px`,
  };
  return opensUp
    ? { ...base, bottom: window.innerHeight - rect.top }
    : { ...base, top: rect.bottom };
}

/** A select drawn with the kit: Up, Down, Home, End, Enter and Esc work on the focused field. */
export function Dropdown<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
  name,
  disabled = false,
  isLabelHidden = false,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [listBox, setListBox] = useState<ListPlace | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const justOpened = useRef(false);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const closeOnOutsidePress = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const follow = (event?: Event): void => {
      if (event?.target instanceof Node && list.current?.contains(event.target)) {
        return;
      }
      if (field.current !== null) {
        setListBox(placeList(field.current));
      }
    };
    window.addEventListener('resize', follow);
    document.addEventListener('scroll', follow, true);
    return () => {
      window.removeEventListener('resize', follow);
      document.removeEventListener('scroll', follow, true);
    };
  }, [isOpen]);

  useEffect(() => {
    const listElement = list.current;
    const option = isOpen ? document.getElementById(optionId(activeIndex)) : null;
    if (listElement === null || option === null) {
      return;
    }
    if (justOpened.current) {
      justOpened.current = false;
      listElement.scrollTop =
        option.offsetTop - (listElement.clientHeight - option.offsetHeight) / 2;
    } else if (option.offsetTop < listElement.scrollTop) {
      listElement.scrollTop = option.offsetTop;
    } else if (
      option.offsetTop + option.offsetHeight >
      listElement.scrollTop + listElement.clientHeight
    ) {
      listElement.scrollTop = option.offsetTop + option.offsetHeight - listElement.clientHeight;
    }
  }, [isOpen, activeIndex]);

  const open = (): void => {
    setListBox(field.current ? placeList(field.current) : null);
    setActiveIndex(Math.max(selectedIndex, 0));
    justOpened.current = true;
    setIsOpen(true);
  };

  const pick = (index: number): void => {
    const option = options[index];
    if (option === undefined || option.disabled) {
      return;
    }
    onChange(option.value);
    setIsOpen(false);
    field.current?.focus({ preventScroll: true });
  };

  const move = (step: 1 | -1, from = activeIndex): void => {
    let index = from + step;
    while (options[index]?.disabled) {
      index += step;
    }
    if (options[index] !== undefined) {
      setActiveIndex(index);
    }
  };

  const moveToEdge = (edge: 'first' | 'last'): void => {
    if (edge === 'first') {
      move(1, -1);
    } else {
      move(-1, options.length);
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') {
      setIsOpen(false);
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
    } else if (isOpen && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      event.stopPropagation();
      moveToEdge(event.key === 'Home' ? 'first' : 'last');
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      if (isOpen) {
        move(event.key === 'ArrowDown' ? 1 : -1);
      } else {
        open();
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isOpen) {
        pick(activeIndex);
      } else {
        open();
      }
    }
  };

  return (
    <div class="tm-dropdown" ref={root}>
      <span
        id={`${id}-label`}
        class={
          isLabelHidden ? 'tm-dropdown__label tm-dropdown__label--hidden' : 'tm-dropdown__label'
        }
      >
        {label}
      </span>
      <div class="tm-dropdown__anchor">
        <button
          ref={field}
          id={id}
          type="button"
          class="tm-dropdown__field"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={`${id}-list`}
          aria-labelledby={`${id}-label`}
          aria-activedescendant={isOpen ? optionId(activeIndex) : undefined}
          disabled={disabled}
          onClick={() => (isOpen ? setIsOpen(false) : open())}
          onKeyDown={onKeyDown}
        >
          <span class="tm-dropdown__text">{options[selectedIndex]?.label ?? ''}</span>
          <span class="tm-dropdown__arrow" aria-hidden="true">
            <PixelArrow direction="down" />
          </span>
        </button>
        {isOpen && (
          <ul
            id={`${id}-list`}
            ref={list}
            class="tm-dropdown__list"
            role="listbox"
            style={listBox === null ? undefined : { ...listBox }}
            aria-labelledby={`${id}-label`}
            onPointerDown={(event) => event.preventDefault()}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={index === selectedIndex}
                aria-disabled={option.disabled}
                class={
                  index === activeIndex ? 'tm-dropdown__option is-active' : 'tm-dropdown__option'
                }
                onPointerEnter={() => !option.disabled && setActiveIndex(index)}
                onClick={() => pick(index)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {name !== undefined && <input type="hidden" name={name} value={value} />}
    </div>
  );
}
