import { useEffect, useState } from 'react'

export function LeaderboardPage() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadLeaderboard()
    const timer = setInterval(loadLeaderboard, 4000)
    return () => clearInterval(timer)
  }, [])

  async function loadLeaderboard() {
    try {
      const res = await fetch('/api/leaderboard')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setEntries(data)
          setError(null)
          setLoading(false)
          return
        }
      }
    } catch {
      // API error fallback
    }

    // Fallback: load from local storage
    try {
      const localSolves = JSON.parse(localStorage.getItem('ltcoe_solved') || '[]')
      const pointsMap = { q1: 100, q2: 150, q3: 200, q4: 150 }
      const totalPoints = localSolves.reduce((sum, q) => sum + (pointsMap[q] || 0), 0)
      if (localSolves.length > 0) {
        const name = localStorage.getItem('ltcoe_display_name') || 'Player'
        setEntries([
          {
            rank: 1,
            user_id: 'local_player',
            display_name: name,
            total_points: totalPoints,
            challenges_solved: localSolves.length,
          },
        ])
        setError(null)
      } else {
        setEntries([])
      }
    } catch {
      setError('Unable to load leaderboard')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="wrap leaderboard-page">
      <h2>Leaderboard</h2>

      {loading && <p>Loading...</p>}
      {error && <p className="error-message">{error}</p>}

      {!loading && !error && (
        <div className="leaderboard-table full">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Points</th>
                <th>Solved</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty-state">
                    No solves yet. Be the first!
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.user_id} className={`rank-${entry.rank}`}>
                    <td className="rank">
                      {entry.rank === 1 && '🥇'}
                      {entry.rank === 2 && '🥈'}
                      {entry.rank === 3 && '🥉'}
                      {entry.rank > 3 && entry.rank}
                    </td>
                    <td className="name">{entry.display_name}</td>
                    <td className="points">{entry.total_points}</td>
                    <td className="solved">{entry.challenges_solved}/4</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}