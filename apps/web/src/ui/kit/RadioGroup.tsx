export interface RadioOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface RadioGroupProps<T extends string> {
  name: string;
  label: string;
  options: readonly RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** Native radios, so arrow keys and Tab behave as the browser does. */
export function RadioGroup<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
  disabled = false,
}: RadioGroupProps<T>) {
  return (
    <fieldset class="tm-radio-group" disabled={disabled}>
      <legend class="tm-radio-group__label">{label}</legend>
      {options.map((option) => (
        <label key={option.value} class="tm-radio">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          <span class="tm-radio__mark" aria-hidden="true" />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
