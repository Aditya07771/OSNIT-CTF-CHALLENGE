# LTCOE OSINT Board

A React + Vite board with a small Vercel serverless function for flag checking.
No accounts. Progress is saved in the visitor's browser (localStorage).

Answers are **never in the repository**. They live in environment variables and
are compared on the server, so the flags are not readable from the shipped
JavaScript.

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the answers
npx vercel dev               # not `npm run dev` — see below
```

Use `vercel dev`, because the flag check is an API route. Plain `npm run dev`
serves only the frontend and every submission will fail with "Couldn't reach the
answer checker." Running under `vercel dev` also applies the real rate limit.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Vercel → **Add New → Project** → import the repo. Framework is auto-detected
   as Vite (build `npm run build`, output `dist`).
3. **Settings → Environment Variables**, add one per challenge:

   | Variable | Value |
   |----------|-------|
   | `LTCOE_FLAG_Q1` | `flag{12.3456,78.9012}` |
   | `LTCOE_FLAG_Q2` | `LTCOE{...}` |
   | `LTCOE_FLAG_Q3` | `LTCOE{...}` |
   | `LTCOE_FLAG_Q4` | `LTCOE{City1_City2_City3}` |

   Apply to Production (and Preview if you want previews solvable).
4. Deploy.

The id in the variable name must match a challenge `id` in `src/challenges.js`
(`q1` → `LTCOE_FLAG_Q1`). A challenge whose variable is unset reports "answer key
not set yet" rather than silently rejecting everyone.

## Setting or changing an answer

Change the env var and redeploy — no code edit, no rebuild of the board. Use
**exactly the same string** the player is expected to type; comparison is
case-insensitive with surrounding whitespace ignored, and Latvian diacritics
must match.

## How verification works

`api/verify.js` normalises the submitted answer with the same rule the board
used before (NFC → trim → lowercase, plus strip-all-whitespace for `q1`) and
compares it against the env var with `timingSafeEqual`.

Those per-challenge matching rules live in `api/verify.js`, not in
`challenges.js`, on purpose: if the client chose its own normalisation it could
loosen them to widen what counts as a match.

### Rate limiting

20 attempts per IP per minute, in-memory per instance. This is a speed bump
against casual scripted guessing, **not** a security boundary — serverless
instances are ephemeral and multiply horizontally, so a determined attacker
spreads attempts across them. If real prizes are on the line, put Vercel WAF or
an Upstash Redis limiter in front of `/api/verify`.

Resist adding a client-side hash as well. It would only re-expose the answers in
the bundle, since the comparison salt has to ship too.

## Files

- `api/verify.js` – serverless flag check; the only place answers are read
- `src/challenges.js` – challenge text, images, riddles. No answers, no hashes
- `public/` – challenge images and `downloads/challenge-repo.zip`
- `.env.example` – template for the `LTCOE_FLAG_*` variables

Keep the git challenge's own manifest, verify script and build script out of
this project, since those contain its answers.