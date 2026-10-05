import { useEffect, useState } from "react";
import { challenges } from "./challenges.js";
import { hashAnswer } from "./hash.js";

const STORE_KEY = "ltcoe-osint-solved";

function loadSolved() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveSolved(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    /* storage can be blocked; progress just won't persist */
  }
}

function Case({ index, c, solved, onSolve }) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState(null); // null | "wrong" | "unset" | "busy"

  async function submit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    if (!c.hash) {
      setStatus("unset");
      return;
    }
    setStatus("busy");
    const h = await hashAnswer(c.id, value, { stripSpaces: c.stripSpaces });
    if (h === c.hash) {
      setStatus(null);
      onSolve(c.id);
    } else {
      setStatus("wrong");
    }
  }

  return (
    <section className={`case${solved ? " is-solved" : ""}`} aria-labelledby={`${c.id}-title`}>
      <div className="case-num" aria-hidden="true">
        {index + 1}
      </div>

      <div className="case-body">
        <p className="case-kind">{c.kind}</p>
        <h2 id={`${c.id}-title`}>{c.title}</h2>
        <p className="brief">{c.brief}</p>

        {c.code && <pre className="code">{c.code}</pre>}

        {c.images && (
          <div className={`shots shots-${c.images.length}`}>
            {c.images.map((img) => (
              <a key={img.src} href={img.src} target="_blank" rel="noreferrer">
                <img src={img.src} alt={img.alt} loading="lazy" />
              </a>
            ))}
          </div>
        )}

        {c.download && (
          <a className="download" href={c.download.href} download>
            {c.download.label} <span>{c.download.size}</span>
          </a>
        )}

        {c.riddle && <p className="riddle">{c.riddle}</p>}

        <form className="answer" onSubmit={submit}>
          <label htmlFor={`${c.id}-input`}>
            Flag format <code>{c.format}</code>
          </label>
          <div className="row">
            <input
              id={`${c.id}-input`}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setStatus(null);
              }}
              placeholder={c.format}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
              disabled={solved}
            />
            <button type="submit" disabled={solved || status === "busy"}>
              {solved ? "Solved" : "Check answer"}
            </button>
          </div>
          <p className={`result ${solved ? "ok" : status === "wrong" || status === "unset" ? "bad" : ""}`} role="status">
            {solved && "Correct. This one is done."}
            {status === "wrong" && "Not the right answer. Check the format and try again."}
            {status === "unset" && "The answer for this challenge hasn't been set up yet. Tell the organizers."}
          </p>
        </form>
      </div>
    </section>
  );
}

export default function App() {
  const [solved, setSolved] = useState(loadSolved);

  useEffect(() => saveSolved(solved), [solved]);

  const markSolved = (id) => setSolved((s) => (s.includes(id) ? s : [...s, id]));

  return (
    <>
      <header className="masthead">
        <div className="wrap">
          <h1>LTCOE OSINT Board</h1>
          <p className="lede">
            Four open-source intelligence challenges. Use public information only. No account needed, and
            your progress stays in this browser.
          </p>
          <p className="tally" aria-live="polite">
            <strong>{solved.length}</strong> of {challenges.length} solved
          </p>
        </div>
      </header>

      <main className="wrap">
        {challenges.map((c, i) => (
          <Case key={c.id} index={i} c={c} solved={solved.includes(c.id)} onSolve={markSolved} />
        ))}
      </main>

      <footer className="wrap foot">
        <p>Flags are case-insensitive. Spaces around the answer are ignored.</p>
      </footer>
    </>
  );
}
