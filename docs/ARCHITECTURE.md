# Tower Magnate: arquitectura

Versión 0.2, 18 de noviembre de 2026.

## Resumen

El repositorio es un monorepo en TypeScript con pnpm workspaces, con cinco paquetes:

| Paquete | Qué contiene |
|---|---|
| `packages/engine` | El motor de la simulación. TypeScript puro, sin red, sin disco y sin reloj del sistema. |
| `packages/shared` | Tipos, catálogo de unidades, constantes de balance y el protocolo entre el host y la interfaz, validado con zod. |
| `packages/host` | Hace avanzar una torre con el reloj y la convierte en mensajes del protocolo: runner, fotos y deltas, inspección, mensajes de depuración. Depende de `engine` y `shared`, y no usa Node, DOM, red ni base de datos. |
| `apps/server` | Node 22 con Fastify. Tiene autenticación, persistencia en PostgreSQL y los endpoints que guardan y entregan el estado de la torre. No simula nada. |
| `apps/web` | Vite con PixiJS 8 para el corte de la torre y Preact para los paneles y ventanas. Corre la torre en un Web Worker. |

Todo se levanta local con `docker compose up`: `postgres`, `server` y `web` (en desarrollo con Vite, en producción como estáticos servidos por el server).

## Motor

El motor recibe un estado, una lista de comandos y una cantidad de pasos, y devuelve el estado nuevo y los eventos que ocurrieron. No sabe nada de usuarios ni de red. Con eso se puede probar sin frontend y sin base de datos.

- Paso fijo: 1 paso son 10 segundos del juego, o sea 8.640 pasos por día del juego, unos 9,6 pasos por segundo real.
- Es determinista: la aleatoriedad sale de un generador con semilla guardada en el estado. El mismo estado con los mismos comandos da siempre el mismo resultado.
- La fecha del juego se calcula desde el número de paso: el paso 0 es el lunes 1 de enero del año 1, 00:00 UTC. El calendario es propio y no usa `Date`, porque `Date` maneja mal los años chicos.
- Los comandos son los del jugador: construir, demoler, cambiar precio, configurar ascensor, responder a un evento, cambiar película, poner nombre.
- Cada comando se valida dentro del motor. Si es inválido se rechaza con un código de error.
- Hay un modo acelerado para tests y depuración que corre N días seguidos.

Módulos internos: calendario, torre y grilla, catálogo, economía y contratos, personas y horarios, rutas, ascensores, estrés y evaluación, estrellas, eventos.

## Servidor

- No simula torres. Guarda el estado que manda el navegador y lo devuelve cuando el jugador abre el juego.
- Persistencia: PostgreSQL. Cada torre tiene hasta 3 fotos en `tower_snapshots`. Una foto nueva se guarda como el JSON del estado comprimido con gzip (`state_gz`). Las filas viejas siguen con `state` en `jsonb` y se leen igual.
- Sesión de juego: `POST /api/tower/play` crea un token nuevo en `towers.play_token` y devuelve `{ token, state }` con la última foto, o una torre nueva si nunca se guardó. Cada llamada invalida el token anterior, así que solo hay una pestaña activa por torre.
- Guardado: `PUT /api/tower/state` recibe el estado en gzip y el token en el encabezado `X-Play-Token`. Responde 409 si el token ya no es el vigente, 413 sobre 4 MB comprimido o 32 MB descomprimido, y 400 si el estado no se puede leer con `deserializeState`. El token se revisa y la foto se escribe en la misma transacción. El servidor no compara pasos: un paso menor es válido después de un reinicio o de un salto de reloj de depuración.
- Autenticación: registro y login con usuario y contraseña. Las contraseñas se guardan con argon2id. La sesión es una cookie `httpOnly`, `SameSite=Lax`, con un token aleatorio guardado en la tabla `sessions`. No vence por tiempo; se borra al cerrar sesión.
- API REST para registro, login, logout, ver la cuenta, crear o reiniciar la torre, y las dos rutas de arriba. Reiniciar borra las fotos y el token de juego, así que una pestaña abierta recibe 409 en su próximo guardado.
- Costo por jugador: un guardado cada 30 segundos como máximo. Una torre completa (15.000 personas) pesa 2,6 MB de JSON y 197 KB con gzip; la torre de la porción vertical pesa 102 KB y 16 KB. El servidor descomprime, parsea y migra para validar, y escribe una fila.

## Cliente web

- El navegador corre la simulación. `apps/web/src/worker/` es un Web Worker que crea el host de `packages/host` con el estado y el token que entrega `POST /api/tower/play`, avanza la torre cada 100 ms y manda deltas cada 200 ms. La página habla con el Worker por `postMessage`, con los mismos mensajes del protocolo (`hello`, `command`, `viewport`, `inspect`, `ping`, mensajes de depuración y las respuestas del host).
- El Worker guarda el estado: cada 30 segundos, 5 segundos después del último comando aceptado o del último cambio de depuración, y de inmediato cuando la pestaña pasa a segundo plano. Un guardado fallido se reintenta a los 5, 15 y 30 segundos y después cada 60. Pasados 2 minutos sin guardar, la barra de estado muestra "No se pudo guardar la partida".
- Si el servidor responde 409, el Worker se detiene y la página muestra que la torre se abrió en otra ventana, con el botón "Jugar acá" que vuelve a pedir `/api/tower/play`.
- Si el estado guardado tiene un `schemaVersion` más nuevo que el del motor del cliente, no se arranca el Worker y se pide recargar la página.
- Solo el bundle del Worker importa `host` y `engine`. El bundle principal importa de `engine` únicamente el calendario y el clima.
- La interfaz dibuja lo que manda el host e interpola el movimiento de cabinas y personas entre deltas.
- PixiJS dibuja el corte de la torre con sprites en atlas, cámara con scroll, zoom entero y cortes por pantalla visible para no dibujar 100 pisos de golpe.
- Preact dibuja la barra de herramientas, el panel de estado, las ventanas, los avisos y las pantallas de login y registro.
- El estilo visual de los paneles imita las ventanas de escritorio de los 90.
- La torre solo avanza con la pestaña abierta. Al cerrarla se pausa y no se recupera ese tiempo. Cerrar la pestaña puede costar hasta 30 segundos de tiempo simulado y las acciones de los últimos 5 segundos.

## Assets

- `assets/sprites/`: PNG fuente generados por scripts en `tools/art/`. Un script arma los atlas.
- `assets/sfx/`: efectos de sonido generados con ElevenLabs por un script en `tools/sfx/`. La clave se lee de `~/.claude/elevenlabs.env` o de un `.env` local que no se sube al repo.

## Calidad

- Vitest para unit tests del motor y del servidor. El motor tiene tests de escenarios: construir una torre chica, correr una semana y comprobar dinero, población y contratos.
- Playwright para pruebas de punta a punta del cliente contra el stack de docker.
- ESLint y Prettier.
- GitHub Actions corre lint, tipos y tests en cada PR.

## Ramas y versiones

- `master` es la rama estable y `develop` la de integración.
- Cada tarea se trabaja en una rama creada desde `develop` con el código y el título, por ejemplo `TM-12-weekly-lease-cycle`.
- Idioma: código, nombres de archivo, commits, ramas y PRs en inglés. La interfaz del juego en español.
- Al final de cada sprint se crea `release/vX.Y.Z` desde `develop` y se abre un PR a `master`. Versiones `0.N.0`, donde N es el sprint, hasta `1.0.0` con el alcance completo. Las correcciones del release candidate se hacen en esa rama y después se vuelven a mezclar en `develop`.
- Los commits y los PR no mencionan herramientas de generación de código. Los comentarios en el código son cortos y solo aparecen cuando algo no se entiende leyendo. Se prefiere código largo y claro antes que código compacto y difícil de leer.
