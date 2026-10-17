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
Capacitor app, which runs on `https://localhost`). On a plain-`http://` LAN
address such as `http://192.168.1.20:5173`, the camera is blocked by the browser
and the app shows a "not a secure context" message — USB barcode scanning still
works there.

### Testing the camera on a phone/tablet (dev server)

1. Add `VITE_DEV_HTTPS=1` to `client/.env.local`.
2. Run `npm run dev` and open `https://<your-pc-ip>:5173` on the device.
3. Accept the self-signed certificate warning once.

That flag serves the dev server over HTTPS with LAN access (via
`@vitejs/plugin-basic-ssl`). It is opt-in and dev-only, so `npm run preview` and
the Playwright suite stay on `http://localhost`.

No-HTTPS alternative: proxy the dev server to the device with
`adb reverse tcp:5173 tcp:5173`, then open `http://localhost:5173` (localhost is
already a secure context).

### Production

A deployed **web** build must be served over HTTPS (TLS at the host or reverse
proxy) for the camera to work — there is no client-side workaround for an
insecure origin. The Android build already uses a secure WebView origin.
