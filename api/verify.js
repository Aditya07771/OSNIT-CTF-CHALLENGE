// Vercel serverless function — POST /api/verify
//
// The real answers live in environment variables and never leave the server.
// Nothing answer-like is shipped to the browser, so a participant cannot read
// the flags out of the JS bundle or "view source".
//
// One variable per challenge:
//
//   LTCOE_FLAG_Q1=flag{12.3456,78.9012}
//   LTCOE_FLAG_Q2=LTCOE{...}
//   LTCOE_FLAG_Q3=LTCOE{...}
//   LTCOE_FLAG_Q4=LTCOE{...}
//
// Set them in the Vercel dashboard (Settings → Environment Variables), or in a
// local .env.local when running `npx vercel dev`.

import { timingSafeEqual } from "node:crypto";

// Per-challenge answer matching. This deliberately lives on the server rather
// than in challenges.js: if the client could pick its own normalisation rules,
// a caller could loosen them to widen what counts as a match.
const MATCH = {
  q1: { stripSpaces: true },
  q2: { stripSpaces: false },
  q3: { stripSpaces: false },
  q4: { stripSpaces: false },
};

// Naive in-memory throttle. Serverless instances are ephemeral and multiply, so
// treat this as a speed bump that stops casual scripted guessing, not as a
// security boundary. If prizes are on the line, front this with Vercel WAF or
// an Upstash Redis limiter.
const RATE_LIMIT = { windowMs: 60_000, max: 20 };
const windows = new Map();

function rateLimited(ip) {
  const now = Date.now();

  // Opportunistic sweep so a long-lived warm instance cannot grow unbounded.
  if (windows.size > 5000) {
    for (const [key, entry] of windows) {
      if (now > entry.resetAt) windows.delete(key);
    }
  }

  const entry = windows.get(ip);
  if (!entry || now > entry.resetAt) {
    windows.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT.max;
}

// Must mirror the old client-side rule: NFC first so Latvian diacritics
// compare equal, then trim and lowercase, then optionally drop all whitespace.
function normalize(raw, { stripSpaces = false } = {}) {
  let s = String(raw).normalize("NFC").trim().toLowerCase();
  if (stripSpaces) s = s.replace(/\s+/g, "");
  return s;
}

function flagFor(id) {
  const value = process.env[`LTCOE_FLAG_${id.toUpperCase()}`];
  return typeof value === "string" && value.trim() ? value : null;
}

function matches(expected, actual) {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  // timingSafeEqual throws on a length mismatch, so short-circuit first. Flag
  // length is not a secret we are meaningfully protecting anyway.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, reason: "method_not_allowed" });
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ ok: false, reason: "rate_limited" });
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body;
  if (!body || typeof body.id !== "string" || typeof body.answer !== "string") {
    return res.status(400).json({ ok: false, reason: "bad_request" });
  }

  const rules = MATCH[body.id];
  if (!rules) {
    return res.status(400).json({ ok: false, reason: "unknown_challenge" });
  }

  const expected = flagFor(body.id);
  if (!expected) {
    // Distinct from "wrong" so the UI can tell players to contact an organiser
    // rather than telling them to keep guessing.
    return res.status(200).json({ ok: false, reason: "unset" });
  }

  const ok = matches(normalize(expected, rules), normalize(body.answer, rules));
  // Always name the reason. A bare {ok:false} would make a wrong answer
  // indistinguishable from a malformed request on the client.
  return res.status(200).json({ ok, reason: ok ? undefined : "wrong" });
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}