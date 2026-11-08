# Ownership

Replace the placeholder names. Each person works mostly inside their own folders.

| Person | Folders |
|---|---|
| Person 1 | `frontend/src/features/auth/`, `frontend/src/app/login/`, `frontend/src/app/signup/` |
| Person 2 | `frontend/src/features/notes/`, `frontend/src/features/uploads/`, `backend/supabase/migrations/` (own files only) |
| Person 3 | `backend/app/routers/`, `backend/tests/` |
| Person 4 | `frontend/src/features/ai/`, `frontend/src/app/dashboard/`, `docs/` |

Touch shared files only in small PRs; rebase before merging.

The PhysioTrace UI is under frontend/src/features/physio. Its matching API is under backend/app/routers/physio.py. Coordinate changes to the classifier contract in frontend/src/features/physio/engine.ts and backend/app/physio.py.

Shared files: `.env.example`, `frontend/src/lib/`, `frontend/src/proxy.ts`, `backend/app/auth.py`, `backend/app/config.py`, `backend/pyproject.toml`, `frontend/package.json`, `scripts/`.
