import { useRef, useState } from 'react'
import { supabase } from './supabaseClient'

function friendlyError(message) {
  if (!message) return 'Something went wrong. Please try again.'
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Incorrect email or password.'
  if (m.includes('email not confirmed')) return 'Please confirm your email before logging in. Check your inbox.'
  if (m.includes('user already registered')) return 'An account with this email already exists. Try logging in.'
  if (m.includes('rate limit') || m.includes('over_email_send_rate_limit'))
    return 'Too many sign-up emails sent recently. Supabase limits confirmation emails (about 2-4 per hour on the free plan). Wait a while, or disable "Confirm email" in Supabase \u2192 Authentication \u2192 Providers \u2192 Email for development.'
  if (m.includes('password should be at least')) return 'Password is too short. Use at least 6 characters.'
  if (m.includes('unable to validate email')) return 'That email address looks invalid.'
  if (m.includes('signups not allowed') || m.includes('signup disabled'))
    return 'New sign-ups are currently disabled for this project.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'Network error. Check your connection and try again.'
  return message
}

export function AuthModal({ onClose, onSuccess, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Guards against double-submits (e.g. rapid Enter presses) before the
  // async `loading` state has had a chance to disable the button. Extra
  // signUp calls would each try to send a confirmation email and burn
  // through Supabase's email rate limit.
  const submittingRef = useRef(false)

  async function handleLogin(e) {
    e.preventDefault()
    if (submittingRef.current) return
    setError(null)
    setNotice(null)

    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }

    submittingRef.current = true
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        setError(friendlyError(error.message))
        return
      }
      onSuccess()
    } catch (err) {
      setError(friendlyError(err?.message))
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    if (submittingRef.current) return
    setError(null)
    setNotice(null)

    if (!displayName.trim()) {
      setError('Display name is required.')
      return
    }
    if (displayName.trim().length < 2) {
      setError('Display name must be at least 2 characters.')
      return
    }
    if (!email.trim()) {
      setError('Email is required.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    submittingRef.current = true
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() } },
      })

      // 1. Registration failed: surface the actual Supabase message.
      if (error) {
        setError(friendlyError(error.message))
        return
      }

      // 4. No session: never pretend the user is logged in.
      // Supabase returns no session when email confirmation is required.
      const emailConfirmationRequired = !data?.session

      // Supabase also returns no session (and no error) for an email that is
      // already registered and confirmed, with an empty identities array.
      // Treat that as "possibly already registered" rather than success.
      const alreadyRegistered =
        Array.isArray(data?.user?.identities) && data.user.identities.length === 0

      if (alreadyRegistered) {
        setNotice(
          'That email may already be registered. Try logging in, or check your inbox for a confirmation link.'
        )
        setMode('login')
        return
      }

      // 3. Registration succeeded but confirmation is required.
      if (emailConfirmationRequired) {
        setNotice(
          'Registration successful! Please check your email and click the confirmation link before logging in.'
        )
        setMode('login')
        return
      }

      // 2. Registration succeeded and a session exists: close the modal and
      // let the app's onAuthStateChange handler take over.
      onSuccess()
    } catch (err) {
      setError(friendlyError(err?.message))
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="auth-form">
            <h2>Login</h2>
            {error && <p className="error-message" role="alert">{error}</p>}
            {notice && <p className="notice-message" role="status">{notice}</p>}
            <div className="form-group">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <button type="submit" disabled={loading} className="auth-button">
              {loading ? 'Logging in...' : 'Login'}
            </button>
            <p className="auth-switch">
              Don't have an account?{' '}
              <button type="button" onClick={() => { setMode('register'); setError(null); setNotice(null) }}>
                Register
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="auth-form">
            <h2>Register</h2>
            {error && <p className="error-message" role="alert">{error}</p>}
            {notice && <p className="notice-message" role="status">{notice}</p>}
            <div className="form-group">
              <label htmlFor="register-name">Display Name</label>
              <input
                id="register-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="register-email">Email</label>
              <input
                id="register-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label htmlFor="register-password">Password</label>
              <input
                id="register-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Min 6 characters"
              />
            </div>
            <div className="form-group">
              <label htmlFor="register-confirm">Confirm Password</label>
              <input
                id="register-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button type="submit" disabled={loading} className="auth-button">
              {loading ? 'Registering...' : 'Register'}
            </button>
            <p className="auth-switch">
              Already have an account?{' '}
              <button type="button" onClick={() => { setMode('login'); setError(null); setNotice(null) }}>
                Login
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}