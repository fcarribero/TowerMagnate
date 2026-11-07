# Tower Magnate: arquitectura

Versión 0.1, 6 de noviembre de 2026.

## Resumen

El repositorio es un monorepo en TypeScript con pnpm workspaces, con cuatro paquetes:

| Paquete | Qué contiene |
|---|---|
| `packages/engine` | El motor de la simulación. TypeScript puro, sin red, sin disco y sin reloj del sistema. |
| `packages/shared` | Tipos, catálogo de unidades, constantes de balance y el protocolo entre server y cliente, validado con zod. |
| `apps/server` | Node 22 con Fastify y WebSocket (`ws`). Tiene autenticación, persistencia en PostgreSQL y el runner que hace avanzar las torres. |
| `apps/web` | Vite con PixiJS 8 para el corte de la torre y Preact para los paneles y ventanas. |

Todo se levanta local con `docker compose up`: `postgres`, `server` y `web` (en desarrollo con Vite, en producción como estáticos servidos por el server).

## Motor

El motor recibe un estado, una lista de comandos y una cantidad de pasos, y devuelve el estado nuevo y los eventos que ocurrieron. No sabe nada de usuarios ni de sockets. Con eso se puede probar sin frontend y sin base de datos.

- Paso fijo: 1 paso son 10 segundos del juego, o sea 8.640 pasos por día del juego, unos 9,6 pasos por segundo real.
- Es determinista: la aleatoriedad sale de un generador con semilla guardada en el estado. El mismo estado con los mismos comandos da siempre el mismo resultado.
- La fecha del juego se calcula desde el número de paso: el paso 0 es el lunes 1 de enero del año 1, 00:00 UTC. El calendario es propio y no usa `Date`, porque `Date` maneja mal los años chicos.
- Los comandos son los del jugador: construir, demoler, cambiar precio, configurar ascensor, responder a un evento, cambiar película, poner nombre.
- Cada comando se valida dentro del motor. Si es inválido se rechaza con un código de error.
- Hay un modo acelerado para tests y depuración que corre N días seguidos.

Módulos internos: calendario, torre y grilla, catálogo, economía y contratos, personas y horarios, rutas, ascensores, estrés y evaluación, estrellas, eventos.

## Servidor

- Runner: cada torre activa se simula en memoria dentro del proceso del servidor. Un bucle avanza las torres activas al ritmo del reloj real. Una torre está activa mientras su dueño tiene al menos una conexión WebSocket abierta. Cuando se cierra la última conexión, la torre se guarda y queda en pausa; no se recupera el tiempo que pasó desconectada.
- Persistencia: PostgreSQL. Cada torre activa guarda una foto completa de su estado cada 30 segundos reales, después de cada comando del jugador, al pausarse y al cerrar el servidor. Al conectarse el dueño, el servidor carga la última foto y la torre sigue desde ahí.
- Autenticación: registro y login con usuario y contraseña. Las contraseñas se guardan con argon2id. La sesión es una cookie `httpOnly`, `SameSite=Lax`, con un token aleatorio guardado en la tabla `sessions`. No vence por tiempo; se borra al cerrar sesión.
- API REST para registro, login, logout, ver la cuenta y crear o reiniciar la torre.
- WebSocket por torre. Al conectar, el cliente recibe la foto completa. Después recibe deltas varias veces por segundo (personas, cabinas, dinero, hora) y eventos (avisos, decisiones pendientes). El cliente manda comandos y recibe su resultado.
- Escala esperada: decenas de torres en una sola máquina. Si se necesitara más, el runner se puede repartir en worker threads, pero no es parte de este alcance.

## Cliente web

- El cliente no simula nada. Dibuja lo que manda el servidor e interpola el movimiento de cabinas y personas entre deltas.
- PixiJS dibuja el corte de la torre con sprites en atlas, cámara con scroll, zoom entero y cortes por pantalla visible para no dibujar 100 pisos de golpe.
- Preact dibuja la barra de herramientas, el panel de estado, las ventanas, los avisos y las pantallas de login y registro.
- El estilo visual de los paneles imita las ventanas de escritorio de los 90.

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
