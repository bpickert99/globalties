import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { today } from '../dates'
import { taskApplies, taskDue } from '../logic'
import type { TabProps } from '../pages/Project'
import { must, supabase } from '../supabase'
import type { Task } from '../types'
import { act } from '../ui'

const REQUIRES_LABEL = { none: '', home_hospitality: 'Home hospitality', event: 'Event' } as const

export default function Checklist({ data, reload }: TabProps) {
  const { project, tasks } = data
  const [showSkipped, setShowSkipped] = useState(false)

  const phases: string[] = []
  for (const t of tasks) if (!phases.includes(t.phase)) phases.push(t.phase)

  async function update(task: Task, patch: Partial<Task>) {
    await act(async () => must(await supabase.from('tasks').update(patch).eq('id', task.id)))
    await reload()
  }

  async function remove(task: Task) {
    if (!confirm(`Delete "${task.title}"?`)) return
    await act(async () => must(await supabase.from('tasks').delete().eq('id', task.id)))
    await reload()
  }

  const skippedCount = tasks.filter((t) => !taskApplies(t, project)).length

  return (
    <div className="stack">
      <div className="row spread">
        <p className="muted small">Due dates follow the project dates. Change a date to pin it. Skip tasks that don't apply to this project.</p>
        {skippedCount > 0 && (
          <label className="toggle">
            <input type="checkbox" checked={showSkipped} onChange={(e) => setShowSkipped(e.target.checked)} /> Show {skippedCount} skipped / not applicable
          </label>
        )}
      </div>
      {phases.map((phase) => {
        const list = tasks.filter((t) => t.phase === phase && (showSkipped || taskApplies(t, project)))
        if (list.length === 0) return null
        return (
          <section key={phase} className="card">
            <h2>{phase || 'Other'}</h2>
            {list.map((t) => {
              const applies = taskApplies(t, project)
              const due = taskDue(t, project)
              const inactiveReason = !t.enabled ? 'Skipped' : !applies ? `Needs ${REQUIRES_LABEL[t.requires].toLowerCase()}` : ''
              return (
                <div key={t.id} className={`task ${t.done_at ? 'done' : ''} ${applies ? '' : 'skipped'}`}>
                  <button
                    className="check"
                    disabled={!applies}
                    onClick={() => update(t, { done_at: t.done_at ? null : new Date().toISOString() })}
                    aria-label={t.done_at ? 'Mark not done' : 'Mark done'}
                  >
                    {t.done_at ? '✓' : ''}
                  </button>
                  <div className="task-body">
                    <div className="task-title">
                      {t.title}
                      {t.requires !== 'none' && <span className="chip subtle">{REQUIRES_LABEL[t.requires]}</span>}
                      {inactiveReason && <span className="chip warn">{inactiveReason}</span>}
                    </div>
                    {t.details && <div className="muted small">{t.details}</div>}
                    <div className="task-actions">
                      <input
                        type="date"
                        className={due && due < today() && !t.done_at && applies ? 'overdue' : ''}
                        value={due ?? ''}
                        onChange={(e) => update(t, { anchor: null, offset_days: null, due_date: e.target.value || null })}
                        aria-label="Due date"
                      />
                      {t.anchor === null && t.project_id && <span className="muted small">pinned</span>}
                      {t.email_key && (
                        <Link className="btn small" to={`../emails?key=${t.email_key}`}>
                          Draft email
                        </Link>
                      )}
                      <button className="btn small ghost" onClick={() => update(t, { enabled: !t.enabled })}>
                        {t.enabled ? 'Skip' : 'Restore'}
                      </button>
                      {t.phase === 'Other' && (
                        <button className="btn small ghost" onClick={() => remove(t)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}
      <AddProjectTask projectId={project.id} onAdded={reload} />
    </div>
  )
}

function AddProjectTask({ projectId, onAdded }: { projectId: string; onAdded: () => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const ok = await act(async () =>
      must(await supabase.from('tasks').insert({ project_id: projectId, phase: 'Other', title: title.trim(), due_date: due || null, sort: 1000 })),
    )
    if (!ok) return
    setTitle('')
    setDue('')
    await onAdded()
  }

  return (
    <form className="add-task card" onSubmit={submit}>
      <input placeholder="+ Add a task to this project" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
      <button className="btn primary">Add</button>
    </form>
  )
}
