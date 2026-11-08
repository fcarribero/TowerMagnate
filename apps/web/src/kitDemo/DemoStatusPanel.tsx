import { STEPS_PER_MINUTE, stepOfDate } from '@tower-magnate/engine/calendar';
import type { Snapshot } from '@tower-magnate/shared';
import { useMemo, useState } from 'preact/hooks';
import { ClientStore } from '../model/clientStore';
import { Button } from '../ui/kit';
import { StatusPanel } from '../ui/status/StatusPanel';

const DEMO_SNAPSHOT: Snapshot = {
  step: stepOfDate({ year: 1, month: 1, day: 6, hour: 23, minute: 59 }),
  money: -12_500,
  stars: 6,
  population: 1_234,
  starRequirements: [{ requirement: 'security', met: false }],
  grid: { levels: {}, mainLobbyHeight: null },
  units: [],
  transports: [],
  shafts: [],
  cars: [],
  people: [],
  followed: [],
  activeEvents: [],
  notices: [],
  overlays: { evaluation: {}, price: {}, hotel: {} },
  finances: { thisWeek: { weekStartStep: 0, income: {}, expenses: {} }, lastWeek: null },
};

/** A status bar fed by a local store, to check it without a server. */
export function DemoStatusPanel() {
  const store = useMemo(() => {
    const demoStore = new ClientStore({ requestResync: () => undefined });
    demoStore.applySnapshot(DEMO_SNAPSHOT);
    return demoStore;
  }, []);
  const [lastAction, setLastAction] = useState('');

  const advanceMinute = (): void => {
    const latest = store.current?.latest;
    if (latest !== undefined) {
      store.applyDelta({
        step: latest.step + STEPS_PER_MINUTE,
        money: latest.money + 100_000,
        cars: [],
        people: [],
      });
    }
  };

  return (
    <div class="kit-demo__status">
      <div class="kit-demo__status-bar">
        <StatusPanel
          store={store}
          onOpenWindow={(id) => setLastAction(`ventana ${id}`)}
          onZoom={(direction) => setLastAction(`zoom ${direction}`)}
          onLogout={() => setLastAction('salir')}
        />
      </div>
      <div class="kit-demo__row">
        <Button onClick={advanceMinute}>Avanzar un minuto</Button>
        <output class="kit-demo__answer">{lastAction}</output>
      </div>
    </div>
  );
}
