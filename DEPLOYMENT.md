# Vercel deployment — admin only

This repository is deployed as a **single Vercel project serving only the
admin dashboard** (`admin/`), at the domain root (`/`).

The **customer POS (`client/`)** is not part of this deployment and is never
built here. Set the Vercel **Root Directory to `admin`** (Project → Settings →
Build and Deployment Settings) so Vercel ignores `client/` entirely.

## Required project settings

These live in the Vercel dashboard, not in this repo:

- **Root Directory: `admin`** — Vercel builds only `admin/` and never touches
  `client/`. Do not change this unless you intend to add the client as a
  service.
- **Framework Preset:** "Other" — Vite is detected automatically per service.
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** leave empty (`npm install`).
- **Environment variables:**
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_POS_APP_URL` is no longer used by the admin: the landing page's
    call-to-action buttons open the downloads section and the only sign-in
    link points at the console's own `/login`.

## Routing

`admin/vercel.json` defines the entire route table for this deployment:

1. `handle: filesystem` — real static assets (`/assets/*`, `/favicon.svg`) are
   served first.
2. Anything else with a file extension (`/.*\.[a-zA-Z0-9]+$`) → explicit `404`
   so missing assets never fall back to HTML.
3. Everything else → `/index.html` — React Router (with `basename="/"`) handles
   deep links (`/login`, `/logs`, `/landing`, `/users`, `/settings`, …).

## URLs

| Page | URL |
|---|---|
| Admin landing / marketing | `/` |
| Admin login | `/login` |
| Admin dashboard + console | `/`, `/users`, `/logs`, `/settings`, … |
| Admin console sign-in | `/login` |
| POS installers | `/` → Download section (published releases only) |

## Local checks

```bash
cd admin
npm install
npm run build   # writes admin/dist/{index.html,assets/*}
npm run preview # http://localhost:5174/
```

## If you add the client back later

Create a root `vercel.json` with two services (`admin` at `/admin`, `client` at
`/`), set the Vercel Root Directory back to the repository root, set Framework
Preset to "Services", and redeploy. The `client/` build uses `npm ci
--ignore-scripts` so its `cloudflared` postinstall does not run during builds.
