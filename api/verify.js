// Vercel serverless function — POST /api/verify
// Verifies submitted flags strictly from .env variables.
// The flags are never hardcoded in the source code.

import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const MATCH = {
  q1: { stripSpaces: true },
  q2: { stripSpaces: true },
  q3: { stripSpaces: true },
  q4: { stripSpaces: true },
};

// Point values per challenge
const POINTS = {
  q1: 100,
  q2: 150,
  q3: 200,
  q4: 150,
};

const SOLVES_FILE = path.resolve(process.cwd(), "data", "solves.json");

function getLocalSolves() {
  try {
    if (fs.existsSync(SOLVES_FILE)) {
      const data = fs.readFileSync(SOLVES_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("[solves] Failed to read solves:", err);
  }
  return [];
}

function saveLocalSolve(solve) {
  try {
    const dir = path.dirname(SOLVES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const solves = getLocalSolves();
    const alreadySolved = solves.some(
      (s) => s.userId === solve.userId && s.challengeId === solve.challengeId
    );
    if (!alreadySolved) {
      solves.push(solve);
      fs.writeFileSync(SOLVES_FILE, JSON.stringify(solves, null, 2), "utf8");
    }
    return !alreadySolved;
  } catch (err) {
    console.error("[solves] Failed to save solve:", err);
    return false;
  }
}

const RATE_LIMIT = { windowMs: 60_000, max: 30 };
const windows = new Map();

function rateLimited(ip) {
  const now = Date.now();
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

function normalize(raw, { stripSpaces = false } = {}) {
  let s = String(raw).normalize("NFC").trim().toLowerCase();
  if (stripSpaces) s = s.replace(/\s+/g, "");
  return s;
}

// Read directly from .env / .env.local if not populated in process.env
function loadEnvFallback() {
  if (process.env.LTCOE_FLAG_Q1) return;
  try {
    for (const filename of [".env", ".env.local"]) {
      const full = path.resolve(process.cwd(), filename);
      if (fs.existsSync(full)) {
        const content = fs.readFileSync(full, "utf8");
        for (const line of content.split(/\r?\n/)) {
          const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
          if (!m) continue;
          const key = m[1];
          let value = m[2].trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = value;
          }
        }
      }
    }
  } catch (err) {
    // Ignore fallback reading errors
  }
}

// Fetch flag strictly from environment variables (.env)
function flagFor(id) {
  loadEnvFallback();
  let value;
  switch (id) {
    case "q1": value = process.env.LTCOE_FLAG_Q1; break;
    case "q2": value = process.env.LTCOE_FLAG_Q2; break;
    case "q3": value = process.env.LTCOE_FLAG_Q3; break;
    case "q4": value = process.env.LTCOE_FLAG_Q4; break;
    default: return null;
  }
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function matches(expected, actual) {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
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
    return res.status(200).json({ ok: false, reason: "unset" });
  }

  const answerOk = matches(normalize(expected, rules), normalize(body.answer, rules));
  if (!answerOk) {
    return res.status(200).json({ ok: false, reason: "wrong" });
  }

  // ---- Answer is CORRECT! ----

  let resolvedUserId = body.userId || "guest_player";
  let resolvedDisplayName = body.displayName || "Anonymous Player";

  // If user is authenticated, resolve identity and try recording to Supabase
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (token && supabaseUrl && supabaseServiceKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: userData, error: authError } = await supabase.auth.getUser(token);
      const user = userData?.user;

      if (user && !authError) {
        resolvedUserId = user.id;
        resolvedDisplayName =
          user.user_metadata?.display_name ||
          user.email?.split("@")[0] ||
          body.displayName ||
          "Player";

        // Non-blocking Supabase sync if table exists
        supabase
          .from("challenge_solves")
          .insert({
            user_id: user.id,
            challenge_id: body.id,
            points_awarded: POINTS[body.id],
          })
          .then(() => {})
          .catch(() => {});
      }
    } catch (dbErr) {
      // Supabase is optional; don't block solve
    }
  }

  // Record solve to local solves store so leaderboard updates immediately
  saveLocalSolve({
    userId: resolvedUserId,
    displayName: resolvedDisplayName,
    challengeId: body.id,
    points: POINTS[body.id],
    solvedAt: new Date().toISOString(),
  });

  return res.status(200).json({
    ok: true,
    correct: true,
    points: POINTS[body.id],
  });
}