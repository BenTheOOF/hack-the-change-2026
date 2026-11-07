# scripts

Run all of these from the repo root.

| Script | What it does |
|---|---|
| `./scripts/dev.sh` | Installs dependencies if needed, then starts the API and the web app. Ctrl+C stops both. |
| `./scripts/worktree.sh <name>` | Makes `../<repo>-<name>` on branch `feat/<name>`. Copies `.env`, picks free ports, installs dependencies. |
| `./scripts/worktree-remove.sh <name>` | Deletes that folder and its branch. Unmerged commits keep the branch. Uncommitted edits in the folder are lost. |
| `./scripts/push-env [fly\|vercel] [url]` | Sends `.env` values to Fly and Vercel. The optional URL replaces the local `CORS_ORIGINS` (for `fly`) or `NEXT_PUBLIC_API_URL` (for `vercel`). |

## Add an environment variable to the deploy

`push-env` has two lists of names, one in `push_fly` and one in `push_vercel`. Add the new name to the list for the host that needs it. Names that start with `NEXT_PUBLIC_` go to Vercel. Secrets go to Fly only.

## Add a script

Put a bash file here, run `chmod +x` on it, and add a row to the table above. Start it with `set -euo pipefail`.
