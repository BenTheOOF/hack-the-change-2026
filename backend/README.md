# backend

The FastAPI API. It runs on port 8000 locally (`API_PORT` in `.env` when you use `scripts/dev.sh`) and on Fly in production. Python packages are managed with uv.

## Setup and run

You need uv and the `.env` file in the repo root. The root README explains how to fill it in. `app/config.py` reads it from there, so do not create a second env file here.

1. Run `cd backend`, then `uv sync`.
2. Run `uv run uvicorn app.main:app --reload --port 8000`.
3. Open `http://127.0.0.1:8000/health`. Expected: `{"status":"ok"}`.

`./scripts/dev.sh` from the repo root runs the same uvicorn command and starts the frontend as well.

Run the tests with `uv run pytest` in this folder. Expected: `1 passed`.

## What is in here

```
app/main.py       Creates the app, sets CORS, mounts every router. You should not need to edit it.
app/config.py     Reads settings from the root .env.
app/auth.py       get_current_user, the login check.
app/routers/      One file per group of routes. Files here are mounted automatically.
tests/            pytest tests.
supabase/         Database migrations. See supabase/README.md.
Dockerfile        How Fly builds the image.
fly.toml          Fly settings: one small machine that stops when idle.
```

## Add routes

1. Create `app/routers/<name>.py`:

   ```python
   from fastapi import APIRouter

   router = APIRouter()


   @router.get("/hello")
   def hello():
       return {"hello": "world"}
   ```

2. Save. The dev server reloads and `GET /hello` works. The variable must be called `router`.

## Require a login

Add the dependency to the route:

```python
from fastapi import Depends
from app.auth import get_current_user


@router.get("/mine")
def mine(user: dict = Depends(get_current_user)):
    return {"id": user["id"]}
```

The browser sends `Authorization: Bearer <access token>`. The API asks Supabase if the token is valid. A bad or missing token gets a 401.

## Add a setting

1. Add the name to the root `.env.example` and your `.env`.
2. Add a field to `Settings` in `app/config.py`.
3. Add the name to `scripts/push-env` so Fly gets it.

## Query the database from the API

Call Supabase's REST API with httpx and send the secret key in the `apikey` header only. `app/routers/ai.py` shows the pattern. The secret key skips row-level security, so use it only for work the user must not do directly.

## Add a package

1. Run `uv add <package>` in this folder.
2. Commit both `pyproject.toml` and `uv.lock`. The Dockerfile installs from the lock file.

## Add a test

Add tests as `tests/test_<name>.py`. Keep the environment lines at the top of `tests/test_health.py`, because settings load when `app.main` is imported.

## Fly

`fly.toml` has the app name and machine size. Run `fly deploy` from this folder. The root README has the full deploy steps.
