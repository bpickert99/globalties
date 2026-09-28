import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import Login, { NewPassword } from './pages/Login'
import Monday from './pages/Monday'
import ProjectPage from './pages/Project'
import Projects from './pages/Projects'
import SettingsPage from './pages/Settings'
import Todo from './pages/Todo'
import { must, supabase } from './supabase'

type Access = 'checking' | 'member' | 'not-member'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [recovering, setRecovering] = useState(false)
  const [access, setAccess] = useState<Access>('checking')

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    setAccess('checking')
    void supabase
      .from('members')
      .select('email')
      .then((res) => setAccess(must(res).length ? 'member' : 'not-member'))
  }, [session])

  if (session === undefined) return <p className="muted pad">Loading…</p>
  if (recovering) return <NewPassword onDone={() => setRecovering(false)} />
  if (!session) return <Login />
  if (access === 'checking') return <p className="muted pad">Loading…</p>
  if (access === 'not-member') {
    return (
      <div className="login">
        <h1>Account not activated</h1>
        <p>
          You're signed in as <b>{session.user.email}</b>, but this account hasn't been given access yet. Ask the site owner to add
          this email to the members list.
        </p>
        <button className="btn" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◍
          </span>
          <span>
            Global Ties <b>KC</b>
          </span>
        </div>
        <nav>
          <NavLink to="/todo">To-Do</NavLink>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/monday">
            Monday<span className="long"> Meeting</span>
          </NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <button className="btn small ghost signout" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <main>
        <Routes>
          <Route path="/todo" element={<Todo />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id/*" element={<ProjectPage />} />
          <Route path="/monday" element={<Monday />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/todo" replace />} />
        </Routes>
      </main>
    </div>
  )
}
