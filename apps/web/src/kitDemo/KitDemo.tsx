import { useEffect, useState } from 'preact/hooks';
import { isShortcutBlocked } from '../input/keyboard';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  DecisionDialog,
  Dropdown,
  InfoDialog,
  ListBox,
  NumberInput,
  ProgressBar,
  RadioGroup,
  ScrollArea,
  Tabs,
  TextField,
  Tooltip,
  Window,
  WindowLayer,
  dialogRequest,
  useWindowManager,
  type OpenRequest,
} from '../ui/kit';
import { t } from '../ui/strings';
import { useUiScale } from '../ui/uiScale';
import { DemoStatusPanel } from './DemoStatusPanel';

const DEMO_WINDOWS: readonly (OpenRequest & { label: string })[] = [
  { id: 'buttons', label: 'Botones', position: { x: 16, y: 16 } },
  { id: 'fields', label: 'Campos', position: { x: 240, y: 16 } },
  { id: 'tabs', label: 'Pestañas', position: { x: 16, y: 200 } },
  { id: 'list', label: 'Lista', position: { x: 480, y: 16 } },
  { id: 'progress', label: 'Barras', position: { x: 640, y: 16 } },
  { id: 'decision', label: 'Decisión', position: { x: 300, y: 260 } },
  { id: 'finance', label: 'Finanzas', position: { x: 520, y: 200 } },
];

const DIALOGS = [
  { id: 'bomb', label: t('dialog.bomb.title') },
  { id: 'newTower', label: t('dialog.newTower.title') },
  { id: 'changeFilm', label: t('dialog.changeFilm.title') },
  { id: 'welcome', label: t('dialog.welcome.title') },
];

const RANSOM = '$300.000';

const FLOORS = Array.from({ length: 12 }, (_, index) => ({
  id: String(index + 1),
  label: t('ui.levelFloor', { n: index + 1 }),
}));

const NOTICES = Array.from({ length: 10 }, (_, index) => `Aviso ${index + 1}`);

type LobbyHeight = '1' | '2' | '3';

const SPEEDS = [
  { value: 'slow', label: 'Lenta' },
  { value: 'medium', label: 'Media' },
  { value: 'fast', label: 'Rápida' },
  { value: 'locked', label: 'Bloqueada', disabled: true },
];

let nextUnit = 1;

function Launcher({ uiScale, lastAnswer }: { uiScale: number; lastAnswer: string }) {
  const manager = useWindowManager();
  const [zoom, setZoom] = useState(2);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isShortcutBlocked(event)) {
        return;
      }
      if (event.key === '+') {
        setZoom((current) => Math.min(current + 1, 4));
      } else if (event.key === '-') {
        setZoom((current) => Math.max(current - 1, 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const openUnit = (): void => {
    const number = nextUnit++;
    manager.open({
      id: `unit:${number}`,
      kind: 'unit',
      position: { x: 120 + number * 16, y: 80 + number * 16 },
    });
  };

  return (
    <nav class="kit-demo__launcher" aria-label="UI kit">
      {DEMO_WINDOWS.map(({ label, ...request }) => (
        <Button key={request.id} onClick={() => manager.open(request)}>
          {label}
        </Button>
      ))}
      <Button onClick={openUnit}>Unidad nueva</Button>
      {DIALOGS.map(({ id, label }) => (
        <Tooltip key={id} text={['Abre el diálogo', label]}>
          <Button onClick={() => manager.open(dialogRequest(id))}>{label}</Button>
        </Tooltip>
      ))}
      <output class="kit-demo__answer" aria-live="polite">
        {lastAnswer}
      </output>
      <output class="kit-demo__zoom" aria-live="polite">
        Escala {uiScale} · Zoom {zoom}x (+ / -)
      </output>
    </nav>
  );
}

function DemoDialogs({ onAnswer }: { onAnswer: (answer: string) => void }) {
  const manager = useWindowManager();
  const answer = (id: string, text: string): void => {
    manager.close(id);
    onAnswer(text);
  };

  return (
    <>
      <DecisionDialog
        id="bomb"
        title={t('dialog.bomb.title')}
        body={t('dialog.bomb.body', { ransom: RANSOM })}
        deadline={t('dialog.deadlineToday', { time: '13:00' })}
        options={[
          { id: 'pay', label: t('dialog.bomb.pay', { ransom: RANSOM }) },
          { id: 'refuse', label: t('dialog.bomb.refuse') },
        ]}
        onAnswer={(option) => answer('bomb', `Respuesta: ${option}`)}
      />
      <ConfirmDialog
        id="newTower"
        title={t('dialog.newTower.title')}
        body={t('dialog.newTower.body')}
        actionLabel={t('dialog.newTower.confirm')}
        onConfirm={() => answer('newTower', 'Respuesta: confirm')}
        onCancel={() => answer('newTower', 'Respuesta: cancel')}
      />
      <ConfirmDialog
        id="changeFilm"
        title={t('dialog.changeFilm.title')}
        body={t('dialog.changeFilm.body')}
        actionLabel={t('dialog.changeFilm.confirm')}
        actionTone="plain"
        onConfirm={() => answer('changeFilm', 'Respuesta: confirm')}
        onCancel={() => answer('changeFilm', 'Respuesta: cancel')}
      />
      <InfoDialog
        id="welcome"
        title={t('dialog.welcome.title')}
        body={t('dialog.welcome.body')}
        onClose={() => answer('welcome', 'Respuesta: accept')}
      />
    </>
  );
}

function DemoWindows() {
  const manager = useWindowManager();
  const [name, setName] = useState('');
  const [nameEvent, setNameEvent] = useState('');
  const [rent, setRent] = useState(10);
  const [height, setHeight] = useState<LobbyHeight>('1');
  const [tab, setTab] = useState('week');
  const [floor, setFloor] = useState<string | null>('1');
  const [clicks, setClicks] = useState(0);
  const [speed, setSpeed] = useState('medium');
  const [collectRent, setCollectRent] = useState(true);

  const unitWindows = manager.stack.windows.filter((window) => window.kind === 'unit');

  return (
    <>
      <Window id="buttons" title="Botones" subtitle="Acciones de ejemplo" width={200}>
        <p>Clics: {clicks}</p>
        <div class="kit-demo__row">
          <Tooltip text={[t('ui.apply'), 'Suma un clic']}>
            <Button onClick={() => setClicks(clicks + 1)}>{t('ui.apply')}</Button>
          </Tooltip>
          <Button disabled>{t('ui.discard')}</Button>
        </div>
        <div class="kit-demo__row">
          <Button onClick={() => manager.close('buttons')}>{t('ui.cancel')}</Button>
          <Button isDefault onClick={() => manager.close('buttons')}>
            {t('ui.accept')}
          </Button>
        </div>
        <div class="kit-demo__row">
          <Button isPrimary onClick={() => manager.close('buttons')}>
            Construir
          </Button>
        </div>
      </Window>

      <Window id="fields" title="Campos" width={220}>
        <TextField
          id="demo-name"
          label="Nombre"
          value={name}
          maxLength={24}
          hint="Hasta 24 caracteres"
          error={name.trim() === '' ? 'Escribe un nombre' : undefined}
          onChange={setName}
          onEnter={(value) => setNameEvent(`Enter: ${value}`)}
          onBlur={(value) => setNameEvent(`Blur: ${value}`)}
        />
        <output class="kit-demo__answer" aria-live="polite">
          {nameEvent}
        </output>
        <NumberInput
          id="demo-rent"
          label="Alquiler (miles)"
          value={rent}
          min={0}
          max={100}
          onChange={setRent}
        />
        <Dropdown
          id="demo-speed"
          label="Velocidad"
          value={speed}
          options={SPEEDS}
          onChange={setSpeed}
        />
        <Checkbox
          id="demo-rent-on"
          label="Cobrar alquiler"
          checked={collectRent}
          onChange={setCollectRent}
        />
        <RadioGroup<LobbyHeight>
          name="demo-height"
          label={t('ui.lobbyHeight')}
          value={height}
          onChange={setHeight}
          options={[
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3', disabled: true },
          ]}
        />
      </Window>

      <Window id="tabs" title="Pestañas" width={240}>
        <Tabs
          id="demo-tabs"
          label="Semanas"
          selectedId={tab}
          onSelect={setTab}
          tabs={[
            { id: 'week', label: 'Esta semana', content: <p>Ingresos $12.000</p> },
            { id: 'last', label: 'Semana anterior', content: <p>Ingresos $9.500</p> },
          ]}
        />
      </Window>

      <Window id="list" title="Lista" width={140}>
        <ListBox
          id="demo-floors"
          label="Pisos"
          items={FLOORS}
          selectedId={floor}
          onSelect={setFloor}
        />
        <p>{floor === null ? '' : t('ui.levelFloor', { n: floor })}</p>
      </Window>

      <Window id="progress" title="Barras" width={180}>
        <ProgressBar id="demo-stars" label="Estrellas" value={3} max={5} valueText="3 de 5" />
        <ProgressBar id="demo-empty" label="Vacía" value={0} />
        <ScrollArea label="Avisos de ejemplo" maxHeight={56}>
          {NOTICES.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </ScrollArea>
      </Window>

      <Window id="decision" title="Decisión" closable={false} width={220}>
        <p>Esta ventana no tiene botón de cerrar y Esc no la cierra.</p>
        <div class="kit-demo__row">
          <Button onClick={() => manager.close('decision')}>{t('ui.accept')}</Button>
          <Button isDefault onClick={() => manager.close('decision')}>
            {t('ui.cancel')}
          </Button>
        </div>
      </Window>

      <Window id="finance" title="Finanzas" tone="green" width={200}>
        <p>Ñandú, ¿qué hacés? ¡Sí! ÁÉÍÓÚ Ü ü</p>
      </Window>

      {unitWindows.map((window) => (
        <Window key={window.id} id={window.id} title={`Unidad ${window.id.split(':')[1]}`}>
          <p>Hasta 4 abiertas; la quinta cierra la más vieja.</p>
        </Window>
      ))}
    </>
  );
}

export function KitDemo() {
  const { scale, tooSmall } = useUiScale();
  const [lastAnswer, setLastAnswer] = useState('');

  if (tooSmall) {
    return <p class="kit-demo__too-small">{t('ui.viewportTooSmall')}</p>;
  }

  return (
    <div class="kit-demo">
      <WindowLayer class="kit-demo__view" uiScale={scale}>
        <Launcher uiScale={scale} lastAnswer={lastAnswer} />
        <DemoWindows />
        <DemoDialogs onAnswer={setLastAnswer} />
      </WindowLayer>
      <DemoStatusPanel />
    </div>
  );
}
