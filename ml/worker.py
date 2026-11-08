"""Background trainer for therapist-defined exercises.

Claims queued exercises from Supabase, fits a template model from the demo keypoints, and
marks each one ready or failed. Runs outside the API, so training never sits in a request.

Run: cd backend && uv run --group ml python ../ml/worker.py          (polls every 5 s)
     cd backend && uv run --group ml python ../ml/worker.py --once   (drain the queue and exit)
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.template import TEMPLATE_VERSION, DemoFrame  # noqa: E402
from fit_template import FitError, fit_template  # noqa: E402

POLL_SECONDS = 5


def rpc(client: httpx.Client, name: str, body: dict) -> object:
    r = client.post(f"/rest/v1/rpc/{name}", json=body)
    r.raise_for_status()
    return r.json() if r.content else None


def train_one(client: httpx.Client) -> bool:
    """Train the oldest queued exercise. Returns False when the queue is empty."""
    # ponytail: if the worker dies between claim and finish, the row stays "training".
    # A stale-claim timeout could requeue it; for now the therapist resubmits.
    claimed = rpc(client, "claim_custom_exercise", {})
    if not claimed:
        return False
    row = claimed[0]
    model, error = None, None
    try:
        frames = [DemoFrame.model_validate(f) for f in row["demo_frames"]]
        model = fit_template(frames, row["view"]).model_dump(by_alias=True)
    except FitError as exc:
        error = str(exc)
    except Exception as exc:  # A bad demo must not stop the worker; record why it failed.
        error = f"Training failed unexpectedly ({type(exc).__name__}). Try recording the demo again."
    rpc(client, "finish_custom_exercise", {
        "p_id": row["id"], "p_model": model, "p_version": TEMPLATE_VERSION if model else None, "p_error": error,
    })
    print(f"{row['id']} {row['name']!r}: {'ready' if model else 'failed: ' + str(error)}", flush=True)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--once", action="store_true", help="Drain the queue once and exit.")
    args = parser.parse_args()
    try:
        from app.config import settings
    except ValueError:
        sys.exit("Fill in the root .env (Supabase URL and secret key) before starting the trainer.")
    if not settings.supabase_url or not settings.supabase_secret_key:
        sys.exit("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in the root .env first.")
    # The secret key goes in the apikey header only, never Authorization.
    headers = {"apikey": settings.supabase_secret_key, "Content-Type": "application/json"}
    with httpx.Client(base_url=settings.supabase_url, headers=headers, timeout=30) as client:
        print("Exercise trainer running. No training happens in the API.", flush=True)
        while True:
            try:
                while train_one(client):
                    pass
            except httpx.HTTPError as exc:
                print(f"Supabase unavailable ({exc}); retrying.", flush=True)
            if args.once:
                return
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
