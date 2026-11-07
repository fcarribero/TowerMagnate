import type { ComponentChildren } from 'preact';
import { t } from '../strings';
import { Button } from './Button';
import { Window } from './Window';
import type { OpenRequest } from './windowStack';

/** Dialogs open centered and above every other window. */
export function dialogRequest(id: string): OpenRequest {
  return { id, onTop: true };
}

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
  /** Drawn as the default button and focused when the dialog opens. */
  defaultChoiceId: string;
  onChoose: (choiceId: string) => void;
  /** The choice Esc and the close button make; without one the dialog has no close button. */
  escapeChoiceId?: string;
  modal?: boolean;
  width?: number;
}

function DialogFrame({
  id,
  title,
  body,
  choices,
  defaultChoiceId,
  onChoose,
  escapeChoiceId,
  modal,
  width,
}: DialogFrameProps) {
  const closable = escapeChoiceId !== undefined;
  return (
    <Window
      id={id}
      title={title}
      closable={closable}
      modal={modal}
      width={width}
      onClose={closable ? () => onChoose(escapeChoiceId) : undefined}
    >
      {body}
      <div class="tm-dialog__buttons">
        {choices.map((choice) => {
          const isDefault = choice.id === defaultChoiceId;
          return (
            <Button
              key={choice.id}
              isDefault={isDefault}
              autoFocus={isDefault}
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
      defaultChoiceId={defaultOption?.id ?? ''}
      onChoose={onAnswer}
    />
  );
}

export interface ConfirmDialogProps {
  id: string;
  title: string;
  body: string;
  actionLabel: string;
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
      defaultChoiceId={CANCEL}
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
      defaultChoiceId={ACCEPT}
      escapeChoiceId={closable ? ACCEPT : undefined}
      onChoose={onClose}
      modal={modal}
    />
  );
}
