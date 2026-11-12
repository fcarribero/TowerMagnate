import type { Page } from '@playwright/test';
import { frameTowerLeft, type SweepContext } from './context';
import type { ScreenInfo } from './plan';

export interface Screen extends ScreenInfo {
  run(context: SweepContext): Promise<void>;
}

const OFFICE_COLUMN = 110;
const SHAFT_COLUMN = 101;
const OFFICE_LEVEL = '5';
const SKY_LEVEL = '12';
const SKY_COLUMN = 118;
const EVENT_STEPS = 30;
const PERSON_CLICK_ATTEMPTS = 6;
const PERSON_FEET_OFFSET = 8;
const PERSON_WINDOW_WAIT_MS = 400;
const PERSON_SEARCH_TIME = '08:40';
const PERSON_SEARCH_STEPS = 60;
const NEXT_FRAME_MS = 300;
const HELD_LOAD_MS = 600;
const WAIT_MS = 10_000;
const DIALOG = '.tm-window--dialog, [role=alertdialog]';

async function waitFor(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: WAIT_MS });
}

/** Page scripts are plain strings: a compiled function would carry helpers the page does not have. */
const KEEP_SOCKETS_CONNECTING = `
  window.WebSocket = class {
    constructor() { this.readyState = 0; }
    send() {}
    close() {}
  };
`;

function closeSocketsWith(code: number): string {
  return `
    window.WebSocket = class {
      constructor() {
        this.readyState = 0;
        setTimeout(() => this.onclose && this.onclose({ code: ${code} }), 100);
      }
      send() {}
      close() {}
    };
  `;
}

async function onExtraPage(
  context: SweepContext,
  screen: string,
  prepare: (page: Page) => Promise<unknown>,
  readySelector: string,
): Promise<void> {
  const page = await context.extraPage();
  try {
    await page.setViewportSize((await context.page.viewportSize()) ?? { width: 1024, height: 640 });
    await prepare(page);
    await page.goto('/');
    await waitFor(page, readySelector);
    await page.waitForTimeout(HELD_LOAD_MS);
    await context.shot(screen, page.locator('html'));
  } catch (error) {
    await context.shot(`extra-failed-${screen}`, page.locator('html')).catch(() => undefined);
    throw error;
  } finally {
    await page.close();
  }
}

async function useTool(context: SweepContext, name: string): Promise<void> {
  await context.page.getByRole('button', { name, exact: true }).click();
}

async function pressButton(context: SweepContext, name: RegExp | string): Promise<void> {
  await context.page
    .getByRole('button', typeof name === 'string' ? { name, exact: true } : { name })
    .click();
}

async function findPerson(context: SweepContext): Promise<void> {
  const { page } = context;
  await context.debug('debug.setClock', { day: 0, time: PERSON_SEARCH_TIME });
  await context.debug('debug.fastForward', { steps: PERSON_SEARCH_STEPS });
  for (let attempt = 0; attempt < PERSON_CLICK_ATTEMPTS; attempt++) {
    const spot = await context.findPersonSpot();
    await page.mouse.click(
      await context.pixelX(spot.x),
      (await context.levelY(String(spot.level))) + PERSON_FEET_OFFSET,
    );
    await page.waitForTimeout(PERSON_WINDOW_WAIT_MS);
    if ((await page.getByText('Estrés', { exact: true }).count()) > 0) return;
    await context.closeWindows();
  }
  throw new Error('could not open the window of a walking person');
}

async function eventDialog(
  context: SweepContext,
  screen: string,
  kind: string,
  answer: RegExp | string,
) {
  await context.debug('debug.forceEvent', { kind });
  await waitFor(context.page, DIALOG);
  await context.shot(screen);
  await pressButton(context, answer);
}

async function eventVisual(context: SweepContext, screen: string, kind: string): Promise<void> {
  await context.debug('debug.forceEvent', { kind });
  await context.debug('debug.fastForward', { steps: EVENT_STEPS });
  await context.page.waitForTimeout(NEXT_FRAME_MS);
  await context.shot(screen);
}

async function openWindow(context: SweepContext, screen: string, button: string): Promise<void> {
  await context.openWindowButton(button);
  await waitFor(context.page, '.tm-window');
  await context.shot(screen);
  await context.closeWindows();
}

export const SCREENS: Screen[] = [
  {
    id: 'login',
    state: 'logged out, login form',
    async run(context) {
      await context.page.goto('/');
      await waitFor(context.page, '.auth-screen');
      await context.shot('login');
    },
  },
  {
    id: 'register',
    state: 'register form',
    async run(context) {
      await context.page.getByRole('button', { name: '¿No tenés cuenta? Creá una' }).click();
      await waitFor(context.page, '#auth-password-repeat');
      await context.shot('register');
    },
  },
  {
    id: 'welcome-dialog',
    state: 'new player, welcome dialog',
    async run(context) {
      await context.startGame();
      await waitFor(context.page, DIALOG);
      await context.shot('welcome-dialog');
      await pressButton(context, 'Aceptar');
    },
  },
  {
    id: 'game',
    state: 'vertical slice tower, Monday 09:00, default camera',
    run: (context) => context.shot('game'),
  },
  {
    id: 'status-bar',
    state: 'status bar alone',
    run: (context) => context.shot('status-bar', context.page.locator('.status-panel')),
  },
  {
    id: 'toolbar',
    state: 'toolbar alone, Estructura category',
    run: (context) => context.shot('toolbar', context.page.locator('.tm-toolbar')),
  },
  {
    id: 'tower-chrome',
    state: 'zoom 1, lobby tool selected, pointer over a floor: ruler, ghost label',
    async run(context) {
      await frameTowerLeft(context.page);
      await useTool(context, 'Lobby');
      await context.page.mouse.move(await context.columnX(SKY_COLUMN), await context.levelY('1'));
      await context.shot('tower-chrome');
      await useTool(context, 'Lupa');
    },
  },
  {
    id: 'overlay-legend',
    state: 'Precios view with its legend',
    async run(context) {
      await pressButton(context, 'Precios');
      await context.shot('overlay-legend');
      await pressButton(context, 'Normal');
    },
  },
  {
    id: 'unit',
    state: 'office unit window',
    async run(context) {
      await context.clickTile(OFFICE_COLUMN, OFFICE_LEVEL);
      await waitFor(context.page, '.tm-window');
      await context.shot('unit');
      await context.closeWindows();
    },
  },
  {
    id: 'elevator-route',
    state: 'elevator window, Recorrido tab',
    async run(context) {
      await context.clickTile(SHAFT_COLUMN, OFFICE_LEVEL);
      await context.page.getByRole('tab', { name: 'Recorrido' }).waitFor({ timeout: WAIT_MS });
      await context.shot('elevator-route');
    },
  },
  {
    id: 'elevator-cars',
    state: 'elevator window, Cabinas tab',
    async run(context) {
      await context.page.getByRole('tab', { name: 'Cabinas' }).click();
      await context.shot('elevator-cars');
    },
  },
  {
    id: 'elevator-schedule',
    state: 'elevator window, Horarios tab',
    async run(context) {
      await context.page.getByRole('tab', { name: 'Horarios' }).click();
      await context.shot('elevator-schedule');
      await context.closeWindows();
    },
  },
  {
    id: 'person',
    state: 'person window of someone in the lobby at 09:00',
    async run(context) {
      await findPerson(context);
      await context.shot('person');
    },
  },
  {
    id: 'followed',
    state: 'Personas seguidas with one followed person',
    async run(context) {
      await context.page.locator('.tm-window input').first().fill('Ana');
      await context.page
        .getByRole('button', { name: 'Seguir', exact: true })
        .dispatchEvent('click');
      await context.closeWindows();
      await openWindow(context, 'followed', 'Seguidos');
    },
  },
  {
    id: 'finance',
    state: 'Finanzas window',
    run: (context) => openWindow(context, 'finance', 'Finanzas'),
  },
  {
    id: 'map',
    state: 'Mapa de la torre window',
    run: (context) => openWindow(context, 'map', 'Mapa'),
  },
  {
    id: 'stars',
    state: 'Estrellas window at 1 star',
    async run(context) {
      await context.page.locator('.status-panel__stars').click();
      await waitFor(context.page, '.tm-window');
      await context.shot('stars');
      await context.closeWindows();
    },
  },
  {
    id: 'toast',
    state: 'a rejected build command shows its toast',
    async run(context) {
      await useTool(context, 'Lobby');
      await context.clickTile(SKY_COLUMN, SKY_LEVEL);
      await waitFor(context.page, '.tm-toast');
      await context.shot('toast');
      await useTool(context, 'Lupa');
    },
  },
  {
    id: 'menu',
    state: 'Menú list open',
    async run(context) {
      await pressButton(context, 'Menú');
      await waitFor(context.page, '.game-menu-list');
      await context.shot('menu');
    },
  },
  {
    id: 'dialog-new-tower',
    state: 'Torre nueva confirm dialog',
    async run(context) {
      await context.page.getByRole('menuitem', { name: 'Empezar una torre nueva' }).click();
      await waitFor(context.page, DIALOG);
      await context.shot('dialog-new-tower');
    },
  },
  {
    id: 'dialog-new-tower-sure',
    state: 'Torre nueva last warning',
    async run(context) {
      await pressButton(context, 'Demoler y empezar');
      await context.page.getByText('Es la última advertencia').waitFor({ timeout: WAIT_MS });
      await context.shot('dialog-new-tower-sure');
      await pressButton(context, 'Cancelar');
    },
  },
  {
    id: 'dialog-bomb',
    state: 'forced bomb threat decision dialog',
    run: (context) => eventDialog(context, 'dialog-bomb', 'bomb', /^Pagar/),
  },
  {
    id: 'dialog-fire',
    state: 'forced fire decision dialog',
    run: (context) => eventDialog(context, 'dialog-fire', 'fire', 'No llamar'),
  },
  {
    id: 'news-line',
    state: 'news line after the forced events',
    run: (context) => context.shot('news-line', context.page.locator('.tm-news')),
  },
  {
    id: 'notices',
    state: 'Avisos window with the event notices',
    run: (context) => openWindow(context, 'notices', 'Avisos'),
  },
  {
    id: 'event-vip',
    state: 'forced VIP visit, 30 steps later',
    run: (context) => eventVisual(context, 'event-vip', 'vip'),
  },
  {
    id: 'event-santa',
    state: 'forced Santa visit, 30 steps later',
    run: (context) => eventVisual(context, 'event-santa', 'santa'),
  },
  {
    id: 'dialog-change-film',
    state: 'Cambiar película dialog from the kit demo page',
    async run(context) {
      await context.page.goto('/kit.html');
      await context.page.getByRole('button', { name: 'Cambiar película' }).click();
      await waitFor(context.page, DIALOG);
      await context.shot('dialog-change-film');
    },
  },
  {
    id: 'kit-demo',
    state: 'UI kit demo page with its windows open',
    async run(context) {
      await context.page.goto('/kit.html');
      for (const name of ['Botones', 'Campos', 'Pestañas', 'Lista', 'Barras']) {
        await pressButton(context, name);
      }
      await context.shot('kit-demo');
    },
  },
  {
    id: 'loading',
    state: 'atlases held back: Cargando gráficos',
    run: (context) =>
      onExtraPage(
        context,
        'loading',
        (page) => page.route('**/atlases/**', () => undefined),
        '.stage-message',
      ),
  },
  {
    id: 'connecting',
    state: 'socket never answers: Conectando',
    run: (context) =>
      onExtraPage(
        context,
        'connecting',
        (page) => page.addInitScript(KEEP_SOCKETS_CONNECTING),
        '.connection-box',
      ),
  },
  {
    id: 'connection-lost',
    state: 'socket closed by the server: banner',
    run: (context) =>
      onExtraPage(
        context,
        'connection-lost',
        (page) => page.addInitScript(closeSocketsWith(1011)),
        '.connection-banner',
      ),
  },
  {
    id: 'protocol-mismatch',
    state: 'socket closed with PROTOCOL_MISMATCH',
    run: (context) =>
      onExtraPage(
        context,
        'protocol-mismatch',
        (page) => page.addInitScript(closeSocketsWith(4409)),
        '.connection-dialog',
      ),
  },
  {
    id: 'session-expired',
    state: 'socket closed with NOT_AUTHENTICATED: login with notice',
    run: (context) =>
      onExtraPage(
        context,
        'session-expired',
        (page) => page.addInitScript(closeSocketsWith(4401)),
        '.auth-screen__notice',
      ),
  },
  {
    id: 'viewport-too-small',
    state: 'window under 1024x640',
    async run(context) {
      const page = await context.extraPage();
      try {
        await page.setViewportSize({ width: 800, height: 500 });
        await page.goto('/');
        await waitFor(page, '.viewport-too-small');
        await context.shot('viewport-too-small', page.locator('html'));
      } finally {
        await page.close();
      }
    },
  },
];
