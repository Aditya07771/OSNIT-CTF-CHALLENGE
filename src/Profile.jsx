import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export function Profile({ onClose }) {
  const [profile, setProfile] = useState(null)
  const [solves, setSolves] = useState([])
  const [rank, setRank] = useState(null)
  const [totalPoints, setTotalPoints] = useState(0)
  const [challengesSolved, setChallengesSolved] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const POINTS_MAP = { q1: 100, q2: 150, q3: 200, q4: 150 }

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    let defaultName = user.user_metadata?.display_name || user.email?.split('@')[0] || ''

    // Load profile from Supabase if table exists
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (prof) {
        setProfile(prof)
        setDisplayName(prof.display_name || defaultName)
        setUsername(prof.username || '')
      } else {
        setDisplayName(defaultName)
      }
    } catch {
      setDisplayName(defaultName)
    }

    // Load solves from Supabase, or fall back to /api/solves
    let solveList = []
    try {
      const { data: solveData, error: dbErr } = await supabase
        .from('challenge_solves')
        .select('*')
        .eq('user_id', user.id)
        .order('solved_at', { ascending: false })

      if (!dbErr && solveData && solveData.length > 0) {
        solveList = solveData
      }
    } catch {
      // Supabase table not available
    }

    if (solveList.length === 0) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        const res = await fetch(`/api/solves?userId=${encodeURIComponent(user.id)}`, { headers })
        if (res.ok) {
          const body = await res.json()
          if (Array.isArray(body?.solves) && body.solves.length > 0) {
            solveList = body.solves
          }
        }
      } catch {}
    }

    setSolves(solveList)

    // Calculate stats
    const points = solveList.reduce((sum, s) => sum + (Number(s.points_awarded) || POINTS_MAP[s.challenge_id] || 0), 0)
    setTotalPoints(points)
    setChallengesSolved(solveList.length)

    // Get rank from /api/leaderboard
    try {
      const res = await fetch('/api/leaderboard')
      if (res.ok) {
        const lb = await res.json()
        const myEntry = lb.find(
          (e) =>
            e.user_id === user.id ||
            e.display_name?.toLowerCase() === (displayName || defaultName).toLowerCase()
        )
        if (myEntry) setRank(myEntry.rank)
      }
    } catch {}

    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    if (displayName.trim().length < 2 || displayName.trim().length > 50) {
      setError('Display name must be between 2 and 50 characters')
      setSaving(false)
      return
    }

    if (username && (username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(username))) {
      setError('Username must be 3-20 chars, alphanumeric and underscore only')
      setSaving(false)
      return
    }

    localStorage.setItem('ltcoe_display_name', displayName.trim())

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user && profile?.id) {
        await supabase
          .from('profiles')
          .update({
            display_name: displayName.trim(),
            username: username.trim() || null
          })
          .eq('id', profile.id)
      }
    } catch {}

    setEditing(false)
    setSaving(false)
    await loadProfile()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    localStorage.removeItem('ltcoe_user_id')
    localStorage.removeItem('ltcoe_display_name')
    localStorage.removeItem('ltcoe_solved')
    localStorage.removeItem('ltcoe_guest_solved')
    onClose()
  }

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>×</button>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal profile-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>Profile</h2>

        {error && <p className="error-message">{error}</p>}

        <div className="profile-section">
          <h3>Account</h3>
          {!editing ? (
            <>
              <div className="profile-field">
                <label>Display Name</label>
                <p>{displayName || profile?.display_name || 'Not set'}</p>
              </div>
              <div className="profile-field">
                <label>Username</label>
                <p>{username || profile?.username || 'Not set'}</p>
              </div>
              <button onClick={() => setEditing(true)} className="btn-secondary">Edit</button>
            </>
          ) : (
            <>
              <div className="form-group">
                <label>Display Name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={50}
                />
              </div>
              <div className="form-group">
                <label>Username (optional)</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={20}
                  placeholder="3-20 chars, a-z, 0-9, _"
                />
              </div>
              <div className="btn-group">
                <button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => { setEditing(false); setError(null) }} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>

        <div className="profile-section">
          <h3>Statistics</h3>
          <div className="stats-grid">
            <div className="stat">
              <span className="stat-value">{totalPoints}</span>
              <span className="stat-label">Total Points</span>
            </div>
            <div className="stat">
              <span className="stat-value">{challengesSolved}</span>
              <span className="stat-label">Solved</span>
            </div>
            <div className="stat">
              <span className="stat-value">{rank || '-'}</span>
              <span className="stat-label">Rank</span>
            </div>
          </div>
        </div>

        <div className="profile-section">
          <h3>Solved Challenges</h3>
          {solves.length === 0 ? (
            <p className="empty-state">No challenges solved yet</p>
          ) : (
            <ul className="solves-list">
              {solves.map((s) => (
                <li key={s.id || s.challenge_id}>
                  <span className="challenge-id">{(s.challenge_id || '').toUpperCase()}</span>
                  <span className="points">+{s.points_awarded}</span>
                  <span className="time">
                    {s.solved_at ? new Date(s.solved_at).toLocaleDateString() : 'Solved'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="profile-section">
          <button onClick={handleLogout} className="btn-danger">Logout</button>
        </div>
      </div>
    </div>
  )
}