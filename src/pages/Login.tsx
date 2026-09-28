import { useState, type FormEvent } from 'react'
import { supabase } from '../supabase'

type Mode = 'sign-in' | 'sign-up' | 'reset'

const siteUrl = () => window.location.origin + window.location.pathname

export default function Login() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : mode === 'sign-up'
          ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: siteUrl() } })
          : await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() })
    setBusy(false)
    if (error) setMessage(error.message)
    else if (mode === 'sign-up') setMessage('Check your email to confirm your account, then sign in.')
    else if (mode === 'reset') setMessage('Check your email for a link to set a new password.')
  }

  return (
    <form className="login" onSubmit={submit}>
      <div className="brand big">
        <span className="logo" aria-hidden>
          ◍
        </span>
        <span>
          Global Ties <b>KC</b>
        </span>
      </div>
      <h1>{mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Reset password'}</h1>
      <label className="field">
        <span>Email</span>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      {mode !== 'reset' && (
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          />
        </label>
      )}
      <button className="btn primary" disabled={busy}>
        {mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Send reset link'}
      </button>
      {message && <p className="notice">{message}</p>}
      <p className="muted small">
        {mode !== 'sign-in' && (
          <button type="button" className="link" onClick={() => setMode('sign-in')}>
            Sign in
          </button>
        )}
        {mode !== 'sign-up' && (
          <button type="button" className="link" onClick={() => setMode('sign-up')}>
            Create account
          </button>
        )}
        {mode !== 'reset' && (
          <button type="button" className="link" onClick={() => setMode('reset')}>
            Forgot password
          </button>
        )}
      </p>
    </form>
  )
}

export function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setMessage(error.message)
    else onDone()
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>Set a new password</h1>
      <label className="field">
        <span>New password</span>
        <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </label>
      <button className="btn primary">Save password</button>
      {message && <p className="notice">{message}</p>}
    </form>
  )
}
