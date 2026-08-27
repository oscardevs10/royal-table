# Royal Table 🂡

Texas Hold'em multijugador online, en tiempo real, con fichas 100% virtuales (sin dinero real).

- **Frontend**: Angular 19 + TypeScript + SCSS + Signals
- **Backend**: Node.js + TypeScript + Express + Socket.IO
- **Base de datos**: PostgreSQL + Prisma ORM

El servidor es la única autoridad del juego: baraja, reparte y valida cada acción. El cliente nunca decide qué cartas recibe ni puede alterar el pot o las fichas.

También puedes **jugar solo**: en la lobby, el anfitrión puede pulsar **+ Agregar Bot** para sumar oponentes controlados por el servidor. Los bots deciden sus jugadas con una IA heurística real (evalúa la fuerza de su mano con el mismo evaluador que juzga el showdown) y actúan automáticamente con un pequeño retraso, a través del mismo camino de validación que un jugador humano.

Durante la mano, un panel bajo la mesa muestra **tu jugada actual** (ej. "Par de Reyes") y, si lo expandes, la **probabilidad de terminar en cada categoría de mano** (Par, Color, Escalera...), calculada en el servidor sobre las cartas que aún no salieron (enumeración exacta en flop/turn, simulación tipo Monte Carlo antes del flop). Las cartas también se reparten con una animación escalonada por asiento, siguiendo el orden real de reparto.

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
npm test              # 40+ tests unitarios + integración (deck, evaluador de manos, pots, turnos, sockets)
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

## 8. Tests

```bash
cd backend
npm test
```

Cubre: baraja y shuffle, evaluador de manos (las 10 categorías, empates, wheel straight), pot manager (side pots con múltiples all-in), gestión de turnos, fold, all-in, eliminación de jugadores, reconexión, y partidas completas de 2, 3 y 6 jugadores. También incluye tests de integración que levantan un servidor real y simulan dos clientes de Socket.IO jugando una mano completa, verificando que ningún jugador reciba las cartas privadas de otro.

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
