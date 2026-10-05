// Answers are never stored in plain text. Each challenge keeps a SHA-256 hash
// of its normalized answer; a submission is normalized the same way and compared.
// This keeps flags out of "view source" while the site stays fully static.
// (A determined attacker can still brute-force weak answers offline.)

const SALT = "ltcoe-osint-v1";

export function normalize(raw, { stripSpaces = false } = {}) {
  let s = raw.normalize("NFC").trim().toLowerCase(); // keeps Latvian diacritics intact
  if (stripSpaces) s = s.replace(/\s+/g, "");
  return s;
}

export async function hashAnswer(id, raw, opts) {
  const data = new TextEncoder().encode(`${SALT}:${id}:${normalize(raw, opts)}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
