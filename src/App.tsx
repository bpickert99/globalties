import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useMatch } from 'react-router-dom'
import Login, { NewPassword } from './pages/Login'
import Logistics from './pages/Logistics'
import ProjectPage from './pages/Project'
import Projects from './pages/Projects'
import Resources from './pages/Resources'
import SettingsPage from './pages/Settings'
import Todo from './pages/Todo'
import { must, supabase } from './supabase'
import arrow from './assets/gtkc-arrow.svg'
import logoWhite from './assets/gtkc-logo-white.svg'

type Access = 'checking' | 'member' | 'not-member'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [recovering, setRecovering] = useState(false)
  const [access, setAccess] = useState<Access>('checking')
  // Inside a project the site-wide menu steps back so the page is clearly about that project.
  const inProject = useMatch('/projects/:id/*')

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
        <Link to="/todo" className="brand" aria-label="Global Ties KC">
          <img src={logoWhite} alt="Global Ties KC" className="logo-full" />
          <img src={arrow} alt="" className="logo-mark" />
        </Link>
        {inProject ? (
          <nav>
            <Link to="/projects" className="back-link">
              ← All projects
            </Link>
          </nav>
        ) : (
        <nav>
          <NavLink to="/todo">To-Do</NavLink>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/resources">Resources</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        )}
        <button className="btn small ghost signout" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <main className={inProject ? 'in-project' : undefined}>
        <Routes>
          <Route path="/todo" element={<Todo />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id/*" element={<ProjectPage />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/logistics" element={<Logistics />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/todo" replace />} />
        </Routes>
      </main>
    </div>
  )
}
