# CAT Game

Juego arcade de carro hecho con **Phaser 4 + TypeScript + Vite**. Todo vive en Cloudflare: un solo
**Worker** sirve el juego y su API, que guarda sesiones y puntajes en **Cloudflare D1** y valida los
resultados contra trampas en el servidor.

## Estructura

```
carro-game/
├── wrangler.jsonc    # configuracion del Worker (juego + API + base D1)
├── frontend/         # juego Phaser (TypeScript + Vite), se compila a frontend/dist
│   └── src/game/     # escenas, config, texturas, tema y UI
├── worker/src/       # API: index.ts (rutas), anticheat.ts, db.ts (consultas a D1)
├── migrations/       # esquema de la base D1 (se aplica en cada deploy)
├── backend/          # API Django original (referencia, ya no se despliega)
└── docs/             # especificaciones de assets
```

## Requisitos

- Node.js 20+
- Una cuenta de Cloudflare

## Desarrollo local

```bash
npm install                # dependencias del Worker (en la raiz)
cp .dev.vars.example .dev.vars   # y rellena JWT_SECRET (el archivo explica como generarla)
npm run db:migrate:local   # crea las tablas en la base D1 local (.wrangler/)
npm run build              # compila el juego a frontend/dist
npm run dev                # juego + API en http://127.0.0.1:8787
```

En local Wrangler simula D1 en `.wrangler/state` y Turnstile usa las claves de prueba de Cloudflare
(siempre aprueban), así que no hace falta ninguna cuenta.

Para trabajar en el juego con recarga en caliente, deja `npm run dev` corriendo en la raiz y en
otra terminal ejecuta `cd frontend && npm run dev` (http://localhost:5173). Vite reenvia `/api` al Worker.

## Despliegue (Cloudflare Workers Builds)

1. Crear la base una sola vez: `npx wrangler d1 create game-caterpillar-db` (o desde el panel,
   *Storage & Databases → D1*) y pegar su `database_id` en `wrangler.jsonc`.
2. Conectar el repositorio al Worker `game-caterpillar`. Cada push a `main` despliega a produccion;
   los pushes a otras ramas crean versiones de vista previa.

Configuracion en *Workers & Pages → game-caterpillar → Settings → Build*:

| Campo | Valor |
| --- | --- |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler d1 migrations apply game-caterpillar-db --remote && npx wrangler deploy` |
| Root directory | *(vacio)* |
| Production branch | `main` |

El Worker accede a la base por el binding `DB` de `wrangler.jsonc`, y la base no tiene ninguna URL
publica. Antes del primer despliegue con JWT y Turnstile:

1. Crear el widget de Turnstile en el panel (*Turnstile → Add widget*), modo **Invisible** o
   **Managed**, con los hostnames `catgamesergio.com` y los subdominios de los clientes.
2. Cargar los secretos del Worker (no se guardan en el repo):
   ```bash
   npx wrangler secret put JWT_SECRET        # 32+ caracteres aleatorios
   npx wrangler secret put TURNSTILE_SECRET  # clave secreta del widget
   ```
3. En *Settings → Build → Variables* agregar `VITE_TURNSTILE_SITE_KEY` con la clave del sitio del
   widget (es publica; el juego la necesita al compilar).

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Correo + token de Turnstile → JWT del jugador (vigente 2 h) |
| `POST` | `/api/scores/start-session/` | Abre una sesión de juego y devuelve el mejor puntaje |
| `POST` | `/api/scores/submit-result/` | Envía el resultado; el servidor lo valida antes de guardarlo |

Seguridad de la API:

- Solo acepta `POST` con `Content-Type: application/json` y un `Origin` igual al dominio que recibe
  la petición (el juego y la API siempre van juntos).
- `/api/scores/*` exige `Authorization: Bearer <JWT>` (HS256, firmado con `JWT_SECRET`). Un jugador
  solo puede cerrar sus propias partidas.
- Límite de peticiones: 60/min por IP en el login y 20/min por jugador en `/api/scores/*`.
- El antitrampas limita monedas y puntaje por segundo de partida (`worker/src/anticheat.ts`).

## Base de datos (D1)

`migrations/0001_tablas_iniciales.sql` crea:

- `players` — `id`, `email` (único), `total_coins`, `best_score`, `created_at`
- `game_sessions` — `id`, `player_id`, `started_at`, `ended_at`, `coins_reported`,
  `score_reported`, `is_valid`, `rejection_reason`

Para cambiar el esquema se agrega un archivo nuevo en `migrations/` (nunca se edita uno aplicado).

Consultas y exportacion al cierre de la campaña:

```bash
npx wrangler d1 execute game-caterpillar-db --remote --command "SELECT * FROM players ORDER BY best_score DESC"
npx wrangler d1 export game-caterpillar-db --remote --output respaldo.sql
```

## Anti-trampas

`worker/src/anticheat.ts` rechaza un resultado si las monedas superan lo alcanzable en el tiempo
transcurrido (`MAX_COINS_PER_SECOND`, ajustable) o si el score es menor que las monedas. El tiempo
se mide contra `started_at` guardado en la base, no contra lo que reporta el cliente. Cada sesión
se cierra una sola vez: reenviar el resultado de una partida ya registrada se rechaza.

## Scripts (raiz)

| Comando | Qué hace |
| --- | --- |
| `npm run build` | Instala dependencias del juego y lo compila a `frontend/dist` |
| `npm run dev` | Juego + API en local con Wrangler |
| `npm run db:migrate:local` | Aplica las migraciones a la base D1 local |
| `npm run db:migrate` | Aplica las migraciones a la base D1 de produccion |
| `npm run deploy` | Compila, migra y despliega a mano (normalmente lo hace Cloudflare solo) |
| `npm run typecheck` | Verifica los tipos del Worker |

## Ramas

| Rama | Uso |
| --- | --- |
| `main` | Versión estable, la que está publicada |
| `desarrollo` | Actualizaciones y cambios; se fusiona a `main` cuando están probados |

## Sobre `backend/`

El proyecto empezó con una API en Django. Se migró a un Worker para que todo viva en Cloudflare.
El código de Django queda en el repo como referencia; ya no se despliega.
