# Vercel deployment

This repository is deployed as **one Vercel project with two Vite services**,
defined in [`vercel.json`](./vercel.json):

| Service  | Public path | Source  | Output         |
| -------- | ----------- | ------- | -------------- |
| `client` | `/`         | `client`| `client/dist`  |
| `admin`  | `/admin`    | `admin` | `admin/dist`   |

## Required project settings

These live in the Vercel dashboard (Project → Settings), not in this repo:

- **Root Directory: the repository root** (leave it empty / `./`).
  It must **not** be `admin`. If it is, Vercel ignores the root `vercel.json`,
  builds only the admin app at `/`, and `/admin/*` returns 404.
- **Framework Preset:** "Other" (the root has no framework; each service's
  framework is set in `vercel.json`).
- **Build Command / Output Directory:** leave empty. Each service uses the
  Vite preset (`npm run build` → `dist`).
- **Environment variables** (shared by both services):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_POS_APP_URL` — optional. Leave unset when the client is on the same
    origin (admin links then resolve to `/register` and `/login`).

## How the admin is served under `/admin`

Vercel serves a service's static files by the **original request path**. A
request for `/admin/assets/index-abc.js` is looked up as
`admin/dist/admin/assets/index-abc.js`, so the admin build emits its files under
`dist/admin` (`base: '/admin/'` in `admin/vite.config.ts`).

`admin/vercel.json` does not exist on purpose; the routing is:

1. Top-level rewrites send `/admin` and `/admin/*` to the `admin` service.
2. Inside the service, `routes` run in this order:
   - `handle: filesystem` — real assets are served first.
   - `/admin/assets/*` → explicit `404` (missing assets never fall back to HTML).
   - `/admin`, `/admin/`, `/admin/*` → `/admin/index.html` (SPA deep links,
     handled by React Router with `basename="/admin"`).
3. Everything else goes to the `client` service, whose `routes` follow the same
   filesystem → asset-404 → SPA-fallback order.

## Local checks

```bash
npm --prefix admin run build    # writes admin/dist/admin/**
npm --prefix client run build   # writes client/dist/**
```

The admin build cleans `admin/dist` first so stale top-level assets are never
deployed.
