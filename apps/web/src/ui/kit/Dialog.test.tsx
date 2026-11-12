import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { t } from '../strings';
import { Button } from './Button';
import { ConfirmDialog, DecisionDialog, InfoDialog, dialogRequest } from './Dialog';
import { Window } from './Window';
import { WindowLayer, useWindowManager } from './WindowLayer';

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 200, offsetHeight: 100 });

afterEach(cleanup);

function OpenOnMount({ id, dialog }: { id: string; dialog?: boolean }) {
  const manager = useWindowManager();
  useEffect(() => {
    manager.open(dialog === true ? dialogRequest(id) : { id, position: { x: 10, y: 10 } });
  }, []);
  return null;
}

function Layer({ children, dialogId }: { children: ComponentChildren; dialogId: string }) {
  return (
    <WindowLayer>
      <OpenOnMount id="finance" />
      <Window id="finance" title="Finanzas">
        <Button>Detrás</Button>
      </Window>
      <OpenOnMount id={dialogId} dialog />
      {children}
    </WindowLayer>
  );
}

function frameOf(title: string): HTMLElement {
  return screen.getByText(title, { selector: 'span' }).closest('section') as HTMLElement;
}

describe('DecisionDialog', () => {
  const options = [
    { id: 'pay', label: t('dialog.bomb.pay', { ransom: '$300.000' }) },
    { id: 'refuse', label: t('dialog.bomb.refuse') },
  ];

  function renderBomb(onAnswer = vi.fn()) {
    render(
      <Layer dialogId="bomb">
        <DecisionDialog
          id="bomb"
          title={t('dialog.bomb.title')}
          body={t('dialog.bomb.body', { ransom: '$300.000' })}
          deadline={t('dialog.deadlineToday', { time: '13:00' })}
          options={options}
          onAnswer={onAnswer}
        />
      </Layer>,
    );
    return onAnswer;
  }

  it('shows the deadline and puts the default option last, focused', () => {
    renderBomb();
    expect(screen.getByText('Respondé antes de las 13:00')).toBeTruthy();
    const buttons = Array.from(
      frameOf('Amenaza de bomba').querySelectorAll('.tm-dialog__buttons button'),
    );
    expect(buttons.map((button) => button.textContent)).toEqual(['Pagar $300.000', 'No pagar']);
    expect(buttons[1]?.classList.contains('is-default')).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('is 280 wide with a hazard stripe and an alert title', () => {
    renderBomb();
    const frame = frameOf('Amenaza de bomba');
    expect(frame.style.width).toBe('calc(280 * var(--tm-px))');
    expect(frame.querySelector('.tm-window__stripe')).not.toBeNull();
    expect(frame.classList.contains('tm-window--dialog-info')).toBe(false);
  });

  it('has no close button and stays open on Esc', () => {
    const onAnswer = renderBomb();
    expect(frameOf('Amenaza de bomba').querySelector('.tm-window__close')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('answers with the clicked option', () => {
    const onAnswer = renderBomb();
    fireEvent.click(screen.getByRole('button', { name: 'Pagar $300.000' }));
    expect(onAnswer).toHaveBeenCalledWith('pay');
  });

  it('stays above a window that is clicked later', () => {
    renderBomb();
    fireEvent.pointerDown(frameOf('Finanzas'));
    const dialogZ = Number(frameOf('Amenaza de bomba').style.zIndex);
    expect(dialogZ).toBeGreaterThan(Number(frameOf('Finanzas').style.zIndex));
  });

  it('opens centered in the view', () => {
    renderBomb();
    expect(frameOf('Amenaza de bomba').style.left).toBe('300px');
    expect(frameOf('Amenaza de bomba').style.top).toBe('250px');
  });
});

describe('ConfirmDialog', () => {
  function renderConfirm() {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <Layer dialogId="newTower">
        <ConfirmDialog
          id="newTower"
          title={t('dialog.newTower.title')}
          body={t('dialog.newTower.body')}
          actionLabel={t('dialog.newTower.confirm')}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </Layer>,
    );
    return { onConfirm, onCancel };
  }

  it('puts the safe button on the right with focus', () => {
    renderConfirm();
    const buttons = Array.from(
      frameOf('Torre nueva').querySelectorAll('.tm-dialog__buttons button'),
    );
    expect(buttons.map((button) => button.textContent)).toEqual(['Demoler y empezar', 'Cancelar']);
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('paints the action button red and leaves Cancelar plain', () => {
    renderConfirm();
    const [action, cancel] = Array.from(
      frameOf('Torre nueva').querySelectorAll('.tm-dialog__buttons button'),
    );
    expect(action?.classList.contains('is-default')).toBe(true);
    expect(cancel?.classList.contains('is-default')).toBe(false);
  });

  it('leaves the action button plain with the plain tone', () => {
    render(
      <Layer dialogId="changeFilm">
        <ConfirmDialog
          id="changeFilm"
          title={t('dialog.changeFilm.title')}
          body={t('dialog.changeFilm.body')}
          actionLabel={t('dialog.changeFilm.confirm')}
          actionTone="plain"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </Layer>,
    );
    const buttons = Array.from(
      frameOf('Cambiar película').querySelectorAll('.tm-dialog__buttons button'),
    );
    expect(buttons.some((button) => button.classList.contains('is-default'))).toBe(false);
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('chooses the safe option with Esc and has no close button', () => {
    const { onConfirm, onCancel } = renderConfirm();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(frameOf('Torre nueva').querySelector('.tm-window__close')).toBeNull();
  });

  it('runs the action from its button', () => {
    const { onConfirm } = renderConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Demoler y empezar' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('is modal: blocks the UI behind and keeps Tab inside', async () => {
    const user = userEvent.setup();
    renderConfirm();
    expect(screen.getByRole('alertdialog', { name: 'Torre nueva' })).toBeTruthy();
    expect(document.querySelector('.tm-modal-backdrop')).not.toBeNull();
    const inside = Array.from(frameOf('Torre nueva').querySelectorAll('button'));
    for (let step = 0; step < 5; step++) {
      await user.tab();
      expect(inside).toContain(document.activeElement);
    }
    await user.tab({ shift: true });
    expect(inside).toContain(document.activeElement);
  });

  it('keeps focus inside after a click on the backdrop', async () => {
    const user = userEvent.setup();
    renderConfirm();
    const inside = Array.from(frameOf('Torre nueva').querySelectorAll('button'));
    const backdrop = document.querySelector('.tm-modal-backdrop') as HTMLElement;
    await user.pointer({ keys: '[MouseLeft]', target: backdrop });
    expect(inside).toContain(document.activeElement);
    for (let step = 0; step < 4; step++) {
      await user.tab({ shift: true });
      expect(inside).toContain(document.activeElement);
    }
  });

  it('brings Tab back inside when focus was lost to the page', async () => {
    const user = userEvent.setup();
    renderConfirm();
    const inside = Array.from(frameOf('Torre nueva').querySelectorAll('button'));
    act(() => (document.activeElement as HTMLElement).blur());
    expect(document.activeElement).toBe(document.body);
    await user.tab({ shift: true });
    expect(inside).toContain(document.activeElement);
  });

  it('pulls focus back when something behind tries to take it', () => {
    renderConfirm();
    const behind = within(frameOf('Finanzas')).getByRole('button', { name: 'Detrás' });
    act(() => behind.focus());
    expect(frameOf('Torre nueva').contains(document.activeElement)).toBe(true);
  });

  it('gives focus back to where it was when it closes', () => {
    function Harness() {
      const manager = useWindowManager();
      return (
        <>
          <Button onClick={() => manager.open(dialogRequest('changeFilm'))}>Abrir</Button>
          <ConfirmDialog
            id="changeFilm"
            title={t('dialog.changeFilm.title')}
            body={t('dialog.changeFilm.body')}
            actionLabel={t('dialog.changeFilm.confirm')}
            onConfirm={() => manager.close('changeFilm')}
            onCancel={() => manager.close('changeFilm')}
          />
        </>
      );
    }
    render(
      <WindowLayer>
        <Harness />
      </WindowLayer>,
    );
    const opener = screen.getByRole('button', { name: 'Abrir' });
    act(() => opener.focus());
    fireEvent.click(opener);
    expect(document.activeElement?.textContent).toBe('Cancelar');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.activeElement).toBe(opener);
  });
});

describe('InfoDialog', () => {
  it('closes with Aceptar, Esc or the close button', () => {
    const onClose = vi.fn();
    render(
      <Layer dialogId="welcome">
        <InfoDialog
          id="welcome"
          title={t('dialog.welcome.title')}
          body={t('dialog.welcome.body')}
          onClose={onClose}
        />
      </Layer>,
    );
    expect(document.activeElement?.textContent).toBe('Aceptar');
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(within(frameOf('Bienvenida')).getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('can require its button, with no close button and no Esc', () => {
    const onClose = vi.fn();
    render(
      <Layer dialogId="protocolMismatch">
        <InfoDialog
          id="protocolMismatch"
          title="Tower Magnate"
          body={t('dialog.protocolMismatch.body')}
          buttonLabel={t('dialog.protocolMismatch.reload')}
          closable={false}
          modal
          onClose={onClose}
        />
      </Layer>,
    );
    expect(within(frameOf('Tower Magnate')).queryByRole('button', { name: 'Cerrar' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Recargar' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
