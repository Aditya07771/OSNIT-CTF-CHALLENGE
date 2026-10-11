# LTCOE OSINT Board — Supabase Setup

This project uses Supabase Auth + PostgreSQL + Realtime, plus the existing
Vercel serverless function for server-side flag checking. The frontend is a Vite
React app with client-side routing (`/challenges`, `/leaderboard`).

## 1. Create a Supabase project

1. Go to https://supabase.com → **New project**. Choose a name, region and DB password.
2. Wait for provisioning to finish.

## 2. Find your keys

**Project Settings → API:**

| Value | Env var | Where it is used |
|-------|---------|------------------|
| Project URL | `VITE_SUPABASE_URL` / `SUPABASE_URL` | frontend + server |
| Publishable / anon key | `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend only |
| Service role / secret key | `SUPABASE_SERVICE_ROLE_KEY` | server only — NEVER in the frontend |

## 3. Run the SQL schema

This step is **required** — without it, correct flags will still fail to record
points (the API returns `server_error` because the tables don't exist).

**Option A — Dashboard (simplest):**
1. Supabase Dashboard → **SQL Editor → New query**.
2. Paste the whole of `supabase/schema.sql` and click **Run**.

**Option B — one command locally:**
1. Supabase → **Project Settings → Database → Connection string → URI**, copy it.
2. Add it to `.env.local`:
   ```
   SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres
   ```
3. Run `npm run db:migrate`.

Either way it creates `profiles`, `challenge_solves`, RLS policies, the
auto-profile trigger, the public `leaderboard` view, and backfills profiles for
users who signed up before the tables existed.

Notes:
- The `leaderboard` view is a **security-definer view** owned by `postgres`. It
  exposes only public columns (`user_id`, `display_name`, points, solved count).
  It never exposes emails. This is required so anonymous visitors can read the
  leaderboard while `profiles` RLS still blocks reading other users' rows.
- `challenge_solves` has **no insert/update/delete** policies. Rows are written
  only by `api/verify.js` using the service-role key (which bypasses RLS), so the
  browser cannot insert fake solves or change points.
- The unique constraint `(user_id, challenge_id)` makes duplicate points
  impossible even under concurrent requests.

## 4. Configure Authentication

**Authentication → Providers → Email** should be enabled.

For local development, if you don't want to wait for/confirm emails:
**Authentication → Providers → Email → turn OFF "Confirm email"**. This is a
local convenience only — keep confirmation ON in production.

If confirmation is ON, after registering a user must click the link in the email
before they can log in. The register form shows an on-screen notice for this.

**Authentication → URL Configuration:**
- Site URL: your deployed URL, e.g. `https://your-app.vercel.app`
- Redirect URLs: add `http://localhost:5173/**` and your Vercel URL.

### About the errors you saw

- **`Cookie "__cf_bm" has been rejected for invalid domain`** — harmless.
  Cloudflare (in front of Supabase) sets a bot-management cookie; the browser
  refuses it. Nothing to fix, no impact on auth.
- **`429 ... over_email_send_rate_limit` on `/auth/v1/signup`** — Supabase's
  built-in outbound email limit was hit (default ~2–4 emails/hour on the free
  tier). This is **not** a code bug. Fix by either waiting, disabling "Confirm
  email" for development, or configuring custom SMTP
  (**Authentication → Emails → SMTP Settings**). Production should use real SMTP.

## 5. Enable Realtime

1. Dashboard → **Database → Replication** (or **Realtime**).
2. Under the `supabase_realtime` publication, enable the **`challenge_solves`**
   table.

Without this the leaderboard still loads (initial query works) but will not
update live; the UI degrades gracefully.

## 6. Environment variables

### Local `.env.local`
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable/anon key>

SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role/secret key>

LTCOE_FLAG_Q1=<flag>
LTCOE_FLAG_Q2=<flag>
LTCOE_FLAG_Q3=<flag>
LTCOE_FLAG_Q4=<flag>
```

### Vercel (Settings → Environment Variables)
Add all of the above. The `VITE_*` ones are compiled into the frontend; the
non-prefixed ones are only readable inside serverless functions.

## 7. Run locally

```bash
npm install
npm run dev        # Vite, port 5173 — works locally (see note)
# or
npx vercel dev     # full Vercel environment
```

`npm run dev` serves both the frontend and `/api/verify`: `vite.config.js` loads
`.env` (all vars, including the non-public flags/service key, server-side only)
and runs the real serverless handler through a dev-only Vite middleware. So flag
checking works without `vercel dev`. `npx vercel dev` uses the actual Vercel
function instead.

## 8. Deploy

Push to GitHub → import into Vercel (Vite is auto-detected) → add env vars →
Deploy. `vercel.json` rewrites non-`/api` routes to `index.html` so
`/challenges` and `/leaderboard` work on refresh.

## 9. Test with two accounts

1. Register user A in one browser, solve `q1` with the correct flag → `CORRECT`, +100.
2. Submit the same flag again → `CORRECT` but points are not re-added.
3. Submit a wrong flag → `INCORRECT`, no points.
4. Open a second browser / incognito, register user B, and open `/leaderboard`.
   Solve as user A and watch the leaderboard update without a refresh.
5. Log in as A on the second browser — solved challenges and points load from
   Supabase (not localStorage).
6. As A, try to change B's profile — not possible (RLS + server-derived user id).

## Points

| Challenge | Points |
|-----------|--------|
| q1 | 100 |
| q2 | 150 |
| q3 | 200 |
| q4 | 150 |

Total 600. Point values are authoritative in `api/verify.js` and the database;
the browser can never supply a point value.
