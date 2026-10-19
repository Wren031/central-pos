# Real email verification — Supabase setup

The POS client (`../client`) registers users through **Supabase Auth** and
requires them to **confirm their email via the confirmation link** before the
account is usable. Supabase sends the link; the app never generates or stores
any verification code.

Everything below is **dashboard configuration** (it cannot live in code). The
SQL side is `08_email_verification.sql` (applied by `seed.ps1` / `seed.mjs`).

## 1. Environment variables (client)

In `client/.env.local`:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon / publishable key>
```

Only the **anon** key goes in the browser. The `service_role` key must never be
placed in a `VITE_` variable.

## 2. Enable email confirmation

Dashboard → **Authentication → Providers → Email**:

- Enable the **Email** provider.
- Turn **Confirm email** ON. (Unconfirmed users cannot sign in.)

## 3. Email template — confirmation LINK

Dashboard → **Authentication → Email Templates → Confirm signup**.

Use the template in **`supabase/email-templates/confirm-signup.html`**
(copy-paste it into the editor and **Save**). It contains the
`{{ .ConfirmationURL }}` link. When the user clicks it, Supabase confirms the
email and redirects to `…/auth/confirm`, where the app finishes creating the
account.

## 4. Allow the redirect URL

Dashboard → **Authentication → URL Configuration**:

- **Site URL** — where the POS client runs (e.g. `http://localhost:5173`).
- **Redirect URLs** — add the client's confirm route for every environment:
  - `http://localhost:5173/auth/confirm`
  - `https://<your-production-domain>/auth/confirm`

If this URL is not allow-listed, Supabase refuses the redirect and the app never
receives the confirmation.

## 5. SMTP — REQUIRED to actually receive emails

The built-in Supabase mailer is **rate-limited and frequently filtered to spam**.
If no verification email arrives, this is almost always why. Configure a real
SMTP provider:

Dashboard → **Project Settings → Auth → SMTP** (or **Authentication → Emails →
SMTP Settings**):

| Field | Example (Resend) | Example (Brevo) |
| --- | --- | --- |
| Host | `smtp.resend.com` | `smtp-relay.brevo.com` |
| Port | `465` | `587` |
| Username | `resend` | your Brevo login |
| Password | your API key | your SMTP key |
| Sender email | `noreply@yourdomain.com` | `noreply@yourdomain.com` |
| Sender name | `Central POS` | `Central POS` |

Any transactional provider works (Resend, Brevo, SendGrid, Mailgun, Amazon SES).
Verify your sending domain with the provider so the messages aren’t marked as
spam. After saving, use the dashboard’s **Send test email** to confirm delivery.

Then raise limits: Dashboard → **Authentication → Rate Limits** → increase the
**Email** / **emails sent** limits.

> The default `noreply@mail.supabase.io` sender and the shared mailer can take a
> long time, deliver only a couple of messages per hour, and often land in spam —
> always configure custom SMTP before testing with real users.

## 5b. "No email arrives" / "Too many attempts…"

- **No email at all?** Check, in order:
  1. **Confirm email** is ON (section 2).
  2. **Custom SMTP** is configured (section 5).
  3. The address isn’t in **spam/junk** and you used a real inbox you can open.
  4. **URL Configuration** includes `<origin>/auth/confirm` (section 4).
- **"Too many attempts…" / rate limit:** that is Supabase’s server-side email
  limit (HTTP 429), not something the app enforces. Configure custom SMTP and
  raise **Authentication → Rate Limits** (section 5).
- **"Email confirmation is turned off…"**: `signUp` returned an already-confirmed
  user or a session, which means **Confirm email** is OFF — turn it on (section 2).
- The client no longer masks send failures: if the email can’t be sent, the
  registration screen now shows the real reason instead of a false “check your
  email”.

## 6. Apply the SQL

From `admin/`:

```
.\supabase\seed.ps1 -Token <supabase-access-token>
```

or paste `08_email_verification.sql` into the Supabase SQL editor. It adds
`public.is_email_verified()` and gates the `stores` / `pos_sales` insert
policies on a confirmed email (admins bypass).

## 7. How verification is proven

`signUp` is called with `emailRedirectTo = <origin>/auth/confirm`. When the user
clicks the link, Supabase confirms the email and redirects back; the
`/auth/confirm` route reads the session and only proceeds when Supabase reports
`email_confirmed_at`. A link click (or any client-side state) is never treated
as proof on its own.

## 8. "I already created an account but can't sign in"

Registration creates the **Supabase** account first (to send the confirmation
link) and the **local** POS account when the redirect completes. If a user
confirms on another device, abandons the flow before it finishes, or clears
browser data, they may have a Supabase account but no local record to sign in
with.

The app self-heals this: if a local sign-in fails while online, it
re-authenticates against Supabase. When the credentials are valid **and the
email is confirmed** and no local account exists yet, it creates the local
account (and its 30-day trial) from the details captured at signup, then signs
the user in. Existing local accounts are never overwritten, and offline sign-in
for them is unchanged.

If a user is still stuck, have them **register again with the same email** —
unconfirmed accounts get a fresh link, and already-confirmed accounts are routed
to sign-in (which triggers the repair above).
