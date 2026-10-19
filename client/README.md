# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Camera & networking

The barcode scanner's camera mode uses `getUserMedia`, which browsers only allow
on **secure contexts**: `https://` origins and `http://localhost` (plus the
Capacitor app, which runs on `https://localhost`). So the camera works when you
run the dev server locally at `http://localhost:5173`.

A plain-`http://` LAN address such as `http://192.168.1.20:5173` is **not** a
secure context, so the browser blocks the camera there (USB barcode scanning
still works). To use the camera from a phone/tablet, either:

- build and run the **Capacitor app** (secure local origin — no setup), or
- serve the app over a **trusted HTTPS tunnel** and open the generated
  `https://…` URL on the device.

### Testing the camera on a phone via tunnel

A quick [Cloudflare tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
gives a real, trusted `https://…trycloudflare.com` URL with **no certificate
warning**, so the phone camera works. `cloudflared` ships as a dev dependency
(the `cloudflared` npm wrapper), so no separate install is needed:

```bash
npm run preview:tunnel   # builds, serves the bundle on :4173, and opens a tunnel
# or
npm run dev:tunnel       # dev server on :5173 + tunnel (live HMR, but slower through the tunnel)
```

Open the printed `https://<random>.trycloudflare.com` URL on the phone and allow
the camera. Notes:

- **Prefer `preview:tunnel` for phone testing.** The dev server streams hundreds
  of separate module requests, which is unreliable through a quick tunnel; the
  bundled build is a couple of files and loads consistently.
- The tunnel URL is **public and random each run** — dev/testing only (app data
  stays in the phone's own IndexedDB, nothing is uploaded).
- Both dev and preview servers allow the `.trycloudflare.com` host
  (`server`/`preview` `allowedHosts` in `vite.config.ts`), which Vite otherwise
  blocks by default.
- Needs internet; a quick tunnel has no uptime guarantee.

A self-signed dev certificate is intentionally **not** used, because browsers
always show an `ERR_CERT_AUTHORITY_INVALID` warning for it.

### Production

A deployed **web** build must be served over HTTPS (TLS at the host or reverse
proxy) for the camera to work — there is no client-side workaround for an
insecure origin. The Android build already uses a secure WebView origin.
