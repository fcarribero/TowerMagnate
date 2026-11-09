import {
  unpackCar,
  type CarView,
  type ClientEvent,
  type CommandType,
  type DecisionKind,
  type EventId,
  type EventView,
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

const ALARM_KINDS: readonly DecisionKind[] = ['bomb', 'fire'];

/** Alert notices that play their alarm in place of the notice sound. */
const ALARM_NOTICE_TRIGGERS: Partial<Record<string, SfxTrigger>> = {
  'news.bombThreat': 'event.bomb',
  'news.fire': 'event.fire',
};

const ALARM_START_NOTICES: Partial<Record<string, DecisionKind>> = {
  'news.bombThreat': 'bomb',
  'news.fire': 'fire',
};

/** Notices that end the threat or the fire, and with it the alarm (sound.md section 3). */
const ALARM_END_NOTICES: Partial<Record<string, DecisionKind>> = {
  'news.bombPaid': 'bomb',
  'news.bombFound': 'bomb',
  'news.bombExploded': 'bomb',
  'news.fireOut': 'fire',
  'news.fireHelicopter': 'fire',
};

function isAlarmTrigger(trigger: SfxTrigger): boolean {
  return trigger === 'event.bomb' || trigger === 'event.fire';
}

function eventViewKind(view: EventView): DecisionKind {
  return view.kind === 'decision' ? view.decision : view.disaster;
}

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

export interface SfxSink {
  play(trigger: SfxTrigger): void;
  startLoop(trigger: SfxTrigger): void;
  stopLoop(trigger: SfxTrigger): void;
}

/** A playing alarm. The event id is null while only the alert notice has arrived. */
interface Alarm {
  eventId: EventId | null;
}

/**
 * Turns the client's server traffic into sound triggers. The client API calls
 * `commandSent` for each queued command and `serverMessage` for each message.
 */
export class SfxDirector {
  private readonly pendingCommands = new Map<string, CommandType>();
  private readonly carDoors = new Map<string, CarView['doors']>();
  private readonly alarms = new Map<DecisionKind, Alarm>();

  constructor(private readonly sink: SfxSink) {}

  commandSent(queued: QueuedCommand): void {
    this.pendingCommands.set(queued.id, queued.command.type);
  }

  serverMessage(message: ServerMessage): void {
    switch (message.t) {
      case 'snapshot':
        this.carDoors.clear();
        this.trackCars(message.p.cars);
        this.stopAlarmsMissingFrom(message.p.activeEvents);
        this.startAlarmsForOpenDecisions(message.p.activeEvents);
        return;
      case 'delta':
        if (this.trackCars(message.p.cars.map(unpackCar))) {
          this.sink.play('elevator.arrive');
        }
        if (message.p.activeEvents !== undefined) {
          this.stopAlarmsMissingFrom(message.p.activeEvents);
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
      this.sink.play(trigger);
    }
  }

  private events(events: ClientEvent[]): void {
    for (const event of events) {
      this.alarmEvent(event);
    }
    for (const trigger of triggersForEvents(events)) {
      if (!isAlarmTrigger(trigger)) {
        this.sink.play(trigger);
      }
    }
  }

  private alarmEvent(event: ClientEvent): void {
    switch (event.type) {
      case 'decisionOpened':
        this.startAlarm(event.kind, event.eventId);
        return;
      case 'decisionClosed':
        this.stopAlarmOfEvent(event.eventId);
        return;
      case 'news':
        this.alarmNotice(event.key);
        return;
      default:
        return;
    }
  }

  private alarmNotice(key: string): void {
    const started = ALARM_START_NOTICES[key];
    if (started !== undefined) {
      this.startAlarm(started, null);
    }
    const ended = ALARM_END_NOTICES[key];
    if (ended !== undefined) {
      this.stopAlarm(ended);
    }
  }

  private startAlarm(kind: DecisionKind, eventId: EventId | null): void {
    const playing = this.alarms.get(kind);
    if (playing !== undefined) {
      playing.eventId ??= eventId;
      return;
    }
    this.alarms.set(kind, { eventId });
    this.sink.startLoop(ALARM_TRIGGERS[kind]);
  }

  private stopAlarm(kind: DecisionKind): void {
    if (this.alarms.delete(kind)) {
      this.sink.stopLoop(ALARM_TRIGGERS[kind]);
    }
  }

  private stopAlarmOfEvent(eventId: EventId): void {
    for (const [kind, alarm] of this.alarms) {
      if (alarm.eventId === eventId) {
        this.stopAlarm(kind);
      }
    }
  }

  private stopAlarmsMissingFrom(views: EventView[]): void {
    for (const [kind, alarm] of this.alarms) {
      const stillActive = views.some((view) =>
        alarm.eventId === null ? eventViewKind(view) === kind : view.id === alarm.eventId,
      );
      if (!stillActive) {
        this.stopAlarm(kind);
      }
    }
  }

  /** After a reload only an open decision brings the alarm back, not a search or a fire alone. */
  private startAlarmsForOpenDecisions(views: EventView[]): void {
    for (const kind of ALARM_KINDS) {
      const decision = views.find((view) => view.kind === 'decision' && view.decision === kind);
      if (decision !== undefined) {
        this.startAlarm(kind, decision.id);
      }
    }
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
