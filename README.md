# Carro Game

Juego arcade de carro hecho con **Phaser 4 + TypeScript + Vite**. Un solo **Cloudflare Worker**
sirve el juego y su API, que guarda sesiones y puntajes en **Supabase (PostgreSQL)** y valida los
resultados contra trampas en el servidor.

## Estructura

```
carro-game/
├── wrangler.jsonc    # configuracion del Worker (juego + API)
├── frontend/         # juego Phaser (TypeScript + Vite), se compila a frontend/dist
│   └── src/game/     # escenas, config, texturas, tema y UI
├── worker/src/       # API: index.ts (rutas), anticheat.ts, supabase.ts
├── supabase/         # schema.sql: tablas, permisos y RLS
├── backend/          # API Django original (referencia, ya no se despliega)
└── docs/             # especificaciones de assets
```

## Requisitos

- Node.js 20+
- Una cuenta de Cloudflare y un proyecto de Supabase

## Desarrollo local

```bash
npm install                      # dependencias del Worker (en la raiz)
cp .dev.vars.example .dev.vars   # y pega tu clave secreta de Supabase
npm run build                    # compila el juego a frontend/dist
npm run dev                      # juego + API en http://127.0.0.1:8787
```

Para trabajar en el juego con recarga en caliente, deja `npm run dev` corriendo en la raiz y en
otra terminal ejecuta `cd frontend && npm run dev` (http://localhost:5173). Vite reenvia `/api` al Worker.

## Despliegue (Cloudflare Workers Builds)

El repositorio esta conectado al Worker `game-caterpillar`. Cada push a `main` despliega a produccion;
los pushes a otras ramas crean versiones de vista previa.

Configuracion en *Workers & Pages → game-caterpillar → Settings → Build*:

| Campo | Valor |
| --- | --- |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | *(vacio)* |
| Production branch | `main` |

Variables en *Settings → Variables and Secrets*:

| Nombre | Tipo | Valor |
| --- | --- | --- |
| `SUPABASE_URL` | Text | `https://<proyecto>.supabase.co` |
| `SUPABASE_SECRET_KEY` | Secret | Clave `sb_secret_...` de Supabase |

`keep_vars` en `wrangler.jsonc` evita que cada deploy borre estas variables.

> La clave secreta salta las politicas RLS de Supabase: vive solo en el Worker y nunca llega al
> navegador. Por eso el anti-trampas corre en el servidor.

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/scores/start-session/` | Abre una sesión de juego y devuelve el mejor puntaje |
| `POST` | `/api/scores/submit-result/` | Envía el resultado; el servidor lo valida antes de guardarlo |

## Base de datos

Para un proyecto de Supabase nuevo, ejecuta `supabase/schema.sql` en el SQL Editor. Crea las
tablas con el mismo esquema que usaba Django:

- `scores_player` — `id`, `email` (único), `total_coins`, `best_score`, `created_at`
- `scores_gamesession` — `id`, `player_id`, `started_at`, `ended_at`, `coins_reported`,
  `score_reported`, `is_valid`, `rejection_reason`

El script activa RLS sin politicas y concede permisos solo a `service_role`: el Worker (clave
secreta) lee y escribe; con la clave publica no se puede leer ni modificar nada. Desde mayo de 2026
Supabase no concede permisos automaticos en proyectos nuevos, por eso el script los declara.

## Anti-trampas

`worker/src/anticheat.ts` rechaza un resultado si las monedas superan lo alcanzable en el tiempo
transcurrido (`MAX_COINS_PER_SECOND`, ajustable) o si el score es menor que las monedas. El tiempo
se mide contra `started_at` guardado en la base, no contra lo que reporta el cliente.

## Scripts (raiz)

| Comando | Qué hace |
| --- | --- |
| `npm run build` | Instala dependencias del juego y lo compila a `frontend/dist` |
| `npm run dev` | Juego + API en local con Wrangler |
| `npm run deploy` | Compila y despliega a mano (normalmente lo hace Cloudflare solo) |
| `npm run typecheck` | Verifica los tipos del Worker |

## Sobre `backend/`

El proyecto empezó con una API en Django. Se migró a un Worker para que todo viva en Cloudflare.
El código de Django queda en el repo como referencia; ya no se despliega.
