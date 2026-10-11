// Vercel serverless function — GET /api/leaderboard
// Computes and returns leaderboard rankings from server-side solves data.

import fs from "node:fs";
import path from "node:path";

const SOLVES_FILE = path.resolve(process.cwd(), "data", "solves.json");

function getSolves() {
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

  const solves = getSolves();

  // Aggregate points by user
  const userMap = new Map();

  for (const s of solves) {
    const uid = s.userId || s.displayName || "guest_player";
    if (!userMap.has(uid)) {
      userMap.set(uid, {
        user_id: uid,
        display_name: s.displayName || "Anonymous",
        total_points: 0,
        challenges_solved: 0,
        solvedSet: new Set(),
        first_solve_at: s.solvedAt || new Date().toISOString(),
      });
    }
    const entry = userMap.get(uid);
    if (!entry.solvedSet.has(s.challengeId)) {
      entry.solvedSet.add(s.challengeId);
      entry.total_points += Number(s.points) || 0;
      entry.challenges_solved += 1;
    }
  }

  const list = Array.from(userMap.values())
    .map(({ solvedSet, ...rest }) => rest)
    .sort((a, b) => {
      if (b.total_points !== a.total_points) {
        return b.total_points - a.total_points;
      }
      if (b.challenges_solved !== a.challenges_solved) {
        return b.challenges_solved - a.challenges_solved;
      }
      return new Date(a.first_solve_at) - new Date(b.first_solve_at);
    });

  // Assign ranks
  const ranked = list.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));

  return res.status(200).json(ranked);
}
