import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { Dropdown } from './Dropdown';
import { ListBox } from './ListBox';
import { NumberInput, clampToStep } from './NumberInput';
import { ProgressBar } from './ProgressBar';
import { RadioGroup } from './RadioGroup';
import { ScrollArea } from './ScrollArea';
import { Tabs } from './Tabs';

afterEach(cleanup);

const kitCss = readFileSync(new URL('./kit.css', import.meta.url), 'utf8');

function ruleBody(selector: string): string {
  const start = kitCss.indexOf(`${selector} {`);
  return kitCss.slice(start, kitCss.indexOf('}', start));
}

describe('Field size', () => {
  it('is 16 tall with 3 px side padding, and the invalid border stays inside', () => {
    const field = ruleBody('.tm-input');
    expect(field).toContain('box-sizing: border-box');
    expect(field).toContain('height: calc(16 * var(--tm-px))');
    expect(field).toContain('padding: 0 calc(3 * var(--tm-px))');
    expect(ruleBody(".tm-input[aria-invalid='true']")).not.toContain('height');
  });

  it('makes the number field 40 wide with arrows that add up to 16', () => {
    expect(ruleBody('.tm-number__field .tm-input')).toContain('width: calc(40 * var(--tm-px))');
    expect(ruleBody('.tm-number__arrow')).toContain('height: calc(8 * var(--tm-px))');
  });
});

describe('Button variants', () => {
  it('marks a primary button', () => {
    render(<Button isPrimary>Entrar</Button>);
    expect(screen.getByRole('button', { name: 'Entrar' }).className).toBe('tm-button is-primary');
  });
});

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

function DropdownHarness({ onSubmit }: { onSubmit?: (data: FormData) => void }) {
  const [value, setValue] = useState('a');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(new FormData(event.currentTarget));
      }}
    >
      <Dropdown
        id="d"
        name="speed"
        label="Velocidad"
        value={value}
        onChange={setValue}
        options={[
          { value: 'a', label: 'Lenta' },
          { value: 'b', label: 'Media', disabled: true },
          { value: 'c', label: 'Rápida' },
        ]}
      />
      <output>{value}</output>
    </form>
  );
}

describe('Dropdown', () => {
  it('shows the selected label and a closed list', () => {
    render(<DropdownHarness />);
    const field = screen.getByRole('combobox', { name: 'Velocidad' });
    expect(field.textContent).toBe('Lenta');
    expect(field.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens, picks with the mouse and closes', async () => {
    const user = userEvent.setup();
    render(<DropdownHarness />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option')).toHaveLength(3);
    await user.click(screen.getByRole('option', { name: 'Rápida' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox').textContent).toBe('Rápida');
  });

  it('opens with Down, skips a disabled row, picks with Enter', async () => {
    const user = userEvent.setup();
    render(<DropdownHarness />);
    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeTruthy();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('combobox').textContent).toBe('Rápida');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes with Esc without changing the value', async () => {
    const user = userEvent.setup();
    render(<DropdownHarness />);
    await user.tab();
    await user.keyboard('{Enter}{ArrowDown}{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox').textContent).toBe('Lenta');
  });

  it('closes on a press outside', async () => {
    const user = userEvent.setup();
    render(<DropdownHarness />);
    await user.click(screen.getByRole('combobox'));
    await user.click(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('ignores a disabled option and a disabled field', async () => {
    const user = userEvent.setup();
    render(<DropdownHarness />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Media' }));
    expect(screen.getByRole('combobox').textContent).toBe('Lenta');
    cleanup();
    render(
      <Dropdown
        id="x"
        label="X"
        value="a"
        options={[{ value: 'a', label: 'A' }]}
        onChange={vi.fn()}
        disabled
      />,
    );
    await user.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('submits its value with a form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = render(<DropdownHarness onSubmit={onSubmit} />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Rápida' }));
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect((onSubmit.mock.calls[0]?.[0] as FormData).get('speed')).toBe('c');
  });
});

function CheckboxHarness() {
  const [checked, setChecked] = useState(false);
  return <Checkbox id="c" label="Cobrar alquiler" checked={checked} onChange={setChecked} />;
}

describe('Checkbox', () => {
  it('is named by its label and toggles with Space', async () => {
    const user = userEvent.setup();
    render(<CheckboxHarness />);
    const box = screen.getByRole('checkbox', { name: 'Cobrar alquiler' }) as HTMLInputElement;
    await user.tab();
    await user.keyboard(' ');
    expect(box.checked).toBe(true);
    await user.keyboard(' ');
    expect(box.checked).toBe(false);
  });

  it('toggles when its label is clicked', async () => {
    const user = userEvent.setup();
    render(<CheckboxHarness />);
    await user.click(screen.getByText('Cobrar alquiler'));
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('stays unchanged while disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox id="d" label="Fija" checked={false} onChange={onChange} disabled />);
    await user.click(screen.getByText('Fija'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ScrollArea', () => {
  it('is a labelled, focusable region that limits its height', () => {
    render(
      <ScrollArea label="Avisos" maxHeight={80}>
        <p>Uno</p>
      </ScrollArea>,
    );
    const region = screen.getByRole('region', { name: 'Avisos' });
    expect(region.className).toBe('tm-scroll');
    expect(region.tabIndex).toBe(0);
    expect(region.style.maxHeight).toBe('calc(80 * var(--tm-px))');
  });

  it('has no height limit by default', () => {
    render(<ScrollArea label="Libre">x</ScrollArea>);
    expect(screen.getByRole('region').style.maxHeight).toBe('');
  });
});

describe('ProgressBar', () => {
  it('reports its value and shows the text under the bar', () => {
    render(<ProgressBar id="p" label="Estrellas" value={3} max={5} valueText="3 de 5" />);
    const bar = screen.getByRole('progressbar', { name: 'Estrellas' });
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuemax')).toBe('5');
    expect(bar.getAttribute('aria-valuetext')).toBe('3 de 5');
    expect(screen.getByText('3 de 5')).toBeTruthy();
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('60%');
  });

  it('clamps values outside the range', () => {
    const { rerender } = render(<ProgressBar id="p" label="A" value={9} max={5} />);
    expect((screen.getByRole('progressbar').firstElementChild as HTMLElement).style.width).toBe(
      '100%',
    );
    rerender(<ProgressBar id="p" label="A" value={-2} max={5} />);
    expect((screen.getByRole('progressbar').firstElementChild as HTMLElement).style.width).toBe(
      '0%',
    );
  });

  it('omits the value text slot when there is no text', () => {
    const { container } = render(<ProgressBar id="p" label="A" value={1} />);
    expect(container.querySelector('.tm-progress__value')).toBeNull();
  });
});
