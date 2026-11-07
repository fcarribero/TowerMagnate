/**
 * Every visible Spanish text, by the keys of docs/design/ui.md section 12.
 */
const STRINGS = {
  'ui.ruins': 'Escombros',
  'ui.mainLobby': 'Lobby principal',
  'ui.skyLobby': 'Lobby del cielo',
  'ui.size': '{w} x {h} casilleros',
  'ui.sizeTransport': '8 casilleros, une 2 pisos',
  'ui.sizeShaft': 'Hueco de {w}, hasta 30 pisos',
  'ui.sizeShaftExpress': 'Hueco de 6',
  'ui.pricePerCell': '{price} por casillero',
  'ui.priceShaft': '{shaft} + {car} por cabina',
  'ui.lockedStars': 'Se desbloquea con {n} estrellas',
  'ui.lobbyHeight': 'Alto:',
  'ui.lobbyHeightLocked': 'Alto fijado por el lobby existente',
  'ui.mainLobbyWarning': 'La altura del lobby principal no se puede cambiar después.',
  'ui.shaftSpan': '{n} pisos',
  'ui.menu': 'Menú',
  'ui.date': '{weekday} {day} de {month}, año {year}',
  'ui.population': 'Población {n}',
  'ui.towerRank': 'TORRE',
  'ui.zoomIn': 'Acercar',
  'ui.zoomOut': 'Alejar',
  'ui.soundOn': 'Sonido: sí',
  'ui.soundOff': 'Sonido: no',
  'ui.newTower': 'Empezar una torre nueva',
  'ui.logout': 'Cerrar sesión',
  'ui.viewportTooSmall': 'Agrandá la ventana del navegador para jugar.',
  'ui.close': 'Cerrar',
  'ui.accept': 'Aceptar',
  'ui.cancel': 'Cancelar',
  'ui.apply': 'Aplicar',
  'ui.discard': 'Descartar',
  'ui.center': 'Centrar',
  'ui.see': 'Ver',
  'ui.goneFromTower': 'Ya no está en la torre.',
  'ui.levelFloor': 'Piso {n}',
  'ui.levelBasement': 'S{n}',
  'ui.levelCathedral': 'Catedral',
  'ui.columns': 'casilleros {x0} a {x1}',
  'ui.increase': 'Aumentar',
  'ui.decrease': 'Disminuir',
  'ui.serverOffline': 'Sin conexión con el servidor',

  'calendar.weekday.0': 'Lunes',
  'calendar.weekday.1': 'Martes',
  'calendar.weekday.2': 'Miércoles',
  'calendar.weekday.3': 'Jueves',
  'calendar.weekday.4': 'Viernes',
  'calendar.weekday.5': 'Sábado',
  'calendar.weekday.6': 'Domingo',
  'calendar.weekdayShort.0': 'Lun',
  'calendar.weekdayShort.1': 'Mar',
  'calendar.weekdayShort.2': 'Mié',
  'calendar.weekdayShort.3': 'Jue',
  'calendar.weekdayShort.4': 'Vie',
  'calendar.weekdayShort.5': 'Sáb',
  'calendar.weekdayShort.6': 'Dom',
  'calendar.month.1': 'enero',
  'calendar.month.2': 'febrero',
  'calendar.month.3': 'marzo',
  'calendar.month.4': 'abril',
  'calendar.month.5': 'mayo',
  'calendar.month.6': 'junio',
  'calendar.month.7': 'julio',
  'calendar.month.8': 'agosto',
  'calendar.month.9': 'septiembre',
  'calendar.month.10': 'octubre',
  'calendar.month.11': 'noviembre',
  'calendar.month.12': 'diciembre',
} as const;

export type StringKey = keyof typeof STRINGS;

export type StringParams = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** Looks up a text and fills its `{name}` placeholders. Unknown placeholders stay as written. */
export function t(key: StringKey, params: StringParams = {}): string {
  return STRINGS[key].replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}

export function hasString(key: string): key is StringKey {
  return Object.hasOwn(STRINGS, key);
}

export function stringKeys(): StringKey[] {
  return Object.keys(STRINGS) as StringKey[];
}
