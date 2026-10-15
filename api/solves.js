// Vercel serverless function — GET /api/solves
// Returns challenge solves for a specific user.
// Checks Supabase `challenge_solves` table if available,
// and falls back to / merges with local data/solves.json.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SOLVES_FILE = path.resolve(process.cwd(), "data", "solves.json");

function getLocalSolves() {
  try {
    if (fs.existsSync(SOLVES_FILE)) {
      const data = fs.readFileSync(SOLVES_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("[solves] Failed to read solves file:", err);
  }
  return [];
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, reason: "method_not_allowed" });
  }

  // Determine user identity
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

  let queryUserId = null;
  if (req.query && req.query.userId) {
    queryUserId = req.query.userId;
  } else if (req.url && req.url.includes("?")) {
    try {
      const parsedUrl = new URL(req.url, "http://localhost");
      queryUserId = parsedUrl.searchParams.get("userId");
    } catch {}
  }

  let targetUserId = queryUserId;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  let supabase = null;
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  // If token is provided, verify and resolve user
  if (token && supabase) {
    try {
      const { data: userData } = await supabase.auth.getUser(token);
      if (userData?.user?.id) {
        targetUserId = userData.user.id;
      }
    } catch {}
  }

  if (!targetUserId) {
    return res.status(200).json({ ok: true, solves: [] });
  }

  const solveMap = new Map();

  // 1. Try querying Supabase challenge_solves
  if (supabase) {
    try {
      const { data: dbSolves, error } = await supabase
        .from("challenge_solves")
        .select("challenge_id, points_awarded, solved_at")
        .eq("user_id", targetUserId);

      if (!error && Array.isArray(dbSolves)) {
        for (const s of dbSolves) {
          solveMap.set(s.challenge_id, {
            challenge_id: s.challenge_id,
            points_awarded: s.points_awarded,
            solved_at: s.solved_at,
          });
        }
      }
    } catch {}
  }

  // 2. Read local solves file
  const localSolves = getLocalSolves();
  for (const s of localSolves) {
    if (s.userId === targetUserId) {
      if (!solveMap.has(s.challengeId)) {
        solveMap.set(s.challengeId, {
          challenge_id: s.challengeId,
          points_awarded: Number(s.points) || 0,
          solved_at: s.solvedAt || new Date().toISOString(),
        });
      }
    }
  }

  return res.status(200).json({
    ok: true,
    userId: targetUserId,
    solves: Array.from(solveMap.values()),
  });
}
