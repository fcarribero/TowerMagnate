import type { ComponentChildren } from 'preact';

export interface ButtonProps {
  children?: ComponentChildren;
  onClick?: () => void;
  disabled?: boolean;
  /** The button Enter would choose; drawn with a thicker border. */
  isDefault?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  /** The main action of a form; drawn yellow. */
  isPrimary?: boolean;
  /** Takes focus when its window opens. */
  autoFocus?: boolean;
}

export function Button({
  children,
  onClick,
  disabled = false,
  isDefault = false,
  isPrimary = false,
  title,
  type = 'button',
  autoFocus,
}: ButtonProps) {
  return (
    <button
      type={type}
      class={['tm-button', isDefault && 'is-default', isPrimary && 'is-primary']
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      title={title}
      data-autofocus={autoFocus ? '' : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
