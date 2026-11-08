import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { serverMessage, type EventView } from '@tower-magnate/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientStore } from '../../model/clientStore';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { delta, snapshot } from '../../testing/protocolFixtures';
import { WindowLayer } from '../kit/WindowLayer';
import { DecisionDialogs } from './DecisionDialogs';

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 260, offsetHeight: 140 });

afterEach(cleanup);

const bomb: EventView = {
  kind: 'decision',
  id: 'e2',
  decision: 'bomb',
  deadlineStep: snapshot.step + 200,
  options: ['pay', 'refuse'],
  ransom: 300_000,
};

function renderDialogs(activeEvents: EventView[] = [], closedIds: ReadonlySet<string> = new Set()) {
  const store = new ClientStore({ requestResync: () => undefined });
  store.applySnapshot({ ...snapshot, activeEvents });
  const onAnswer = vi.fn();
  const view = render(
    <WindowLayer>
      <DecisionDialogs store={store} onAnswer={onAnswer} closedIds={closedIds} />
    </WindowLayer>,
  );
  return { store, onAnswer, view };
}

describe('DecisionDialogs', () => {
  it('opens the dialog for a decision that arrives in a delta', () => {
    const { store } = renderDialogs();
    expect(screen.queryByText('Amenaza de bomba')).toBeNull();

    act(() => {
      store.receive(
        serverMessage('delta', delta({ step: snapshot.step + 1, activeEvents: [bomb] })),
      );
    });

    expect(screen.getByText('Amenaza de bomba')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pagar $300.000' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'No pagar' })).toBeTruthy();
    expect(screen.getByText(/^Respondé antes de/)).toBeTruthy();
  });

  it('reopens a decision that is still open in the snapshot', () => {
    renderDialogs([bomb]);
    expect(screen.getByText('Amenaza de bomba')).toBeTruthy();
  });

  it('sends the answer and closes the dialog', () => {
    const { onAnswer } = renderDialogs([bomb]);

    fireEvent.click(screen.getByRole('button', { name: 'No pagar' }));

    expect(onAnswer).toHaveBeenCalledWith('e2', 'refuse');
    expect(screen.queryByText('Amenaza de bomba')).toBeNull();
  });

  it('closes the dialog when the server closes the decision', () => {
    const { store, onAnswer, view } = renderDialogs([bomb]);
    expect(screen.getByText('Amenaza de bomba')).toBeTruthy();

    view.rerender(
      <WindowLayer>
        <DecisionDialogs store={store} onAnswer={onAnswer} closedIds={new Set(['e2'])} />
      </WindowLayer>,
    );

    expect(screen.queryByText('Amenaza de bomba')).toBeNull();
  });
});
