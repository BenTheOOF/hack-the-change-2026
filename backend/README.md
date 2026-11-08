# PhysioTrace API

FastAPI, uv-managed Python 3.12.16, and Supabase. Configuration is read from the single root `.env`.

## Run

```powershell
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

On the prepared Windows workspace, `..\scripts\backend.ps1` finds the local uv runtime and preserves the installed optional ML group.

`uv sync --group ml` installs NumPy plus CUDA 12.8 PyTorch on Windows and Linux, or MLX on Apple Silicon, for future offline work. `uv run --group ml python check_accelerator.py` runs a matrix multiply on CUDA or MLX and fails when neither is available. The API never imports torch or MLX and no training runs.

## Routes

Public routes: `GET /health` and `GET /physio/model`. All saved-care routes use `Depends(get_current_user)` and verify the Supabase token.

| Route | Purpose |
| --- | --- |
| `GET /physio/overview?day=YYYY-MM-DD` | Patient plan/progress/feedback or assigned therapist queue |
| `GET /physio/history?offset=0` | Patient history, 50 records per page |
| `PATCH /physio/consent` | Separate review and training choices |
| `POST /physio/sessions` | Begin a consent-snapshotted prescribed session |
| `POST /physio/sessions/{id}/finish` | Finish the patient's session |
| `POST /physio/sessions/{id}/reps` | Validate and classify a bounded pose sequence; save once per client identifier |
| `GET /physio/reps/{id}/pose` | Authorized pose replay |
| `PUT /physio/reps/{id}/clip` | Consent-checked, uncertain-rep WebM/MP4 upload, at most 10 MiB |
| `GET /physio/reps/{id}/clip` | Authorized 60-second private clip URL |
| `POST /physio/reps/{id}/review` | Assigned therapist label and written feedback |
| `POST /physio/prescriptions` | Assigned therapist exercise prescription |

Rep results preserve the server-derived exercise day in the patient's IANA timezone. Deterministic classification accepts only finite, bounded 33-point frames. The browser cannot send an authoritative label. Service-only database writes make duplicate submissions idempotent. Review changes the existing rep in one transaction.

## Data and verification

Apply the new timestamped care migration after the starter migrations. It creates care roles and assignments, prescriptions, sessions, reps, reviews, explicit offline dataset manifests, and private clip storage. Existing migrations and `app/main.py` are unchanged. Run `supabase/admin-care.sql` with administrator access to grant a therapist role and patient assignment.

`uv run pytest` runs the existing pytest framework. Use `uv run --group ml pytest` to preserve the optional ML group. The disposable PostgreSQL checks are documented in the root README. They do not connect to a live care database.
