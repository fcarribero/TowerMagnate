import type { ComponentChildren } from 'preact';

export interface ButtonProps {
  children?: ComponentChildren;
  onClick?: () => void;
  disabled?: boolean;
  /** The button Enter would choose; drawn with a thicker border. */
  isDefault?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  /** Takes focus when its window opens. */
  autoFocus?: boolean;
}

export function Button({
  children,
  onClick,
  disabled = false,
  isDefault = false,
  title,
  type = 'button',
  autoFocus,
}: ButtonProps) {
  return (
    <button
      type={type}
      class={isDefault ? 'tm-button is-default' : 'tm-button'}
      disabled={disabled}
      title={title}
      data-autofocus={autoFocus ? '' : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
