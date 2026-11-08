import {
  unpackCar,
  type CarView,
  type ClientEvent,
  type CommandType,
  type DecisionKind,
  type QueuedCommand,
  type ServerMessage,
} from '@tower-magnate/shared';

/** Manifest triggers the client plays, each with the source that fires it. */
export const WIRED_TRIGGERS = {
  'build.place': 'accepted build command result',
  'build.demolish': 'accepted demolish command result',
  'money.income': 'moneyChanged event with a positive amount tied to a unit',
  'notice.show': 'news event',
  'event.bomb': 'bomb decision opened or bomb threat notice',
  'event.fire': 'fire decision opened or fire notice',
  'event.wedding': 'weddingCompleted event',
  'elevator.arrive': 'a car in a delta opens its doors',
  'ui.click': 'a click on a button in the UI layer',
} as const;

/** Manifest triggers with no client source yet. */
export const UNUSED_TRIGGERS = {
  'elevator.travel': 'loop needs the cars in view, which the client does not track yet',
  'ambience.lobby': 'loop needs the visible levels, which the client does not track yet',
  'hotel.morning': 'the server sends no hotel morning event',
} as const;

export type SfxTrigger = keyof typeof WIRED_TRIGGERS;

const COMMAND_TRIGGERS: Record<CommandType, SfxTrigger | null> = {
  buildFloor: 'build.place',
  buildLobby: 'build.place',
  buildUnit: 'build.place',
  buildTransport: 'build.place',
  buildShaft: 'build.place',
  addCar: 'build.place',
  resizeShaft: 'build.place',
  demolish: 'build.demolish',
  removeCar: 'build.demolish',
  setPrice: null,
  configureShaft: null,
  answerEvent: null,
  changeFilm: null,
  renameUnit: null,
  renamePerson: null,
  followPerson: null,
  unfollowPerson: null,
};

const ALARM_TRIGGERS: Record<DecisionKind, SfxTrigger> = {
  bomb: 'event.bomb',
  fire: 'event.fire',
};

/** Alert notices that play their alarm in place of the notice sound. */
const ALARM_NOTICE_TRIGGERS: Partial<Record<string, SfxTrigger>> = {
  'news.bombThreat': 'event.bomb',
  'news.fire': 'event.fire',
};

export const INCOME_SOUND_GAP_MS = 1000;

export function triggerForCommand(type: CommandType): SfxTrigger | null {
  return COMMAND_TRIGGERS[type];
}

function triggerForEvent(event: ClientEvent): SfxTrigger | null {
  switch (event.type) {
    case 'decisionOpened':
      return ALARM_TRIGGERS[event.kind];
    case 'news':
      return ALARM_NOTICE_TRIGGERS[event.key] ?? 'notice.show';
    case 'weddingCompleted':
      return 'event.wedding';
    case 'moneyChanged':
      return event.amount > 0 && event.unitId !== null ? 'money.income' : null;
    default:
      return null;
  }
}

/** Plays each trigger at most once per batch; an alarm replaces the notice sound. */
export function triggersForEvents(events: ClientEvent[]): SfxTrigger[] {
  const triggers = new Set<SfxTrigger>();
  for (const event of events) {
    const trigger = triggerForEvent(event);
    if (trigger !== null) {
      triggers.add(trigger);
    }
  }
  if (triggers.has('event.bomb') || triggers.has('event.fire')) {
    triggers.delete('notice.show');
  }
  return [...triggers];
}

function carKey(car: CarView): string {
  return `${car.shaftId}:${car.index}`;
}

/**
 * Turns the client's server traffic into sound triggers. The client API calls
 * `commandSent` for each queued command and `serverMessage` for each message.
 */
export class SfxDirector {
  private readonly pendingCommands = new Map<string, CommandType>();
  private readonly carDoors = new Map<string, CarView['doors']>();
  private lastIncomeAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly play: (trigger: SfxTrigger) => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  commandSent(queued: QueuedCommand): void {
    this.pendingCommands.set(queued.id, queued.command.type);
  }

  serverMessage(message: ServerMessage): void {
    switch (message.t) {
      case 'snapshot':
        this.carDoors.clear();
        this.trackCars(message.p.cars);
        return;
      case 'delta':
        if (this.trackCars(message.p.cars.map(unpackCar))) {
          this.play('elevator.arrive');
        }
        return;
      case 'commandResult':
        this.commandResult(message.p.id, message.p.ok);
        return;
      case 'events':
        this.events(message.p.events);
        return;
      default:
        return;
    }
  }

  private commandResult(id: string, ok: boolean): void {
    const type = this.pendingCommands.get(id);
    this.pendingCommands.delete(id);
    const trigger = ok && type !== undefined ? triggerForCommand(type) : null;
    if (trigger !== null) {
      this.play(trigger);
    }
  }

  private events(events: ClientEvent[]): void {
    for (const trigger of triggersForEvents(events)) {
      if (trigger === 'money.income' && !this.incomeSoundAllowed()) {
        continue;
      }
      this.play(trigger);
    }
  }

  private incomeSoundAllowed(): boolean {
    const now = this.now();
    if (now - this.lastIncomeAt < INCOME_SOUND_GAP_MS) {
      return false;
    }
    this.lastIncomeAt = now;
    return true;
  }

  /** Returns true when a known car went from closed to open doors. */
  private trackCars(cars: CarView[]): boolean {
    let arrived = false;
    for (const car of cars) {
      const key = carKey(car);
      if (this.carDoors.get(key) === 'closed' && car.doors === 'open') {
        arrived = true;
      }
      this.carDoors.set(key, car.doors);
    }
    return arrived;
  }
}
