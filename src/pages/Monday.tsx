import { Link } from 'react-router-dom'
import { addDays, daysBetween, fmtRange, fmtShort, fmtWeekdayShort, today, weekStart } from '../dates'
import { stage, taskApplies, taskDue } from '../logic'
import { must, supabase } from '../supabase'
import type { Project, ScheduleItem, Task } from '../types'
import { CopyButton, Loading, useData } from '../ui'

const HORIZON_DAYS = 56

async function load() {
  const projects = must(await supabase.from('projects').select('*').is('closed_at', null).order('arrival_date')) as Project[]
  const ids = projects.map((p) => p.id)
  const tasks = must(await supabase.from('tasks').select('*').in('project_id', ids).is('done_at', null).order('sort')) as Task[]
  const meetings = must(await supabase.from('schedule_items').select('*').in('project_id', ids).eq('kind', 'meeting').order('day')) as ScheduleItem[]
  return { projects, tasks, meetings }
}

type Section = {
  project: Project
  toRequest: ScheduleItem[]
  awaiting: ScheduleItem[]
  fellThrough: ScheduleItem[]
  tasks: { task: Task; due: string }[]
}

function build(data: Awaited<ReturnType<typeof load>>): Section[] {
  const now = today()
  const weekEnd = addDays(weekStart(now), 6)
  return data.projects
    .filter((p) => daysBetween(now, p.arrival_date) <= HORIZON_DAYS)
    .map((project) => {
      const meetings = data.meetings.filter((m) => m.project_id === project.id)
      return {
        project,
        toRequest: meetings.filter((m) => m.status === 'planned'),
        awaiting: meetings.filter((m) => m.status === 'requested'),
        fellThrough: meetings.filter((m) => m.status === 'declined' && daysBetween(m.status_changed_at.slice(0, 10), now) <= 14),
        tasks: data.tasks
          .filter((t) => t.project_id === project.id && taskApplies(t, project))
          .map((task) => ({ task, due: taskDue(task, project)! }))
          .filter((t) => t.due && t.due <= weekEnd)
          .sort((a, b) => a.due.localeCompare(b.due)),
      }
    })
}

function asText(sections: Section[], allTasks: Task[]): string {
  const out = [`Monday Meeting – week of ${fmtShort(weekStart(today()))}`, '']
  for (const s of sections) {
    const p = s.project
    out.push(`${p.name}${p.countries ? ` (${p.countries})` : ''} – ${fmtRange(p.arrival_date, p.departure_date)} – ${stage(p, allTasks)}`)
    if (s.toRequest.length) out.push('  Meeting requests to send:', ...s.toRequest.map((m) => `    • ${m.title}`))
    if (s.awaiting.length) out.push('  Awaiting reply:', ...s.awaiting.map((m) => `    • ${m.title} (requested ${fmtShort(m.status_changed_at.slice(0, 10))})`))
    if (s.fellThrough.length) out.push('  Fell through:', ...s.fellThrough.map((m) => `    • ${m.title}`))
    if (s.tasks.length) out.push('  Due this week / overdue:', ...s.tasks.map((t) => `    • ${t.task.title} (${fmtShort(t.due)})`))
    out.push('')
  }
  return out.join('\n')
}

export default function Monday() {
  const { data, error } = useData(load, [])
  if (!data) return <Loading error={error} />
  const sections = build(data)
  const now = today()

  const list = (title: string, items: string[], cls = '') =>
    items.length > 0 && (
      <div className={`mm-list ${cls}`}>
        <h3>{title}</h3>
        <ul>
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
    )

  return (
    <div className="monday">
      <div className="page-head">
        <div>
          <h1>Monday Meeting</h1>
          <div className="muted">
            Week of {fmtShort(weekStart(now))} · projects arriving in the next {HORIZON_DAYS / 7} weeks, in KC, or wrapping up
          </div>
        </div>
        <div className="row no-print">
          <CopyButton text={asText(sections, data.tasks)} label="Copy as text" />
          <button className="btn" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>
      {sections.length === 0 && <p className="muted">Nothing on the horizon.</p>}
      {sections.map((s) => (
        <section key={s.project.id} className="card">
          <div className="row spread">
            <div>
              <h2>
                <Link to={`/projects/${s.project.id}/schedule`}>{s.project.name}</Link>
              </h2>
              <div className="muted small">
                {[s.project.countries, fmtRange(s.project.arrival_date, s.project.departure_date)].filter(Boolean).join(' · ')}
              </div>
            </div>
            <span className="chip">{stage(s.project, data.tasks)}</span>
          </div>
          <div className="mm-grid">
            {list('Meeting requests to send', s.toRequest.map((m) => m.title))}
            {list(
              'Awaiting reply',
              s.awaiting.map((m) => `${m.title} (requested ${fmtShort(m.status_changed_at.slice(0, 10))})`),
            )}
            {list('Fell through', s.fellThrough.map((m) => m.title), 'warn')}
            {list(
              'Due this week / overdue',
              s.tasks.map((t) => `${t.task.title} — ${t.due < now ? 'overdue, ' : ''}${fmtWeekdayShort(t.due)}`),
            )}
          </div>
          {!s.toRequest.length && !s.awaiting.length && !s.fellThrough.length && !s.tasks.length && <p className="muted small">Nothing to discuss this week.</p>}
        </section>
      ))}
    </div>
  )
}
