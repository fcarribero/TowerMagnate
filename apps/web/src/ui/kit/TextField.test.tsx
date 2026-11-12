import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextField, type TextFieldProps } from './TextField';

afterEach(cleanup);

function show(props: Partial<TextFieldProps> = {}) {
  const onChange = vi.fn();
  render(<TextField id="name" label="Nombre" value="Ana" onChange={onChange} {...props} />);
  return { field: screen.getByLabelText('Nombre') as HTMLInputElement, onChange };
}

describe('TextField', () => {
  it('reports typed text through onChange', async () => {
    const { field, onChange } = show({ value: '' });
    await userEvent.type(field, 'B');
    expect(onChange).toHaveBeenCalledWith('B');
  });

  it('calls onBlur once with the current value when the field loses focus', async () => {
    const onBlur = vi.fn();
    const { field } = show({ onBlur });
    await userEvent.click(field);
    await userEvent.tab();
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledWith('Ana');
  });

  it('calls onEnter once with the current value on Enter', async () => {
    const onEnter = vi.fn();
    const { field } = show({ onEnter });
    await userEvent.click(field);
    await userEvent.keyboard('{Enter}');
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledWith('Ana');
  });

  it('ignores other keys for onEnter', async () => {
    const onEnter = vi.fn();
    const { field } = show({ onEnter });
    await userEvent.click(field);
    await userEvent.keyboard('{Escape}a');
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('keeps Enter from submitting a parent form when onEnter is given', async () => {
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    const onEnter = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <TextField id="name" label="Nombre" value="Ana" onChange={() => {}} onEnter={onEnter} />
        <button type="submit">Enviar</button>
      </form>,
    );
    await userEvent.click(screen.getByLabelText('Nombre'));
    await userEvent.keyboard('{Enter}');
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('still submits a parent form on Enter without onEnter', async () => {
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <TextField id="name" label="Nombre" value="Ana" onChange={() => {}} />
        <button type="submit">Enviar</button>
      </form>,
    );
    await userEvent.click(screen.getByLabelText('Nombre'));
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('works as before without the hooks', () => {
    const { field } = show();
    fireEvent.blur(field);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field.value).toBe('Ana');
  });

  it('shows a placeholder', () => {
    const { field } = show({ value: '', placeholder: 'Oficinista' });
    expect(field.placeholder).toBe('Oficinista');
  });
});
