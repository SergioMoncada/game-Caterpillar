# Carro Game

Juego arcade de carro hecho con **Phaser 4 + TypeScript + Vite**, desplegado en **Cloudflare Pages**,
con una API en **Cloudflare Workers** que guarda sesiones y puntajes en **Supabase (PostgreSQL)**
y valida los resultados contra trampas en el servidor.

## Estructura

```
carro-game/
├── frontend/         # juego Phaser (TypeScript + Vite) -> Cloudflare Pages
│   └── src/game/     # escenas, config, texturas, tema y UI
├── worker/           # API de puntajes (TypeScript) -> Cloudflare Workers
│   └── src/          # index.ts (rutas), anticheat.ts, supabase.ts
├── backend/          # API Django original (referencia, ya no se despliega)
└── docs/             # especificaciones de assets
```

## Requisitos

- Node.js 18+
- Una cuenta de Cloudflare y un proyecto de Supabase

## Desarrollo local

### API (Worker)

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars   # y rellena tus credenciales de Supabase
npm run dev                      # http://127.0.0.1:8787
```

### Juego (frontend)

```bash
cd frontend
npm install
npm run dev                      # http://localhost:5173
```

Sin `VITE_API_BASE` definida, el frontend apunta a `http://127.0.0.1:8000/api/scores`.
Para usar el Worker local, crea `frontend/.env.local` con:

```
VITE_API_BASE=http://127.0.0.1:8787/api/scores
```

## Despliegue

### 1. API en Cloudflare Workers

Edita `worker/wrangler.jsonc` y pon tu `SUPABASE_URL` y tus `ALLOWED_ORIGINS`. Luego:

```bash
cd worker
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # se pega la clave, no se commitea
npx wrangler deploy
```

Wrangler imprime la URL del Worker (`https://carro-game-api.<subdominio>.workers.dev`).

> La `service_role` key salta las políticas RLS de Supabase. Vive solo como secreto del
> Worker y nunca debe llegar al navegador — por eso el anti-trampas corre aquí y no en el cliente.

### 2. Juego en Cloudflare Pages

| Campo | Valor |
| --- | --- |
| Root directory | `frontend` |
| Build command | `npm run build` |
| Build output directory | `dist` |

En *Settings → Environment variables* define:

```
VITE_API_BASE = https://carro-game-api.<subdominio>.workers.dev/api/scores
```

Es una variable de build: hay que volver a desplegar después de agregarla. Por último, añade el
dominio de Pages a `ALLOWED_ORIGINS` en `worker/wrangler.jsonc` y vuelve a desplegar el Worker.

## Variables de entorno

| Dónde | Variable | Descripción |
| --- | --- | --- |
| Worker | `SUPABASE_URL` | URL del proyecto Supabase |
| Worker | `SUPABASE_SERVICE_ROLE_KEY` | Clave `service_role` (secreto) |
| Worker | `ALLOWED_ORIGINS` | Orígenes permitidos por CORS, separados por comas |
| Frontend | `VITE_API_BASE` | URL base de la API de puntajes |

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/scores/start-session/` | Abre una sesión de juego y devuelve el mejor puntaje |
| `POST` | `/api/scores/submit-result/` | Envía el resultado; el servidor lo valida antes de guardarlo |

## Base de datos

Las tablas son las que creó Django y se siguen usando tal cual:

- `scores_player` — `id`, `email` (único), `total_coins`, `best_score`, `created_at`
- `scores_gamesession` — `id`, `player_id`, `started_at`, `ended_at`, `coins_reported`,
  `score_reported`, `is_valid`, `rejection_reason`

## Anti-trampas

`worker/src/anticheat.ts` rechaza un resultado si las monedas superan lo alcanzable en el tiempo
transcurrido (`MAX_COINS_PER_SECOND`, ajustable) o si el score es menor que las monedas. El tiempo
se mide contra `started_at` guardado en la base, no contra lo que reporta el cliente.

## Scripts del frontend

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Compila TypeScript y genera el build de producción |
| `npm run preview` | Sirve localmente el build de producción |

## Sobre `backend/`

El proyecto empezó con una API en Django. Se migró a Workers para que todo viva en Cloudflare.
El código de Django queda en el repo como referencia; ya no se despliega.
