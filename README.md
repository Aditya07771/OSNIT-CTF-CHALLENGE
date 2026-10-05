# LTCOE OSINT Board

A single static page (React + Vite). No backend, no accounts. Progress is saved in the visitor's browser (localStorage).

## Run locally
```bash
npm install
npm run dev
```

## Deploy to Vercel
1. Push this folder to a GitHub repo.
2. On vercel.com choose **Add New → Project**, import the repo.
3. Vercel detects Vite automatically (build: `npm run build`, output: `dist`). Click **Deploy**.

CLI alternative: `npx vercel --prod` from this folder.

## Set or change an answer
Answers are stored as salted SHA-256 hashes in `src/challenges.js`, not as plain text.

```bash
npm run hash -- q1 "flag{13.1234,100.5678}"
npm run hash -- q4 "LTCOE{City1_City2_City3}"
```

Paste the printed value into that challenge's `hash` field (replace `null`).
Submissions are matched case-insensitively with surrounding spaces ignored; Latvian diacritics must match.

Note: hashing hides flags from "view source", but it is client-side only. Someone could still brute-force a
short or guessable answer offline. That is fine for a casual event; for prizes, use a server-side check.

## Files
- `src/challenges.js` – challenge text, images, hashes
- `public/` – challenge images and `downloads/challenge-repo.zip` (the git challenge)
- Only the git repository itself is shipped for the git challenge. Keep its manifest, verify script and build script out of this project, since they contain the answers.
