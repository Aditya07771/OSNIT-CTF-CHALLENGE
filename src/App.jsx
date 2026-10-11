import { useEffect, useState } from "react";
import { Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";
import { challenges } from "./challenges.js";
import { supabase } from "./supabaseClient.js";
import { AuthModal } from "./AuthModal.jsx";
import { Profile } from "./Profile.jsx";
import { LeaderboardPage } from "./LeaderboardPage.jsx";

async function verify(id, answer, token, user) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const displayName =
    user?.user_metadata?.display_name ||
    user?.email?.split("@")[0] ||
    localStorage.getItem("ltcoe_display_name") ||
    "Detective";

  let userId = user?.id || localStorage.getItem("ltcoe_user_id");
  if (!userId) {
    userId = "player_" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("ltcoe_user_id", userId);
  }

  const res = await fetch("/api/verify", {
    method: "POST",
    headers,
    body: JSON.stringify({ id, answer, userId, displayName }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function Case({ index, c, solved, onSolve, user, onShowAuth }) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState(null);
  const [resultMsg, setResultMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!value.trim()) return;

    setStatus("busy");
    setResultMsg("");

    let token = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || null;
    } catch {
      token = null;
    }

    let result;
    try {
      result = await verify(c.id, value, token, user);
    } catch {
      setStatus("error");
      setResultMsg("ERROR");
      return;
    }

    const data = result.data;

    if (data && (data.ok || data.correct)) {
      setStatus("correct");
      setResultMsg("CORRECT");
      onSolve(c.id);
      return;
    }

    if (!data || typeof data.reason !== "string") {
      setStatus("error");
      setResultMsg("ERROR");
      return;
    }

    switch (data.reason) {
      case "unset":
        setStatus("unset");
        setResultMsg("INCORRECT");
        break;
      case "rate_limited":
        setStatus("limited");
        setResultMsg("INCORRECT");
        break;
      case "server_error":
        setStatus("error");
        setResultMsg("SERVER ERROR");
        break;
      case "wrong":
      default:
        setStatus("wrong");
        setResultMsg("INCORRECT");
    }
  }

  const points = { q1: 100, q2: 150, q3: 200, q4: 150 };

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

        <div className="challenge-meta">
          <span className="points-label">+{points[c.id]} points</span>
          {solved && <span className="solved-label">✓ Solved</span>}
        </div>

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
                setResultMsg("");
              }}
              placeholder={c.format}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
              disabled={solved}
            />
            <button type="submit" disabled={solved || status === "busy"}>
              {solved ? "Solved" : "Submit"}
            </button>
          </div>
          <p
            className={`result ${status === "correct" || solved ? "ok" : (status === "wrong" || status === "unset" || status === "limited" || status === "error") ? "bad" : ""}`}
            role="status"
          >
            {solved && "CORRECT"}
            {!solved && resultMsg && resultMsg}
            {!solved && !resultMsg && status === "busy" && "Checking..."}
          </p>
          {!solved && status === "error" && (
            <p className="result-note">
              The answer checker encountered a server error. Please try again.
            </p>
          )}
          {!solved && status === "unset" && (
            <p className="result-note">
              This challenge's answer key isn't configured on the server. Tell the organizers.
            </p>
          )}
          {!solved && status === "limited" && (
            <p className="result-note">Too many attempts just now. Wait a minute and try again.</p>
          )}
        </form>
      </div>
    </section>
  );
}

function ChallengesPage({ user, solved, markSolved, onShowAuth }) {
  return (
    <>
      <main className="wrap">
        {challenges.map((c, i) => (
          <Case
            key={c.id}
            index={i}
            c={c}
            solved={solved.includes(c.id)}
            onSolve={markSolved}
            user={user}
            onShowAuth={onShowAuth}
          />
        ))}
      </main>
      <footer className="wrap foot">
        <p>Flags are case-insensitive. Spaces around the answer are ignored.</p>
      </footer>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [solved, setSolved] = useState(() => {
    try {
      const saved = localStorage.getItem("ltcoe_solved");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showProfile, setShowProfile] = useState(false);

  const pointsMap = { q1: 100, q2: 150, q3: 200, q4: 150 };
  const userPoints = solved.reduce((sum, id) => sum + (pointsMap[id] || 0), 0);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const name = session.user.user_metadata?.display_name || session.user.email?.split("@")[0];
        if (name) localStorage.setItem("ltcoe_display_name", name);
        localStorage.setItem("ltcoe_user_id", session.user.id);
        loadUserData(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const name = session.user.user_metadata?.display_name || session.user.email?.split("@")[0];
        if (name) localStorage.setItem("ltcoe_display_name", name);
        localStorage.setItem("ltcoe_user_id", session.user.id);
        loadUserData(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadUserData(currentUser) {
    try {
      const { data: solves, error } = await supabase
        .from('challenge_solves')
        .select('challenge_id, points_awarded')
        .eq('user_id', currentUser.id);

      if (error) {
        return;
      }

      if (solves && solves.length > 0) {
        const dbSolvedIds = solves.map(s => s.challenge_id);
        setSolved((prev) => {
          const merged = Array.from(new Set([...prev, ...dbSolvedIds]));
          try {
            localStorage.setItem("ltcoe_solved", JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    } catch {
      // Supabase loadUserData fallback
    }
  }

  const markSolved = async (id) => {
    setSolved((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      try {
        localStorage.setItem("ltcoe_solved", JSON.stringify(next));
      } catch {}
      return next;
    });
    if (user) {
      await loadUserData(user);
    }
  };

  const handleShowAuth = (mode = 'login') => {
    setAuthMode(mode);
    setShowAuth(true);
  };

  return (
    <>
      <header className="masthead">
        <div className="wrap">
          <nav className="navbar">
            <div className="nav-brand">
              <Link to="/challenges" className="brand-link">LTCOE OSINT Board</Link>
            </div>
            <div className="nav-links">
              <Link to="/challenges" className={`nav-link ${location.pathname === '/challenges' || location.pathname === '/' ? 'active' : ''}`}>Challenges</Link>
              <Link to="/leaderboard" className={`nav-link ${location.pathname === '/leaderboard' ? 'active' : ''}`}>Leaderboard</Link>
              {user ? (
                <button onClick={() => setShowProfile(true)} className="nav-btn">Profile ({userPoints} pts)</button>
              ) : (
                <>
                  <button onClick={() => handleShowAuth('login')} className="nav-btn">Login</button>
                  <button onClick={() => handleShowAuth('register')} className="nav-btn primary">Register</button>
                </>
              )}
            </div>
          </nav>
          <p className="lede">
            Four open-source intelligence challenges. Use public information only.
          </p>
          {user ? (
            <div className="tally-container">
              <p className="tally" aria-live="polite">
                <strong>{solved.length}</strong> of {challenges.length} solved • <strong>{userPoints}</strong> points
              </p>
            </div>
          ) : (
            <p className="tally" aria-live="polite">
              <strong>{challenges.length}</strong> challenges available • Submit flags to earn points and rank
            </p>
          )}
        </div>
      </header>

      <Routes>
        <Route path="/" element={<ChallengesPage user={user} solved={solved} markSolved={markSolved} onShowAuth={handleShowAuth} />} />
        <Route path="/challenges" element={<ChallengesPage user={user} solved={solved} markSolved={markSolved} onShowAuth={handleShowAuth} />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
      </Routes>

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={() => setShowAuth(false)}
        />
      )}

      {showProfile && (
        <Profile onClose={() => setShowProfile(false)} />
      )}
    </>
  );
}