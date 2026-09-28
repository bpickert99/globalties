import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { addDays, fmtWeekdayShort, today } from '../dates'
import { taskApplies, taskDue } from '../logic'
import { must, supabase } from '../supabase'
import type { Project, Task } from '../types'
import { act, Loading, useData } from '../ui'

type Row = { task: Task; project: Project | undefined; due: string | null }
type Group = { key: string; label: string; rows: Row[]; collapsed?: boolean }

const MINE = 'mine'

async function load() {
  const projects = must(await supabase.from('projects').select('*').is('closed_at', null).order('arrival_date')) as Project[]
  const tasks = must(await supabase.from('tasks').select('*').order('sort')) as Task[]
  return { projects, tasks }
}

function group(rows: Row[]): Group[] {
  const now = today()
  const weekEnd = addDays(now, 7)
  const byDue = (a: Row, b: Row) => (a.due ?? '').localeCompare(b.due ?? '') || a.task.sort - b.task.sort
  const open = rows.filter((r) => !r.task.done_at).sort(byDue)
  return [
    { key: 'overdue', label: 'Overdue', rows: open.filter((r) => r.due && r.due < now) },
    { key: 'today', label: 'Today', rows: open.filter((r) => r.due === now) },
    { key: 'week', label: 'Next 7 days', rows: open.filter((r) => r.due && r.due > now && r.due <= weekEnd) },
    { key: 'later', label: 'Later', rows: open.filter((r) => r.due && r.due > weekEnd), collapsed: true },
    { key: 'nodate', label: 'No date', rows: open.filter((r) => !r.due) },
    {
      key: 'done',
      label: 'Completed',
      rows: rows.filter((r) => r.task.done_at).sort((a, b) => b.task.done_at!.localeCompare(a.task.done_at!)),
      collapsed: true,
    },
  ]
}

export default function Todo() {
  const { data, error, reload } = useData(load, [])
  const [list, setList] = useState<string>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [openTask, setOpenTask] = useState<string | null>(null)

  if (!data) return <Loading error={error} />
  const byId = new Map(data.projects.map((p) => [p.id, p]))
  const rows: Row[] = data.tasks
    .filter((t) => t.project_id === null || byId.has(t.project_id))
    .map((t) => ({ task: t, project: t.project_id ? byId.get(t.project_id) : undefined }))
    .filter((r) => taskApplies(r.task, r.project))
    .map((r) => ({ ...r, due: taskDue(r.task, r.project) }))
  const visible = rows.filter((r) => list === 'all' || (list === MINE ? r.task.project_id === null : r.task.project_id === list))
  const openCount = (pred: (r: Row) => boolean) => rows.filter((r) => !r.task.done_at && pred(r)).length

  async function toggle(task: Task) {
    await act(async () => must(await supabase.from('tasks').update({ done_at: task.done_at ? null : new Date().toISOString() }).eq('id', task.id)))
    await reload()
  }

  async function remove(task: Task) {
    if (!confirm(`Delete "${task.title}"?`)) return
    await act(async () => must(await supabase.from('tasks').delete().eq('id', task.id)))
    await reload()
  }

  const lists = [
    { id: 'all', name: 'All tasks', count: openCount(() => true) },
    { id: MINE, name: 'My tasks', count: openCount((r) => r.task.project_id === null) },
    ...data.projects.map((p) => ({ id: p.id, name: p.name, count: openCount((r) => r.task.project_id === p.id) })),
  ]

  return (
    <div className="todo">
      <aside className="lists">
        {lists.map((l) => (
          <button key={l.id} className={list === l.id ? 'list active' : 'list'} onClick={() => setList(l.id)}>
            <span>{l.name}</span>
            <span className="count">{l.count}</span>
          </button>
        ))}
      </aside>
      <select className="lists-mobile" value={list} onChange={(e) => setList(e.target.value)} aria-label="Task list">
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({l.count})
          </option>
        ))}
      </select>
      <section className="tasks">
        <AddTask projects={data.projects} defaultList={list === 'all' ? MINE : list} onAdded={reload} />
        {group(visible).map((g) =>
          g.rows.length === 0 ? null : (
            <div key={g.key} className={`group group-${g.key}`}>
              <button className="group-head" onClick={() => setExpanded({ ...expanded, [g.key]: !(expanded[g.key] ?? !g.collapsed) })}>
                <span>{(expanded[g.key] ?? !g.collapsed) ? '▾' : '▸'}</span> {g.label} <span className="count">{g.rows.length}</span>
              </button>
              {(expanded[g.key] ?? !g.collapsed) &&
                g.rows.map((r) => (
                  <div key={r.task.id} className={r.task.done_at ? 'task done' : 'task'}>
                    <button className="check" onClick={() => toggle(r.task)} aria-label={r.task.done_at ? 'Mark not done' : 'Mark done'}>
                      {r.task.done_at ? '✓' : ''}
                    </button>
                    <div className="task-body" onClick={() => setOpenTask(openTask === r.task.id ? null : r.task.id)}>
                      <div className="task-title">{r.task.title}</div>
                      <div className="task-meta">
                        {r.project && <span className="chip">{r.project.name}</span>}
                        {r.due && <span className={r.due < today() && !r.task.done_at ? 'due overdue' : 'due'}>{fmtWeekdayShort(r.due)}</span>}
                      </div>
                      {openTask === r.task.id && (
                        <div className="task-details" onClick={(e) => e.stopPropagation()}>
                          {r.task.phase && <div className="muted small">{r.task.phase}</div>}
                          {r.task.details && <p>{r.task.details}</p>}
                          <div className="row">
                            {r.project && (
                              <Link className="btn small" to={`/projects/${r.project.id}/checklist`}>
                                Open project
                              </Link>
                            )}
                            {r.project && r.task.email_key && (
                              <Link className="btn small" to={`/projects/${r.project.id}/emails?key=${r.task.email_key}`}>
                                Draft email
                              </Link>
                            )}
                            {!r.project && (
                              <button className="btn small ghost" onClick={() => remove(r.task)}>
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          ),
        )}
        {visible.length === 0 && <p className="muted">Nothing here yet.</p>}
      </section>
    </div>
  )
}

function AddTask({ projects, defaultList, onAdded }: { projects: Project[]; defaultList: string; onAdded: () => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const listId = target ?? defaultList

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const ok = await act(async () =>
      must(
        await supabase.from('tasks').insert({
          title: title.trim(),
          due_date: due || null,
          project_id: listId === MINE ? null : listId,
          phase: listId === MINE ? '' : 'Other',
          sort: 1000,
        }),
      ),
    )
    if (!ok) return
    setTitle('')
    setDue('')
    await onAdded()
  }

  return (
    <form className="add-task" onSubmit={submit}>
      <input placeholder="+ Add a task" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
      <select value={listId} onChange={(e) => setTarget(e.target.value)} aria-label="List">
        <option value={MINE}>My tasks</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button className="btn primary">Add</button>
    </form>
  )
}
