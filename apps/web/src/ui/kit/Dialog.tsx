import type { ComponentChildren } from 'preact';
import { t } from '../strings';
import { Button } from './Button';
import { Window } from './Window';
import type { OpenRequest } from './windowStack';

/** Dialogs open centered and above every other window. */
export function dialogRequest(id: string): OpenRequest {
  return { id, onTop: true };
}

const DIALOG_WIDTH = 280;

export interface DialogChoice {
  id: string;
  label: string;
}

interface DialogFrameProps {
  id: string;
  title: string;
  body: ComponentChildren;
  /** Left to right. */
  choices: readonly DialogChoice[];
  /** Drawn red, as the default button. */
  redChoiceId?: string;
  /** Focused when the dialog opens. */
  focusedChoiceId: string;
  onChoose: (choiceId: string) => void;
  /** The choice Esc and the close button make; without one the dialog has no close button. */
  escapeChoiceId?: string;
  modal?: boolean;
  tone?: 'alert' | 'info';
}

function DialogFrame({
  id,
  title,
  body,
  choices,
  redChoiceId,
  focusedChoiceId,
  onChoose,
  escapeChoiceId,
  modal,
  tone = 'alert',
}: DialogFrameProps) {
  const closable = escapeChoiceId !== undefined;
  return (
    <Window
      id={id}
      title={title}
      closable={closable}
      modal={modal}
      width={DIALOG_WIDTH}
      isDialog
      dialogTone={tone}
      onClose={closable ? () => onChoose(escapeChoiceId) : undefined}
    >
      {body}
      <div class="tm-dialog__buttons">
        {choices.map((choice) => {
          return (
            <Button
              key={choice.id}
              isDefault={choice.id === redChoiceId}
              autoFocus={choice.id === focusedChoiceId}
              onClick={() => onChoose(choice.id)}
            >
              {choice.label}
            </Button>
          );
        })}
      </div>
    </Window>
  );
}

export interface DecisionDialogProps {
  id: string;
  title: string;
  body: string;
  /** Already worded, for example "Respondé antes de las 13:00". */
  deadline: string;
  /** Left to right; the last one is the default the game applies at the deadline. */
  options: readonly DialogChoice[];
  onAnswer: (optionId: string) => void;
}

/** An event the player must answer. No close button, and Esc leaves it open. */
export function DecisionDialog({
  id,
  title,
  body,
  deadline,
  options,
  onAnswer,
}: DecisionDialogProps) {
  const defaultOption = options.at(-1);
  return (
    <DialogFrame
      id={id}
      title={title}
      body={
        <>
          <p class="tm-dialog__body">{body}</p>
          <p class="tm-dialog__deadline">{deadline}</p>
        </>
      }
      choices={options}
      redChoiceId={defaultOption?.id}
      focusedChoiceId={defaultOption?.id ?? ''}
      onChoose={onAnswer}
    />
  );
}

export interface ConfirmDialogProps {
  id: string;
  title: string;
  body: string;
  actionLabel: string;
  /** Red for destructive actions; plain for an ordinary purchase. */
  actionTone?: 'danger' | 'plain';
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIRM = 'confirm';
const CANCEL = 'cancel';

/** Asks before an action. The safe button is on the right with focus, and Esc chooses it. */
export function ConfirmDialog({
  id,
  title,
  body,
  actionLabel,
  actionTone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <DialogFrame
      id={id}
      title={title}
      body={<p class="tm-dialog__body">{body}</p>}
      choices={[
        { id: CONFIRM, label: actionLabel },
        { id: CANCEL, label: t('ui.cancel') },
      ]}
      redChoiceId={actionTone === 'danger' ? CONFIRM : undefined}
      focusedChoiceId={CANCEL}
      escapeChoiceId={CANCEL}
      onChoose={(choice) => (choice === CONFIRM ? onConfirm() : onCancel())}
      modal
    />
  );
}

export interface InfoDialogProps {
  id: string;
  title: string;
  body: string;
  onClose: () => void;
  /** Defaults to "Aceptar". */
  buttonLabel?: string;
  modal?: boolean;
  /** Without a close button and Esc, for messages that must be acted on. */
  closable?: boolean;
}

const ACCEPT = 'accept';

/** A message with one button. */
export function InfoDialog({
  id,
  title,
  body,
  onClose,
  buttonLabel,
  modal,
  closable = true,
}: InfoDialogProps) {
  return (
    <DialogFrame
      id={id}
      title={title}
      body={<p class="tm-dialog__body">{body}</p>}
      choices={[{ id: ACCEPT, label: buttonLabel ?? t('ui.accept') }]}
      redChoiceId={ACCEPT}
      focusedChoiceId={ACCEPT}
      escapeChoiceId={closable ? ACCEPT : undefined}
      onChoose={onClose}
      modal={modal}
      tone="info"
    />
  );
}
