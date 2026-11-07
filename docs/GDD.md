# Tower Magnate: documento de diseño del juego

Versión 0.1, 6 de noviembre de 2026.

## Qué es

Tower Magnate es un simulador de construcción y administración de un rascacielos que corre en el navegador. El jugador levanta pisos, coloca unidades (oficinas, departamentos, hotel, comercios, servicios), las conecta con escaleras y ascensores y cobra alquileres. La gente de la torre tiene horarios y rutinas propias, se mueve por el edificio y se estresa si los traslados son largos.

La referencia principal de mecánicas es SimTower (1994). Las secundarias son Yoot Tower y Project Highrise, solo como consulta. El juego tiene el mismo alcance que SimTower y no agrega sistemas nuevos. Las diferencias son tres: corre en tiempo real continuo, usa un calendario semanal de lunes a domingo y cobra los alquileres por adelantado con contratos.

Nombre, arte, sonido y textos son propios. No se usa ningún asset, nombre de personaje ni texto del juego original.

## Objetivos

- Reproducir el bucle de SimTower: construir, alquilar, cobrar, crecer en población y subir de estrellas hasta el rango máximo.
- La simulación corre en el servidor mientras el dueño de la torre está conectado. Si no hay nadie conectado, la torre queda en pausa y sigue desde el mismo instante en la próxima conexión.
- Cada jugador tiene una torre propia. El servidor simula muchas torres a la vez.
- El aspecto es pixel art de vista lateral en corte, con la estética de los simuladores de los 90.

## Fuera de alcance

- Multijugador en una misma torre, chat, rankings entre jugadores.
- Electricidad, agua, cañerías y necesidades de inquilinos estilo Project Highrise.
- Varios terrenos o varias torres por jugador (Yoot Tower).
- Música. Por ahora solo efectos de sonido.
- Pausa o control de velocidad para el jugador. El reloj es uno solo para todos.

## Tiempo y calendario

Un día del juego dura 15 minutos reales. Una hora del juego dura 37,5 segundos y una semana dura 1 hora y 45 minutos. El reloj es lineal, a diferencia del original que estiraba el mediodía.

El calendario es gregoriano en UTC. Toda torre nueva empieza el lunes 1 de enero del año 1 a las 00:00. Los días hábiles son de lunes a viernes y el fin de semana es sábado y domingo. Los años tienen sus 365 o 366 días y la torre puede vivir cientos de años del juego.

La interfaz muestra día de la semana, fecha, hora en formato 24 h, dinero, población y estrellas.

## Torre

- 100 pisos sobre tierra, numerados del 1 al 100. El piso 1 es el lobby principal.
- 9 subsuelos utilizables (S1 a S9). El S10 queda reservado para el túnel del subte.
- Encima del piso 100 va la catedral.
- Ancho del terreno: 375 casilleros. Cada piso se construye por casillero.
- Un piso solo se apoya sobre otro piso existente. Un subsuelo solo va debajo de otro piso.
- Los lobbies del cielo solo van en los pisos 15, 30, 45, 60, 75 y 90.
- El lobby principal no se demuele. Su ancho limita el ancho de los pisos de arriba.
- La construcción es instantánea y se paga al colocar.

## Estrellas y progresión

| Paso | Población | Requisitos extra |
|---|---|---|
| 1 a 2 estrellas | 300 | ninguno |
| 2 a 3 estrellas | 1.000 | al menos una oficina de seguridad |
| 3 a 4 estrellas | 5.000 | visita del VIP aprobada, suites de hotel, reciclaje y centro médico suficientes |
| 4 a 5 estrellas | 10.000 | estación de subte, médico y reciclaje suficientes |
| 5 estrellas a Torre | 15.000 | catedral construida y una boda completa |

La revisión de estrellas corre cada día hábil a las 17:00. Para la boda, los 40 invitados tienen que llegar a la catedral un sábado o domingo antes de las 12:30. Ahí la torre obtiene el rango máximo y se reproduce la boda.

La población se cuenta así: 6 por oficina ocupada, 3 por departamento vendido, los huéspedes presentes en el hotel y, en los comercios, los clientes del día anterior.

## Unidades y desbloqueos

| Unidad | Ancho x pisos | Costo | Gente | Estrellas |
|---|---|---|---|---|
| Piso | 1 | $500 por casillero | | 1 |
| Lobby | 1 por casillero, alto 1, 2 o 3 pisos | $5.000 por casillero | | 1 |
| Escalera | 8, une 2 pisos | $5.000 | | 1 |
| Escalera mecánica | 8, une 2 pisos | $20.000 | | 1 |
| Ascensor estándar | hueco de 4 | $200.000 + $80.000 por cabina | 21 por cabina | 1 |
| Oficina | 9 x 1 | $40.000 | 6 | 1 |
| Departamento | 16 x 1 | $80.000 | 3 | 1 |
| Comida rápida | 16 x 1 | $100.000 | clientes | 1 |
| Habitación simple | 4 x 1 | $20.000 | 1 | 2 |
| Habitación doble | 6 x 1 | $50.000 | 2 | 2 |
| Suite | 10 x 1 | $100.000 | 2 | 2 |
| Limpieza | 15 x 1 | $50.000 | 6 mucamas | 2 |
| Seguridad | 16 x 1 | $100.000 | | 2 |
| Ascensor de servicio | hueco de 4 | $100.000 + $50.000 por cabina | 21 | 2 |
| Restaurante | 24 x 1 | $200.000 | clientes | 3 |
| Local comercial | 12 x 1 | $100.000 | clientes | 3 |
| Cine | 31 x 2 | $500.000 | hasta 120 | 3 |
| Salón de fiestas | 24 x 2 | $100.000 | 50 | 3 |
| Ascensor expreso | hueco de 6 | $400.000 + $150.000 por cabina | 42 | 3 |
| Centro médico | 26 x 1 | $500.000 | | 3 |
| Rampa de estacionamiento | 16 x 1 | $50.000 | | 3 |
| Cochera | 4 x 1 | $3.000 | | 3 |
| Centro de reciclaje | 25 x 2 | $500.000 | | 3 |
| Estación de subte | 30 x 3 | $1.000.000 | | 4 |
| Catedral | 28 x 4 | $3.000.000 | 40 invitados | 5 |

Reglas de ubicación:

- Cocheras, rampa, reciclaje y subte van solo en subsuelos. La rampa ocupa una sola columna y las cocheras tienen que conectarse a ella. El reciclaje nuevo va pegado a uno existente. El subte va en el subsuelo más bajo.
- Las escaleras mecánicas solo van en pisos de lobby, comercio, entretenimiento o habitaciones simples.
- El ascensor expreso solo para en subsuelos, en el piso 1 y en los lobbies del cielo.
- El ascensor de servicio solo lo usa el personal de limpieza.
- Los ascensores estándar y de servicio cubren hasta 30 pisos. Cada hueco tiene hasta 8 cabinas y tiene que estar separado de otro hueco.

Límites por torre: 24 huecos de ascensor, 64 escaleras más escaleras mecánicas, 10 de seguridad, 10 centros médicos, 16 cines más salones, 512 comercios, 512 cocheras, 1 subte y 1 catedral.

## Economía

El juego empieza con $2.000.000 y no hay préstamos. El dinero puede quedar negativo por gastos de mantenimiento. Con saldo negativo no se puede construir. El tope de saldo es $99.999.999.

Todos los alquileres se pagan por adelantado.

### Contratos semanales

Esto aplica a oficinas y locales comerciales. Cuando un inquilino ocupa la unidad firma un contrato de 4 semanas y paga la primera semana en el momento. Después paga cada semana el mismo día de la semana en que entró: si entró un martes, paga cada martes. Al terminar las 4 semanas evalúa la unidad. Si la evaluación es buena o regular renueva por otras 4 semanas, y si es mala se va y la unidad vuelve a estar en alquiler.

Precios por semana en los cuatro niveles: alto, normal (por defecto), bajo y mínimo.

| Unidad | Alto | Normal | Bajo | Mínimo |
|---|---|---|---|---|
| Oficina | $15.000 | $10.000 | $5.000 | $2.000 |
| Local comercial | $20.000 | $15.000 | $10.000 | $4.000 |

Un local comercial además se va antes de terminar el contrato si pasa una semana entera con muy pocos clientes.

### Hotel

El huésped llega a partir de las 12:00, elige una estadía de 1 a 4 noches y paga todas las noches al hacer el check-in. El check-out es a las 10:00 del último día. La habitación no se vuelve a alquilar hasta que pasa limpieza.

| Habitación | Alto | Normal | Bajo | Mínimo |
|---|---|---|---|---|
| Simple, por noche | $3.000 | $2.000 | $1.500 | $500 |
| Doble, por noche | $4.500 | $3.000 | $2.000 | $800 |
| Suite, por noche | $9.000 | $6.000 | $4.000 | $1.500 |

### Departamentos

Se venden una sola vez, al primer comprador: $200.000, $150.000 (por defecto), $100.000 o $40.000. El precio solo se cambia mientras no está vendido. Cada 4 semanas desde la venta los dueños evalúan la unidad. Si la evaluación es mala, se van y el jugador devuelve el precio de venta.

### Comida, cine y fiestas

Estas unidades no tienen contrato y cobran por día según los clientes:

- Comida rápida, al cerrar: con menos de 25 clientes pierde $3.000; de 25 a 34 gana $2.000; de 35 a 49 gana $3.000; con 50 o más gana $5.000.
- Restaurante, al cerrar: con menos de 25 pierde $6.000; de 25 a 34 gana $4.000; de 35 a 49 gana $6.000; con 50 o más gana $10.000.
- Cine, al final de la última función: con menos de 40 espectadores no cobra nada; de 40 a 79 cobra $2.000; de 80 a 99 cobra $10.000; con 100 o más cobra $15.000. El público baja con la antigüedad de la película. Cambiar la película cuesta $300.000.
- Salón de fiestas: cobra $20.000 por día si vino alguien.

### Mantenimiento

Se cobra cada lunes a las 00:00.

| Concepto | Por semana |
|---|---|
| Cabina de ascensor estándar o de servicio | $10.000 |
| Cabina de ascensor expreso | $20.000 |
| Escalera mecánica | $5.000 |
| Limpieza | $10.000 |
| Seguridad | $20.000 |
| Rampa de estacionamiento | $10.000 |
| Reciclaje | $50.000 |
| Subte | $100.000 |
| Lobby, por casillero | $0 con menos de 3 estrellas, $300 con 3, $1.000 con 4 o más |

El Game Designer tiene que ajustar estas cifras. El original cobraba por trimestre de 3 días y acá la semana tiene 7, así que el hotel rinde más en proporción que las oficinas. La meta de balance: llegar a 5 estrellas tiene que llevar varias semanas de juego, o sea días reales.

## Personas

Tipos de persona: oficinistas, residentes, huéspedes, clientes, espectadores, invitados a fiestas, mucamas, personal de seguridad, el VIP e invitados a la boda.

Horarios base (el Game Designer los ajusta):

| Quién | Rutina |
|---|---|
| Oficinistas | de lunes a viernes llegan de 7:30 a 9:30, almuerzan de 12:00 a 13:30 en comida rápida o restaurante y se van de 17:00 a 19:00 |
| Residentes | salen a la mañana, hacen compras de día, más los fines de semana, y vuelven a la noche |
| Huéspedes | llegan de 12:00 a 23:00, sobre todo después de las 17:00; pueden salir a comer o comprar a la noche; se van de 6:00 a 10:00 |
| Mucamas | limpian habitaciones liberadas de 10:00 a 16:00, usando escaleras y ascensor de servicio |
| Clientes | comida rápida de 8:00 a 20:00, comercios de 10:00 a 20:00, restaurante de 17:00 a 23:00 |
| Cine | funciones a las 14:00 y a las 19:00 |
| Salón de fiestas | de 13:00 a 17:00 |

Desde las 3 estrellas, algunos oficinistas visitan el centro médico después del trabajo, y huéspedes de suites, residentes y oficinistas piden cochera. Si no lo consiguen aparece un aviso y ese día no se puede subir de estrellas.

### Recorridos

Cada persona planea su viaje de a un tramo y elige la opción más barata. Por orden de preferencia: escalera mecánica, ascensor sin transbordo, escalera fija y ascensor con transbordo. A pie se recorren como máximo 3 pisos por escalera fija y 7 por escalera mecánica. El que no encuentra ruta espera 2 horas del juego y vuelve a intentar.

### Estrés

El estrés de una persona es el promedio de minutos del juego por viaje. Suma la espera en el ascensor, el tiempo de viaje, cada piso subido a pie y una penalidad por no tener ruta. Los viajes largos en ascensor estándar o por escalera suman extra; el expreso no. Un lobby de 2 o 3 pisos de alto reduce la espera al subir.

Colores: negro es normal, rosa es estresado y rojo es muy estresado. Valores iniciales: rosa desde 15 minutos promedio y rojo desde 30. El Game Designer los calibra.

### Evaluación de unidades

El puntaje de una unidad es el estrés promedio de sus ocupantes, con dos ajustes:

- Precio: el nivel alto suma, el normal no cambia nada, el bajo resta y el mínimo aprueba siempre.
- Ruido: suma si hay una fuente de ruido en el mismo piso, dentro de un radio. Para habitaciones de hotel son 20 casilleros y los ruidos son restaurantes, oficinas, comercios y entretenimiento. Para oficinas son 10 casilleros y los ruidos son restaurantes, comercios y entretenimiento. Para departamentos son 30 casilleros y los ruidos son hotel, restaurantes, oficinas, comercios y entretenimiento.

El resultado es bueno, regular o malo. Desde 4 estrellas la gente tolera más.

### Plagas

Si una habitación liberada no se limpia en 3 días seguidos, se llena de cucarachas. La plaga se contagia cada día a las habitaciones vecinas del mismo piso y la única forma de eliminarla es demoler.

### Reciclaje

Cada centro de reciclaje cubre hasta 2.500 personas.

## Ascensores

- Cada piso tiene una cola por sentido, de 40 personas como máximo.
- Las cabinas recorren en un sentido hasta terminar el trabajo y después invierten. Si no tienen pedidos vuelven a su piso base.
- Configuración por hueco: pisos donde para, cantidad de cabinas, piso base de cada cabina y extender o recortar el recorrido.
- Configuración por franja horaria, para días hábiles y fin de semana por separado, en 6 franjas por día:
  - Modo: normal, expreso hacia arriba (hora pico de mañana) o expreso hacia abajo (hora pico de tarde).
  - Tiempo de espera en cada parada.
  - Distancia de respuesta: cuántos pisos viaja una cabina libre para atender un llamado (por defecto 5).
- Meta visual de velocidad: una cabina estándar recorre 30 pisos en unos 4 segundos reales y el expreso es unas 3 veces más rápido.

## Eventos

Los eventos que piden una decisión tienen un plazo dentro del juego. Si el jugador no responde a tiempo se aplica la opción por defecto: no pagar el rescate y no llamar al helicóptero.

| Evento | Cuándo | Efecto |
|---|---|---|
| Amenaza de bomba | con 2 o más estrellas, en promedio una vez cada 60 días del juego | Rescate de $200.000 con 2 estrellas, $300.000 con 3 y $1.000.000 con 4 o más. Si no se paga, seguridad busca la bomba. Si no la encuentra antes de las 13:00, explota y destruye un bloque de 40 casilleros de ancho, desde 2 pisos abajo hasta 3 arriba. Durante el evento no se puede construir seguridad. |
| Incendio | con 3 o más estrellas, en promedio una vez cada 84 días, en pisos de 32 casilleros o más | Se puede llamar a un helicóptero por $500.000 o dejar que se queme. El fuego se extiende por el piso y hacia arriba; seguridad lo contiene. Lo quemado se limpia demoliendo. |
| Visita del VIP | con 3 estrellas, en promedio cada 9 días | Se aloja en una suite. Aprueba si el estrés de su estadía es bajo; aprobarlo es requisito para 4 estrellas. |
| Tesoro | al construir subsuelos, con baja probabilidad | Bonus en efectivo. |
| Cucarachas | ver la sección de plagas | |
| Noticias | según el estado de las unidades | Avisos breves, por ejemplo "Pocas ventas, cambiá la película". |
| Papá Noel | 24 de diciembre a la noche | Cosmético. |

## Interfaz

- La ventana principal muestra la torre en corte lateral, con scroll y zoom en pasos enteros para no deformar los píxeles.
- Barra de herramientas por categoría: estructura, transporte, oficinas y vivienda, hotel, comercio y entretenimiento, servicios. Además la lupa para inspeccionar, la topadora para demoler y la herramienta de cabinas.
- Panel de estado: día, fecha, hora, dinero, población y estrellas.
- Mapa general de la torre.
- Ventana de finanzas: saldo, ingresos y gastos de la semana, ingresos y gastos de la semana anterior.
- Ventana de inspección de unidad: nombre (editable), ocupación, evaluación, nivel de precio y estado del contrato. En el cine permite cambiar la película.
- Ventana de inspección de persona: nombre, destino y estrés. Se pueden seguir hasta 20 personas con nombre.
- Ventana de ascensor con la configuración descripta.
- Vistas superpuestas: normal, evaluación, precios y estado del hotel (limpia, sucia, con plaga).
- Avisos y noticias en una línea inferior, más las ventanas de decisión de los eventos.
- Efectos de sonido: ascensor, construcción, demolición, caja registradora, avisos, alarmas de bomba y fuego, campanas de boda.
- Toda la interfaz está en español.

## Cuentas y sesiones

El jugador se registra con usuario y contraseña. Después del login la sesión queda abierta en ese navegador hasta que el jugador cierra sesión. Cada cuenta tiene una torre. Desde la cuenta puede demoler la torre y empezar otra, que arranca de nuevo el 1 de enero del año 1.

## Arte y sonido

Arte original en pixel art y vista lateral, con paleta y escala de los juegos de los 90. Cada unidad tiene variantes por estado: vacía, ocupada, de día y de noche, sucia y con plaga. Las personas son sprites chicos con colores de estrés. Los efectos de sonido se generan con ElevenLabs.
