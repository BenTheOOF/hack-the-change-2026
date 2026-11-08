# Deploying PhysioTrace to production (AWS or Vultr, your own domain)

This manual puts PhysioTrace on one Linux server you control, on AWS or Vultr, under your own domain with HTTPS. The steps after creating the server are the same on both providers.

## What runs where

| Piece | Runs on | Address |
| --- | --- | --- |
| Web app (Next.js, server-rendered) | Your server, `next start` on port 3000 | `https://app.example.com` |
| API (FastAPI) | Your server, uvicorn on port 8000 | `https://api.example.com` |
| Exercise trainer (`ml/worker.py`) | Your server, background service | No public address |
| Database, sign-in, file storage | Hosted Supabase project | `https://<project>.supabase.co` |
| HTTPS and routing | Caddy on your server (free automatic certificates) | Ports 80 and 443 |

Only ports 22, 80, and 443 are open to the internet. The web app and API listen on `127.0.0.1` behind Caddy. HTTPS is required, not optional: browsers only allow the camera on HTTPS pages.

Replace `example.com` with your domain throughout. Using two subdomains (`app.` and `api.`) keeps the setup simple.

## 1. Create the production Supabase project

Use a separate Supabase project for production, not the one used for development.

1. Create the project at supabase.com and note its URL, publishable key (`sb_publishable_...`), and secret key (`sb_secret_...`) from Project Settings > API Keys.
2. On your computer, from the repository's `backend/` folder, link and push every migration:

   ```bash
   npx supabase link --project-ref <production-project-ref>
   npx supabase db push --remote --dry-run
   npx supabase db push --remote
   ```

   The migrations create all tables, row-level security, and the private storage buckets (`uploads`, `review-clips`, `exercise-demos`). Re-link to the development project afterwards if you keep using it.
3. Authentication > URL Configuration:
   - Site URL: `https://app.example.com`
   - Redirect URLs: add `https://app.example.com/auth/callback`
4. Authentication > Providers > Email: turn **Confirm email** on for production and set up custom SMTP (Authentication > Emails), so password accounts must prove their address. The app already handles this ("Check your email to confirm your account").
5. Google sign-in (optional): Authentication > Providers > Google, paste the client ID and secret from step 2.

## 2. Google OAuth client (only if you offer Google sign-in)

In Google Cloud Console > APIs & Services:

1. Credentials > Create credentials > OAuth client ID > Web application.
   - Authorized JavaScript origins: `https://app.example.com`
   - Authorized redirect URIs: `https://<production-project-ref>.supabase.co/auth/v1/callback`
2. OAuth consent screen: set the app name, support email, and your domain, then **publish the app to production**. While it is in testing, only listed test users can sign in.
3. Copy the client ID and secret into Supabase (step 1.5).

## 3. Create the server

Recommended size: 2 vCPUs, 4 GB RAM, 50 GB disk, Ubuntu 24.04 LTS. The Next.js build needs about 2 GB of memory; with less, add swap (step 4). No GPU is needed: the trainer fits template models on the CPU.

### Option A: Vultr

1. Products > Compute > Deploy: Cloud Compute (shared CPU, Regular or High Performance), a region near your users, Ubuntu 24.04 LTS x64, the 2 vCPU / 4 GB plan.
2. Add your SSH key, set a hostname such as `physiotrace-prod`, and deploy.
3. Network > Firewall: create a group allowing inbound TCP 22 (from your IP only if possible), 80, and 443, and attach it to the instance.
4. Optional: a Reserved IP keeps the address if you rebuild the server.

### Option B: AWS

Either service works; Lightsail is simpler, EC2 is more flexible.

- **Lightsail:** Create instance > Linux/Unix > OS Only > Ubuntu 24.04 LTS > the 4 GB plan. Then Networking: attach a static IP and allow TCP 22, 80, and 443 in the IPv4 firewall.
- **EC2:** Launch instance > Ubuntu Server 24.04 LTS > `t3.medium` (2 vCPU, 4 GiB) > 50 GiB gp3 > a key pair. Security group: inbound TCP 22 (your IP), 80 and 443 (anywhere). Then allocate an Elastic IP and associate it with the instance.

## 4. Point your domain at the server

At your DNS provider (your registrar, Route 53, Vultr DNS, or Cloudflare), create:

| Type | Name | Value |
| --- | --- | --- |
| A | `app` | your server's IPv4 address |
| A | `api` | your server's IPv4 address |

Add matching AAAA records if the server has IPv6. If you use Cloudflare, leave the records as "DNS only" (grey cloud) until Caddy has issued certificates. Check propagation with `dig +short app.example.com`.

## 5. Prepare the server

SSH in as the default user (`root` on Vultr, `ubuntu` on AWS):

```bash
sudo apt update && sudo apt -y full-upgrade
sudo apt -y install git curl ufw unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Firewall: SSH, HTTP, HTTPS only
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw --force enable

# Swap, if the server has less than 4 GB of RAM
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# A dedicated user that runs the app
sudo adduser --disabled-password --gecos "" physio
```

Install Node.js 24 LTS and Caddy:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt -y install nodejs

sudo apt -y install debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt -y install caddy
```

Install uv for the app user (it also installs the pinned Python 3.12):

```bash
sudo -iu physio bash -c 'curl -LsSf https://astral.sh/uv/install.sh | sh'
```

## 6. Get the code and configure it

```bash
sudo mkdir -p /opt/physiotrace && sudo chown physio:physio /opt/physiotrace
sudo -iu physio
git clone https://github.com/BenTheOOF/hack-the-change-2026.git /opt/physiotrace
cd /opt/physiotrace
git checkout feat/physiotrace   # or main, once the work is merged
cp .env.example .env && chmod 600 .env
nano .env
```

Set these in `/opt/physiotrace/.env`. This single file is read by the web app, the API, and the trainer. Never commit it.

| Variable | Production value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<production-project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the production `sb_publishable_...` key |
| `SUPABASE_SECRET_KEY` | the production `sb_secret_...` key (server only) |
| `NEXT_PUBLIC_API_URL` | `https://api.example.com` |
| `CORS_ORIGINS` | `https://app.example.com` |
| `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` (Gemini) |
| `LLM_API_KEY` | your Gemini API key (leave empty to turn the assistant off) |
| `LLM_MODEL` | for example `gemini-3.5-flash-lite` |
| `LLM_MAX_TOKENS` | `512` |
| `ADMIN_EMAILS` | your email; it becomes admin on its first Google sign-in |

`NEXT_PUBLIC_*` values are compiled into the web app when it is built. After changing any of them, rebuild (step 7) and restart the web service.

## 7. Build

Still as the `physio` user, from `/opt/physiotrace`:

```bash
# API dependencies (no dev or ML extras)
cd backend && ~/.local/bin/uv sync --frozen --no-dev && cd ..

# Web app. The build first downloads the pinned MediaPipe pose model (about 9 MB) from Google.
cd frontend && npm ci && npm run build && cd ..
exit
```

## 8. Run everything as services

Create the three systemd units with `sudo nano`, then enable them.

`/etc/systemd/system/physiotrace-api.service`:

```ini
[Unit]
Description=PhysioTrace API
After=network-online.target
Wants=network-online.target

[Service]
User=physio
WorkingDirectory=/opt/physiotrace/backend
ExecStart=/opt/physiotrace/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2 --proxy-headers --forwarded-allow-ips 127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/physiotrace-web.service`:

```ini
[Unit]
Description=PhysioTrace web app
After=network-online.target
Wants=network-online.target

[Service]
User=physio
WorkingDirectory=/opt/physiotrace/frontend
Environment=NODE_ENV=production
ExecStart=/opt/physiotrace/frontend/node_modules/.bin/next start --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/physiotrace-worker.service`, which trains therapist-defined exercises:

```ini
[Unit]
Description=PhysioTrace exercise trainer
After=network-online.target
Wants=network-online.target

[Service]
User=physio
WorkingDirectory=/opt/physiotrace/backend
# NumPy only. Do not use scripts/worker.sh here: its "ml" group installs CUDA PyTorch on Linux (several GB).
ExecStart=/home/physio/.local/bin/uv run --frozen --no-dev --with "numpy>=2.5.4" python ../ml/worker.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now physiotrace-api physiotrace-web physiotrace-worker
systemctl status physiotrace-api physiotrace-web physiotrace-worker --no-pager
```

## 9. HTTPS with Caddy

Replace `/etc/caddy/Caddyfile` with:

```caddy
app.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}

api.example.com {
	encode zstd gzip
	# Demo videos are up to 50 MiB.
	request_body {
		max_size 60MB
	}
	reverse_proxy 127.0.0.1:8000
}
```

```bash
sudo systemctl reload caddy
```

Caddy requests and renews Let's Encrypt certificates on its own once DNS points at the server and ports 80 and 443 are open.

## 10. Check it works

```bash
curl -s https://api.example.com/health          # {"status":"ok"}
curl -sI https://app.example.com | head -1      # HTTP/2 200
```

Then in a browser:

1. Open `https://app.example.com/demo` and run a simulated rep.
2. Sign in with Google using an address in `ADMIN_EMAILS`. You should land on the Admin console.
3. In the Admin console, make a second test account a therapist and assign a patient. Check that the therapist sees the patient under Patients & plans.
4. Start a live session on a phone and allow the camera (only works over HTTPS).
5. Add a custom exercise and confirm it moves from Queued to Ready within a few seconds (the trainer is working).
6. Ask a question in Ask PhysioTrace (needs `LLM_*` set).

## Updating to a new version

```bash
sudo -iu physio
cd /opt/physiotrace && git pull
cd backend && ~/.local/bin/uv sync --frozen --no-dev && cd ..
cd frontend && npm ci && npm run build && cd ..
exit
sudo systemctl restart physiotrace-api physiotrace-web physiotrace-worker
```

If the update adds files under `backend/supabase/migrations/`, push them to the production project from your computer first (`npx supabase db push --remote --dry-run`, then without `--dry-run`). Back up before pushing: Supabase Database > Backups.

## Operating it

- **Logs:** `journalctl -u physiotrace-api -f` (same for `-web`, `-worker`, and `caddy`).
- **Restart one piece:** `sudo systemctl restart physiotrace-web`.
- **Backups:** the database and storage live in Supabase. Paid plans include daily backups and point-in-time recovery; the server itself holds no patient data, only code and `.env`. Keep a copy of `.env` in a password manager.
- **Secrets:** `SUPABASE_SECRET_KEY` and `LLM_API_KEY` exist only in `/opt/physiotrace/.env` (mode 600). Rotate them in Supabase or Google if the server is ever compromised.
- **Security updates:** unattended-upgrades installs OS patches. Run `sudo apt full-upgrade` and reboot monthly.
- **Monitoring:** point an uptime checker (for example UptimeRobot) at `https://api.example.com/health` and `https://app.example.com`.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Dashboard says "The PhysioTrace API did not respond" | API service down | `systemctl status physiotrace-api`, then `journalctl -u physiotrace-api -n 50` |
| "Could not reach the PhysioTrace API" or CORS errors in the console | `NEXT_PUBLIC_API_URL` or `CORS_ORIGINS` wrong | Fix `.env`, rebuild the web app, restart both services |
| "The database is missing a PhysioTrace migration" | Migrations not pushed to production | `npx supabase db push --remote` from `backend/` |
| Google sign-in returns to the login page with an error | Redirect URL not allowed | Add `https://app.example.com/auth/callback` in Supabase URL Configuration; check the Google client's redirect URI |
| Only some people can use Google sign-in | Consent screen still in testing | Publish the OAuth app in Google Cloud |
| Camera never starts | Page not on HTTPS | Use `https://app.example.com`, never the raw IP |
| Custom exercises stay Queued | Trainer not running | `systemctl status physiotrace-worker` and its journal |
| Certificate errors | DNS not pointing at the server, or ports closed | Check `dig`, the provider firewall, and `ufw status`; then `journalctl -u caddy` |
| Build killed or very slow | Not enough memory | Add swap (step 5) or use a 4 GB server |

## Other ways to host it

- **Web app on Vercel, API on your server:** the starter already supports Vercel for the frontend. Point `app.example.com` at Vercel, keep steps 5 to 9 for the API and trainer, and drop the `app.example.com` block from Caddy. `scripts/push-env vercel` copies the public variables.
- **API on Fly.io:** `backend/Dockerfile` and `backend/fly.toml` deploy the API alone; the trainer still needs a host.
- **Self-hosting Supabase** on the same server is possible but adds Postgres, auth, and storage operations to your workload; the hosted project is recommended.
