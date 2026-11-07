import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { ListBox } from './ListBox';
import { NumberInput, clampToStep } from './NumberInput';
import { RadioGroup } from './RadioGroup';
import { Tabs } from './Tabs';

afterEach(cleanup);

describe('Button', () => {
  it('is pressed with Enter and Space from the keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Aceptar</Button>);
    await user.tab();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('calls onClick and stays silent while disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Aplicar</Button>);
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    rerender(
      <Button onClick={onClick} disabled>
        Aplicar
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

function TabsHarness() {
  const [selected, setSelected] = useState('a');
  return (
    <Tabs
      id="t"
      label="Semanas"
      selectedId={selected}
      onSelect={setSelected}
      tabs={[
        { id: 'a', label: 'Uno', content: <p>Panel uno</p> },
        { id: 'b', label: 'Dos', content: <p>Panel dos</p> },
        { id: 'c', label: 'Tres', content: <p>Panel tres</p> },
      ]}
    />
  );
}

describe('Tabs', () => {
  it('shows the panel of the clicked tab', () => {
    render(<TabsHarness />);
    fireEvent.click(screen.getByRole('tab', { name: 'Dos' }));
    expect(screen.getByRole('tabpanel').textContent).toBe('Panel dos');
  });

  it('moves between tabs with the arrow keys, wrapping at the ends', () => {
    render(<TabsHarness />);
    const first = screen.getByRole('tab', { name: 'Uno' });
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Tres' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Tres' }));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    expect(screen.getByRole('tabpanel').textContent).toBe('Panel uno');
  });

  it('keeps only the selected tab in the Tab order', () => {
    render(<TabsHarness />);
    const tabIndexes = screen.getAllByRole('tab').map((tab) => tab.tabIndex);
    expect(tabIndexes).toEqual([0, -1, -1]);
  });
});

function NumberHarness({ onChange }: { onChange: (value: number) => void }) {
  const [value, setValue] = useState(5);
  return (
    <NumberInput
      id="n"
      label="Cantidad"
      value={value}
      min={0}
      max={10}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('NumberInput', () => {
  it('steps with the arrow keys and the arrow buttons', () => {
    const onChange = vi.fn();
    render(<NumberHarness onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: 'Cantidad' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disminuir' }));
    expect(onChange.mock.calls.map(([value]) => value)).toEqual([6, 7, 6]);
  });

  it('applies typed text on Enter, clamped to the range', () => {
    const onChange = vi.fn();
    render(<NumberHarness onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: 'Cantidad' }) as HTMLInputElement;
    fireEvent.input(input, { target: { value: '42' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(10);
    expect(input.value).toBe('10');
  });

  it('drops text that is not a number when focus leaves', () => {
    const onChange = vi.fn();
    render(<NumberHarness onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: 'Cantidad' }) as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('5');
  });

  it('rounds to the step and clamps to the range', () => {
    expect(clampToStep(7, 0, 100, 5)).toBe(5);
    expect(clampToStep(8, 0, 100, 5)).toBe(10);
    expect(clampToStep(-3, 0, 100, 5)).toBe(0);
    expect(clampToStep(140, 0, 100, 5)).toBe(100);
  });
});

describe('RadioGroup', () => {
  it('reports the chosen value and keeps disabled options out', () => {
    const onChange = vi.fn();
    render(
      <RadioGroup
        name="h"
        label="Alto:"
        value="1"
        onChange={onChange}
        options={[
          { value: '1', label: 'Uno' },
          { value: '2', label: 'Dos' },
          { value: '3', label: 'Tres', disabled: true },
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText('Dos'));
    expect(onChange).toHaveBeenCalledWith('2');
    expect((screen.getByLabelText('Tres') as HTMLInputElement).disabled).toBe(true);
  });
});

function ListHarness() {
  const [selected, setSelected] = useState<string | null>('1');
  return (
    <ListBox
      id="l"
      label="Pisos"
      selectedId={selected}
      onSelect={setSelected}
      items={[
        { id: '1', label: 'Piso 1' },
        { id: '2', label: 'Piso 2' },
        { id: '3', label: 'Piso 3' },
      ]}
    />
  );
}

describe('ListBox', () => {
  const selectedLabel = () => screen.getByRole('option', { selected: true }).textContent;

  it('selects with a click', () => {
    render(<ListHarness />);
    fireEvent.click(screen.getByRole('option', { name: 'Piso 3' }));
    expect(selectedLabel()).toBe('Piso 3');
  });

  it('moves the selection with arrows, Home and End', () => {
    render(<ListHarness />);
    const list = screen.getByRole('listbox', { name: 'Pisos' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(selectedLabel()).toBe('Piso 2');
    fireEvent.keyDown(list, { key: 'End' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(selectedLabel()).toBe('Piso 3');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(selectedLabel()).toBe('Piso 1');
    expect(list.getAttribute('aria-activedescendant')).toBe('l-option-1');
  });
});
