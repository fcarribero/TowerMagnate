export interface CheckboxProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  name?: string;
  disabled?: boolean;
}

/** A native checkbox, so Space and form submission work as the browser does. */
export function Checkbox({ id, label, checked, onChange, name, disabled = false }: CheckboxProps) {
  return (
    <label class="tm-checkbox" for={id}>
      <input
        id={id}
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span class="tm-checkbox__mark" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}
