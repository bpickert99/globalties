import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fmtRange, today } from '../dates'
import { progress, stage } from '../logic'
import { must, supabase } from '../supabase'
import type { ProgramType, Project, Task } from '../types'
import { act, Field, Loading, useData } from '../ui'

async function load() {
  const projects = must(await supabase.from('projects').select('*').order('arrival_date')) as Project[]
  const tasks = must(await supabase.from('tasks').select('*').not('project_id', 'is', null)) as Task[]
  const types = must(await supabase.from('program_types').select('*').order('sort')) as ProgramType[]
  const counts = must(await supabase.from('participants').select('project_id').eq('role', 'participant').is('cancelled_at', null)) as { project_id: string }[]
  return { projects, tasks, types, counts }
}

export default function Projects() {
  const { data, error, reload } = useData(load, [])
  const [showClosed, setShowClosed] = useState(false)
  const [creating, setCreating] = useState(false)
  if (!data) return <Loading error={error} />

  const typeName = new Map(data.types.map((t) => [t.id, t.name]))
  const shown = data.projects.filter((p) => (showClosed ? p.closed_at : !p.closed_at))

  return (
    <div>
      <div className="page-head">
        <h1>Projects</h1>
        <div className="row">
          <label className="toggle">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed
          </label>
          <button className="btn primary" onClick={() => setCreating(true)}>
            + New project
          </button>
        </div>
      </div>
      {creating && <NewProject types={data.types} onCancel={() => setCreating(false)} onCreated={reload} />}
      <div className="cards">
        {shown.map((p) => {
          const prog = progress(p, data.tasks)
          const people = data.counts.filter((c) => c.project_id === p.id).length
          const inKc = today() >= p.arrival_date && today() <= p.departure_date
          return (
            <Link key={p.id} to={`/projects/${p.id}`} className={inKc ? 'card project-card live' : 'card project-card'}>
              <div className="card-top">
                <span className="chip">{typeName.get(p.program_type_id)}</span>
              </div>
              <h2>{p.name}</h2>
              <div className="muted">{[p.countries, fmtRange(p.arrival_date, p.departure_date)].filter(Boolean).join(' · ')}</div>
              <div className="stage">{stage(p, data.tasks)}</div>
              <div className="progress" aria-label={`${prog.done} of ${prog.total} tasks done`}>
                <div style={{ width: `${prog.total ? (100 * prog.done) / prog.total : 0}%` }} />
              </div>
              <div className="muted small">
                {prog.done}/{prog.total} tasks · {people} participant{people === 1 ? '' : 's'}
              </div>
            </Link>
          )
        })}
      </div>
      {shown.length === 0 && <p className="muted">{showClosed ? 'No closed projects.' : 'No open projects. Create one to get started.'}</p>}
    </div>
  )
}

function NewProject({ types, onCancel, onCreated }: { types: ProgramType[]; onCancel: () => void; onCreated: () => Promise<void> }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    program_type_id: types[0]?.id ?? '',
    name: '',
    countries: '',
    accepted_on: today(),
    arrival_date: '',
    departure_date: '',
  })
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch })

  async function submit(e: FormEvent) {
    e.preventDefault()
    let id = ''
    const ok = await act(async () => {
      id = (must(await supabase.from('projects').insert(form).select('id').single()) as { id: string }).id
    })
    if (!ok) return
    await onCreated()
    navigate(`/projects/${id}`)
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>New project</h2>
      <p className="muted small">The checklist for the chosen program type is added automatically, with due dates based on these dates.</p>
      <div className="grid">
        <Field label="Program type">
          <select value={form.program_type_id} onChange={(e) => set({ program_type_id: e.target.value })}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project name">
          <input required value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="American Philanthropy" />
        </Field>
        <Field label="Countries">
          <input value={form.countries} onChange={(e) => set({ countries: e.target.value })} placeholder="China" />
        </Field>
        <Field label="Accepted on">
          <input type="date" required value={form.accepted_on} onChange={(e) => set({ accepted_on: e.target.value })} />
        </Field>
        <Field label="Arrival in KC">
          <input type="date" required value={form.arrival_date} onChange={(e) => set({ arrival_date: e.target.value })} />
        </Field>
        <Field label="Departure from KC">
          <input type="date" required min={form.arrival_date} value={form.departure_date} onChange={(e) => set({ departure_date: e.target.value })} />
        </Field>
      </div>
      <div className="row">
        <button className="btn primary">Create project</button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
