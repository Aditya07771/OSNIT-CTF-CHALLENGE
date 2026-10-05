// Usage: npm run hash -- <challenge-id> "<answer>"
// Example: npm run hash -- q2 "LTCOE{example}"
// Prints the SHA-256 value to paste into src/challenges.js as `hash`.
import { hashAnswer } from "../src/hash.js";

const [id, ...rest] = process.argv.slice(2);
const answer = rest.join(" ");
if (!id || !answer) {
  console.error('Usage: npm run hash -- <challenge-id> "<answer>"');
  process.exit(1);
}
// Case 1 (coordinates) ignores spaces, so "flag{1.0, 2.0}" and "flag{1.0,2.0}" both match.
const stripSpaces = id === "q1";
console.log(await hashAnswer(id, answer, { stripSpaces }));
