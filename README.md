# Carro Game

Juego arcade de carro hecho con **Phaser 4 + TypeScript + Vite** en el frontend y un backend en
**Django + Django REST Framework** que guarda las sesiones de juego y los puntajes en **Supabase (PostgreSQL)**,
con validación anti-trampas en el servidor.

## Estructura

```
carro-game/
├── backend/          # API Django (sesiones, puntajes, anti-cheat)
│   ├── accounts/     # usuarios / jugadores
│   ├── config/       # settings, urls, wsgi/asgi
│   └── scores/       # modelo de puntajes + anticheat.py
├── frontend/         # juego Phaser (TypeScript + Vite)
│   └── src/game/     # escenas, config, texturas, tema y UI
└── docs/             # especificaciones de assets
```

## Requisitos

- Python 3.13+
- Node.js 18+
- Una base de datos PostgreSQL (el proyecto usa Supabase)

## Puesta en marcha

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux
pip install -r requirements.txt

cp .env.example .env         # y rellena tus credenciales
python manage.py migrate
python manage.py runserver   # http://127.0.0.1:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                  # http://localhost:5173
```

El frontend espera la API en `http://127.0.0.1:8000/api/scores` (ver `frontend/src/api/scores.ts`).

## Variables de entorno

Se configuran en `backend/.env`. La plantilla está en [`backend/.env.example`](backend/.env.example):

| Variable | Descripción |
| --- | --- |
| `DJANGO_SECRET_KEY` | Clave secreta de Django |
| `DJANGO_DEBUG` | `True` en desarrollo |
| `SUPABASE_DB_*` | Nombre, usuario, contraseña, host y puerto de PostgreSQL |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Credenciales del proyecto Supabase |

> El archivo `.env` está en `.gitignore` y no debe subirse nunca al repositorio.

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/scores/start-session/` | Abre una sesión de juego y devuelve el mejor puntaje |
| `POST` | `/api/scores/submit-result/` | Envía el resultado; el servidor lo valida antes de guardarlo |

## Scripts del frontend

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Compila TypeScript y genera el build de producción |
| `npm run preview` | Sirve localmente el build de producción |
