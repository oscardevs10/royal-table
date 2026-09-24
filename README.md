# Royal Table 🂡

Casino multijugador online, en tiempo real, con fichas 100% virtuales (sin dinero real). Incluye dos juegos: **Texas Hold'em** y **Blackjack**.

- **Frontend**: Angular 19 + TypeScript + SCSS + Signals
- **Backend**: Node.js + TypeScript + Express + Socket.IO
- **Base de datos**: PostgreSQL + Prisma ORM

El servidor es la única autoridad del juego: baraja, reparte y valida cada acción. El cliente nunca decide qué cartas recibe ni puede alterar el pot o las fichas.

También puedes **jugar solo**: en la lobby, el anfitrión puede pulsar **+ Agregar Bot** para sumar oponentes controlados por el servidor. Los bots deciden sus jugadas con una IA heurística real (evalúa la fuerza de su mano con el mismo evaluador que juzga el showdown) y actúan automáticamente con un pequeño retraso, a través del mismo camino de validación que un jugador humano.

Durante la mano, un panel bajo la mesa muestra **tu jugada actual** (ej. "Par de Reyes") y, si lo expandes, la **probabilidad de terminar en cada categoría de mano** (Par, Color, Escalera...), calculada en el servidor sobre las cartas que aún no salieron (enumeración exacta en flop/turn, simulación tipo Monte Carlo antes del flop). Las cartas también se reparten con una animación escalonada por asiento, siguiendo el orden real de reparto.

### Blackjack

El otro modo de juego es **Blackjack**, donde cada jugador juega contra la casa (el dealer lo controla el servidor). Al crear la partida eliges el tipo de mesa:

- **Solo vs Dealer**: una mesa privada de un asiento. Te sientas directamente, sin pasar por la lobby.
- **Mesa multijugador**: de 2 a 7 asientos (como una mesa real). Compartes el código y cada quien juega sus manos contra el dealer. A diferencia del póker, **se puede entrar a una mesa ya empezada**: quien llega con el código se sienta y apuesta desde la siguiente ronda, y quien sale libera su asiento.

Reglas de esta versión (reglas estándar de casino en EE. UU.):
- Cada ronda empieza con las apuestas (entre la mínima y la máxima de la mesa). Se reparte en cuanto todos los jugadores conectados apostaron; el anfitrión puede **repartir ya** sin esperar a quien no apueste.
- Blackjack natural paga **3 a 2**; el dealer **revisa si tiene blackjack** con un As o una figura boca arriba (si lo tiene, la ronda termina antes de que nadie doble o divida) y **se planta en todos los 17**, incluido el 17 suave.
- Acciones: **Pedir**, **Plantarse**, **Doblar** (con las dos primeras cartas, también después de dividir) y **Dividir** (cualquier par del mismo valor, hasta 4 manos; los Ases divididos reciben una sola carta y un 21 en mano dividida paga 1 a 1).
- El dealer juega carta por carta con una pausa entre cada una, y los resultados quedan en la mesa unos segundos antes de abrir la siguiente ronda.
- Si un jugador se desconecta en su turno, se le da un margen de 15 s (por si solo recargó la página) y después se planta su mano automáticamente.
- Quien ya no puede cubrir la apuesta mínima queda fuera; la partida termina cuando nadie en la mesa puede apostar.

**Longitud de la baraja**: una baraja de 52 cartas no alcanza para una mesa llena (cada ronda usa ~3 cartas por mano más las del dealer, y con divisiones una mesa de 7 puede gastar más de 40 cartas en una sola ronda). Por eso se juega con un **zapato de varias barajas**: el mínimo depende del número de asientos (1 baraja hasta 2 asientos, 2 hasta 4, 4 para 5-7) y el formulario propone 2, 4 o 6 según la mesa. El zapato se vuelve a barajar **entre rondas** al salir la carta de corte (75% repartido), y si en una ronda extrema se agotara, se rellena con las cartas del descarte (nunca con cartas que siguen en la mesa). La mesa muestra cuántas cartas quedan y dónde está la carta de corte.

---

## 0. Demo en vivo (multijugador real)

**https://oscardevs10.github.io/royal-table/**

El frontend está en GitHub Pages (estático) y el backend en Render (servicio gratuito, con soporte real de WebSockets). Puedes crear una partida real y compartir el código con cualquiera, desde cualquier lugar.

> **Nota:** el backend gratuito de Render "se duerme" tras ~15 minutos sin uso. La primera acción tras un rato inactivo puede tardar hasta 30-50s en responder mientras el servidor despierta - es normal, no un error. La página lo avisa.

### Cómo desplegar tu propio backend en Render (gratis)

El repo ya incluye `render.yaml` listo para un despliegue con un clic, pero **tienes que crear la cuenta y conectar el repo tú mismo** (no puedo hacerlo por ti):

1. Entra a [render.com](https://render.com) y crea una cuenta gratuita (puedes usar tu cuenta de GitHub para entrar directo).
2. En el dashboard, **New +** → **Blueprint**.
3. Conecta tu cuenta de GitHub y selecciona el repositorio `royal-table`.
4. Render detecta el `render.yaml` automáticamente y propone crear el servicio `royal-table-backend`. Confirma con **Apply**.
5. Espera a que termine el build (unos 2-3 minutos la primera vez). Cuando esté listo, Render te da una URL como `https://royal-table-backend.onrender.com`.
6. Si el nombre te quedó distinto al de arriba, avísame la URL real para actualizar `frontend/src/app/core/config.ts` (`DEPLOYED_BACKEND_URL`) y volver a publicar el frontend en Pages.

No hace falta configurar una base de datos: la partida vive en memoria en el servidor (que es la fuente de verdad), y sin `DATABASE_URL` el backend simplemente no guarda historial permanente - el juego funciona igual.

---

## 1. Requisitos

- Node.js 20+ (probado con Node 24)
- npm 10+
- PostgreSQL 14+ (local o en Docker)

## 2. Estructura del proyecto

```
/backend    API + WebSocket (Socket.IO) + motor de póker + Prisma
/frontend   Aplicación Angular
```

## 3. Configuración de PostgreSQL

Crea una base de datos vacía, por ejemplo:

```sql
CREATE DATABASE royal_table;
```

Si prefieres Docker:

```bash
docker run --name royal-table-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=royal_table -p 5432:5432 -d postgres:16
```

## 4. Variables de entorno (backend)

Copia `backend/.env.example` a `backend/.env` y ajusta según tu instalación:

```
PORT=3001
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/royal_table?schema=public"
```

> El backend acepta peticiones de cualquier origen (CORS abierto) a propósito: así el anfitrión puede entrar por `localhost:4200` y su amigo por la IP de la LAN sin configurar nada extra. No hay autenticación por cookies que proteger, así que es seguro para este caso de uso recreativo.

## 5. Backend

```bash
cd backend
npm install
npx prisma migrate dev --name init   # crea las tablas en PostgreSQL
npm run dev                          # http://localhost:3001
```

Otros comandos útiles:

```bash
npm test              # 90+ tests unitarios + integración (póker, blackjack, zapato, sockets)
npm run build          # compila a dist/
npm start               # ejecuta el build compilado
npx prisma studio        # explorador visual de la base de datos
```

> **Nota:** si PostgreSQL no está disponible, el juego sigue funcionando perfectamente (el estado de la partida vive en memoria en el servidor, que es la fuente de verdad). Solo el historial persistente (salas, jugadores, manos, acciones) dejará de guardarse, y verás errores de conexión en la consola del backend que puedes ignorar en desarrollo.

## 6. Frontend

```bash
cd frontend
npm install
npm start   # http://localhost:4200
```

## 7. Cómo jugar con otra persona

1. Ejecuta backend y frontend como se indicó arriba.
2. Abre `http://localhost:4200`, pulsa **Crear partida**, configura la mesa y créala.
3. En la lobby, pulsa **Copiar invitación** (copia un enlace tipo `http://TU_IP:4200/join?code=X7K92`).
4. Comparte ese enlace con tu amigo. Si están en la misma red local, reemplaza `localhost` por la IP de tu máquina (ej. `192.168.1.20`) para que puedan conectarse desde otro dispositivo.
5. Tu amigo abre el enlace, introduce su nombre y se une. Cuando haya al menos 2 jugadores, el anfitrión pulsa **Comenzar partida**.

Para jugar entre distintas redes (no LAN), necesitas desplegar el backend y el frontend en servidores accesibles públicamente (ver sección de despliegue).

### Jugar solo (contra bots)

1. Pulsa **Crear partida** y créala normalmente.
2. En la lobby, pulsa **+ Agregar Bot** una o más veces (puedes quitarlos con el botón `×` antes de empezar).
3. Cuando haya al menos 2 jugadores (tú + 1 bot), pulsa **Comenzar partida**. Los bots actúan solos, sin que tengas que hacer nada por ellos.

### Jugar Blackjack

- **Solo**: **Crear partida** → **Blackjack** → **Solo vs Dealer** → **Sentarse a jugar**. Entras directo a la mesa.
- **Con amigos**: **Crear partida** → **Blackjack** → **Mesa multijugador**, elige asientos y barajas, y comparte el código. Puedes pulsar **Abrir la mesa** aunque estés solo: tus amigos pueden unirse con el código en cualquier momento y entran en la siguiente ronda.

## 8. Tests

```bash
cd backend
npm test
```

Cubre: baraja y shuffle, evaluador de manos (las 10 categorías, empates, wheel straight), pot manager (side pots con múltiples all-in), gestión de turnos, fold, all-in, eliminación de jugadores, reconexión, y partidas completas de 2, 3 y 6 jugadores. También incluye tests de integración que levantan un servidor real y simulan dos clientes de Socket.IO jugando una mano completa, verificando que ningún jugador reciba las cartas privadas de otro.

Para Blackjack: valor de mano (Ases suaves/duros, 17 suave), zapato multi-baraja (composición, carta de corte, relleno desde el descarte), pagos 3:2, revisión del dealer, doblar, dividir (incluidos Ases y el límite de 4 manos), turnos en mesa multijugador, entrar/salir a mitad de partida, y una simulación de 300 rondas que comprueba que nunca se pierde ni se duplica una carta. Los tests de integración juegan una ronda solo contra el dealer y una mesa donde un amigo entra con el código, y verifican que la carta oculta del dealer nunca viaja al cliente antes de revelarse.

## 9. Despliegue (siguientes pasos)

Esta primera versión está pensada para desarrollo local / LAN. Para producción:

- **Backend**: desplegar en un servicio con soporte de WebSockets persistentes (Railway, Render, Fly.io, un VPS con PM2 detrás de Nginx). Configurar `DATABASE_URL` apuntando a un PostgreSQL gestionado (Neon, Supabase, RDS). Si quieres restringir el CORS abierto (`origin: true`) a un dominio fijo en producción, ajústalo en `backend/src/app.ts` y `backend/src/server.ts`.
- **Frontend**: `npm run build` genera un bundle estático en `frontend/dist/frontend` que se puede servir desde Vercel, Netlify, Cloudflare Pages o cualquier hosting estático. Actualiza `frontend/src/app/core/config.ts` (`BACKEND_URL`) con la URL pública del backend antes de compilar.
- Usar `https`/`wss` en producción (Socket.IO negocia automáticamente sobre TLS).

## 10. Qué se simplificó en esta primera versión (y cómo mejorarlo)

- **Persistencia best-effort**: si PostgreSQL cae momentáneamente, la partida sigue jugándose (el motor de juego vive en memoria) y los writes fallidos solo se registran en consola. Para producción se podría añadir una cola de reintentos.
- **Reglas de all-in parcial**: un all-in por menos del raise mínimo no reabre la ronda de apuestas para jugadores que ya actuaron (regla estándar simplificada; algunos casinos usan variantes ligeramente distintas).
- **Salas en memoria**: si el proceso del backend se reinicia, las salas activas se pierden (los datos históricos en PostgreSQL persisten, pero no el estado de la mano en curso). Para alta disponibilidad real haría falta mover el `GameEngine` a un store externo (Redis) o usar sticky sessions + réplica de estado.
- **Sonidos**: se generan sintéticamente con la Web Audio API (sin archivos de audio placeholder) para que el feedback sonoro sea real desde el primer día. Se pueden reemplazar por samples reales en `AudioService` cuando existan assets definitivos.
- **Sin límite de tiempo por turno**: no hay temporizador que fuerce fold/check automático si un jugador no actúa. Sería una mejora natural para partidas competitivas.
- **IA de los bots**: es una heurística simple (fuerza de mano estimada + algo de aleatoriedad para no ser 100% predecible), no un solver de GTO. Juega de forma razonable pero no es un adversario "difícil" a propósito - es pensada para practicar/completar mesas, no para desafiar a un jugador experto.
- **Blackjack sin seguro ni rendición**: no se ofrece *insurance* ni *surrender*. El dealer sí revisa su blackjack antes de que se juegue, así que nadie pierde dobles o divisiones contra un blackjack del dealer.
- **Blackjack sin bots**: no hacen falta para jugar solo (el rival es el dealer), así que el botón de agregar bots no aparece en ese modo.
