// Vercel serverless function — GET /api/leaderboard
// Returns leaderboard rankings for all users with points.
// Includes all registered users (with their points, or 0 points if unsolved),
// and ranks strictly according to points and solves.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SOLVES_FILE = path.resolve(process.cwd(), "data", "solves.json");

const POINTS_MAP = {
  q1: 100,
  q2: 150,
  q3: 200,
  q4: 150,
};

function getLocalSolves() {
  try {
    if (fs.existsSync(SOLVES_FILE)) {
      const data = fs.readFileSync(SOLVES_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("[leaderboard] Failed to read solves file:", err);
  }
  return [];
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

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

  const userMap = new Map();

  // 1. Fetch registered users from Supabase Auth
  if (supabase && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)) {
    try {
      const { data: adminData } = await supabase.auth.admin.listUsers();
      if (adminData?.users && Array.isArray(adminData.users)) {
        for (const u of adminData.users) {
          const name =
            u.user_metadata?.display_name ||
            u.user_metadata?.name ||
            u.email?.split("@")[0] ||
            "Player";
          userMap.set(u.id, {
            user_id: u.id,
            display_name: name,
            total_points: 0,
            challenges_solved: 0,
            first_solve_at: null,
            created_at: u.created_at || new Date().toISOString(),
            solvedSet: new Set(),
          });
        }
      }
    } catch (err) {
      console.warn("[leaderboard] Admin listUsers warning:", err?.message || err);
    }
  }

  // 2. Fetch profiles from public.profiles table (if table exists)
  if (supabase) {
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, display_name, username, created_at");
      if (!error && Array.isArray(profiles)) {
        for (const p of profiles) {
          const name = p.display_name || p.username || "Player";
          if (!userMap.has(p.id)) {
            userMap.set(p.id, {
              user_id: p.id,
              display_name: name,
              total_points: 0,
              challenges_solved: 0,
              first_solve_at: null,
              created_at: p.created_at || new Date().toISOString(),
              solvedSet: new Set(),
            });
          } else {
            const existing = userMap.get(p.id);
            if (p.display_name) existing.display_name = p.display_name;
          }
        }
      }
    } catch (err) {
      // profiles table might not exist yet
    }
  }

  // 3. Fetch challenge_solves from Supabase
  if (supabase) {
    try {
      const { data: dbSolves, error } = await supabase
        .from("challenge_solves")
        .select("user_id, challenge_id, points_awarded, solved_at");
      if (!error && Array.isArray(dbSolves)) {
        for (const s of dbSolves) {
          if (!userMap.has(s.user_id)) {
            userMap.set(s.user_id, {
              user_id: s.user_id,
              display_name: "Player",
              total_points: 0,
              challenges_solved: 0,
              first_solve_at: null,
              created_at: s.solved_at || new Date().toISOString(),
              solvedSet: new Set(),
            });
          }
          const entry = userMap.get(s.user_id);
          if (!entry.solvedSet.has(s.challenge_id)) {
            entry.solvedSet.add(s.challenge_id);
            entry.total_points += Number(s.points_awarded) || POINTS_MAP[s.challenge_id] || 0;
            entry.challenges_solved += 1;
            const at = s.solved_at || new Date().toISOString();
            if (!entry.first_solve_at || new Date(at) < new Date(entry.first_solve_at)) {
              entry.first_solve_at = at;
            }
          }
        }
      }
    } catch (err) {
      // challenge_solves table might not exist yet
    }
  }

  // 4. Merge local solves from data/solves.json
  const localSolves = getLocalSolves();
  for (const s of localSolves) {
    const uid = s.userId || s.displayName || "guest_player";
    if (!userMap.has(uid)) {
      userMap.set(uid, {
        user_id: uid,
        display_name: s.displayName || "Anonymous",
        total_points: 0,
        challenges_solved: 0,
        first_solve_at: null,
        created_at: s.solvedAt || new Date().toISOString(),
        solvedSet: new Set(),
      });
    }
    const entry = userMap.get(uid);
    if (s.displayName && (!entry.display_name || entry.display_name === "Player" || entry.display_name === "Anonymous")) {
      entry.display_name = s.displayName;
    }
    if (!entry.solvedSet.has(s.challengeId)) {
      entry.solvedSet.add(s.challengeId);
      entry.total_points += Number(s.points) || POINTS_MAP[s.challengeId] || 0;
      entry.challenges_solved += 1;
      const at = s.solvedAt || new Date().toISOString();
      if (!entry.first_solve_at || new Date(at) < new Date(entry.first_solve_at)) {
        entry.first_solve_at = at;
      }
    }
  }

  // 5. Convert to array and sort strictly according to points and solved count
  const list = Array.from(userMap.values()).map(({ solvedSet, ...rest }) => rest);

  list.sort((a, b) => {
    // 1. Highest points first
    if (b.total_points !== a.total_points) {
      return b.total_points - a.total_points;
    }
    // 2. Most challenges solved first
    if (b.challenges_solved !== a.challenges_solved) {
      return b.challenges_solved - a.challenges_solved;
    }
    // 3. Solved earlier first
    if (a.first_solve_at && b.first_solve_at) {
      const diff = new Date(a.first_solve_at) - new Date(b.first_solve_at);
      if (diff !== 0) return diff;
    } else if (a.first_solve_at && !b.first_solve_at) {
      return -1;
    } else if (!a.first_solve_at && b.first_solve_at) {
      return 1;
    }
    // 4. Earlier registration date first
    if (a.created_at && b.created_at) {
      const diff = new Date(a.created_at) - new Date(b.created_at);
      if (diff !== 0) return diff;
    }
    return (a.display_name || "").localeCompare(b.display_name || "");
  });

  // Assign ranks
  const ranked = list.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));

  return res.status(200).json(ranked);
}
