import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { fmtShort, fmtWeekdayShort, parseDate, today } from '../dates'
import { activePeople, taskApplies, taskDue } from '../logic'
import type { TabProps } from '../pages/Project'
import { must, supabase } from '../supabase'
import { BAGS_PER_PERSON, calendar, calendarHtml, calendarText, changesSince, passengers, snapshot } from '../transport'
import type { Project, Task, TransportLogEntry } from '../types'
import { act, CopyRichButton, Field } from '../ui'

// Everything about Agenda USA for one project: the steps, what they've been told, and calls.
export default function Transportation({ data, reload }: TabProps) {
  const { project, people, items, tasks } = data
  const pax = passengers(people)
  const days = calendar(project, items)
  const current = snapshot(project, people, items)
  const changes = project.transport_sent ? changesSince(project.transport_sent, current) : []
  const steps = tasks.filter((t) => taskApplies(t, project) && /agenda/i.test(`${t.title} ${t.details}`))
  const calendarTask = tasks.find((t) => t.email_key === 'transport_calendar')

  async function update(patch: Partial<Project>) {
    await act(async () => must(await supabase.from('projects').update(patch).eq('id', project.id)))
    await reload()
  }

  async function toggleTask(t: Task) {
    await act(async () => must(await supabase.from('tasks').update({ done_at: t.done_at ? null : new Date().toISOString() }).eq('id', t.id)))
    await reload()
  }

  // Record exactly what Agenda now has, and tick off the calendar step.
  async function markSent() {
    await act(async () => {
      must(await supabase.from('projects').update({ transport_sent: current, transport_sent_at: new Date().toISOString() }).eq('id', project.id))
      if (calendarTask && !calendarTask.done_at) must(await supabase.from('tasks').update({ done_at: new Date().toISOString() }).eq('id', calendarTask.id))
    })
    await reload()
  }

  const byRole = (role: string) => activePeople(people).filter((p) => p.role === role).length

  return (
    <div className="stack">
      <section className="card">
        <h2>Agenda USA steps</h2>
        {steps.map((t) => {
          const due = taskDue(t, project)
          return (
            <div key={t.id} className={t.done_at ? 'task done' : 'task'}>
              <button className="check" onClick={() => toggleTask(t)} aria-label={t.done_at ? 'Mark not done' : 'Mark done'}>
                {t.done_at ? '✓' : ''}
              </button>
              <div className="task-body">
                <div className="task-title">{t.title}</div>
                <div className="task-meta">
                  {due && <span className={due < today() && !t.done_at ? 'due overdue' : 'due'}>{fmtWeekdayShort(due)}</span>}
                  {t.done_at && <span className="muted">done {fmtShort(t.done_at.slice(0, 10))}</span>}
                  {t.email_key && (
                    <Link className="btn small" to={`../emails?key=${t.email_key}`}>
                      Draft email
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </section>

      <TripDetails key={`${project.luggage_count}|${project.driver_name}|${project.driver_phone}`} project={project} pax={pax} onSave={update}>
        <span className="muted small">
          {byRole('participant')} participants · {byRole('interpreter')} interpreters · {byRole('liaison')} liaisons. From the Participants tab; cancellations are left out.
        </span>
      </TripDetails>

      <section className="card">
        <div className="row spread">
          <h2>Overarching calendar</h2>
          <div className="row">
            <CopyRichButton html={calendarHtml(days)} text={calendarText(days)} label="Copy calendar table" />
            <Link className="btn small" to="../emails?key=transport_calendar">
              Draft email
            </Link>
            <button className="btn small primary" onClick={markSent}>
              Mark as sent to Agenda
            </button>
          </div>
        </div>
        {!project.transport_sent_at && <p className="notice">Not sent to Agenda yet. Built from the Schedule tab; empty days show as Free Day.</p>}
        {project.transport_sent_at && changes.length === 0 && (
          <p className="notice ok">Agenda is up to date. Last sent {fmtShort(project.transport_sent_at.slice(0, 10))}.</p>
        )}
        {changes.length > 0 && (
          <div className="notice warn">
            <b>Changed since you sent it to Agenda on {fmtShort(project.transport_sent_at!.slice(0, 10))}:</b>
            <ul>
              {changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            Send Bruce the update (or call), then click "Mark as sent to Agenda".
          </div>
        )}
        <div className="table-wrap">
          <table className="cal">
            <thead>
              <tr>
                {days.map((d) => (
                  <th key={d.day}>
                    {parseDate(d.day).toLocaleDateString('en-US', { weekday: 'long' })}
                    <br />
                    {parseDate(d.day).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {days.map((d) => (
                  <td key={d.day}>
                    {d.lines.map((l, i) => (
                      <div key={i}>{l}</div>
                    ))}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <CallLog log={project.transport_log} onChange={(transport_log) => update({ transport_log })} />
    </div>
  )
}

function TripDetails({ project, pax, onSave, children }: { project: Project; pax: number; onSave: (p: Partial<Project>) => Promise<void>; children: ReactNode }) {
  const [luggage, setLuggage] = useState(project.luggage_count === null ? '' : String(project.luggage_count))
  const [driverName, setDriverName] = useState(project.driver_name)
  const [driverPhone, setDriverPhone] = useState(project.driver_phone)
  const suggested = pax * BAGS_PER_PERSON
  const dirty = luggage !== (project.luggage_count === null ? '' : String(project.luggage_count)) || driverName !== project.driver_name || driverPhone !== project.driver_phone

  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave({ luggage_count: luggage === '' ? null : Number(luggage), driver_name: driverName, driver_phone: driverPhone })
      }}
    >
      <h2>Trip details</h2>
      <div className="grid">
        <Field label="Passengers">
          <input value={pax} readOnly />
        </Field>
        <Field label="Approx. luggage (bags)">
          <div className="row nowrap">
            <input type="number" min={0} value={luggage} onChange={(e) => setLuggage(e.target.value)} />
            {pax > 0 && luggage !== String(suggested) && (
              <button type="button" className="btn small" onClick={() => setLuggage(String(suggested))}>
                Use {suggested}
              </button>
            )}
          </div>
        </Field>
        <Field label="Hotel">
          <input value={project.hotel_name} readOnly placeholder="Set on the Overview tab" />
        </Field>
        <Field label="Driver name">
          <input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
        </Field>
        <Field label="Driver phone">
          <input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
        </Field>
      </div>
      {children}
      <p className="muted small">About {BAGS_PER_PERSON} bags per person. The driver prints under Local Transportation on the itinerary.</p>
      <button className="btn primary" disabled={!dirty}>
        Save
      </button>
    </form>
  )
}

function CallLog({ log, onChange }: { log: TransportLogEntry[]; onChange: (log: TransportLogEntry[]) => Promise<void> }) {
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const sorted = [...log].sort((a, b) => b.date.localeCompare(a.date))

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    await onChange([...log, { date, note: note.trim() }])
    setNote('')
  }

  return (
    <section className="card form">
      <h2>Calls & notes with Agenda</h2>
      <p className="muted small">Bruce prefers the phone. Log what was agreed so it isn't only in someone's head.</p>
      <form className="add-task call-form" onSubmit={add}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        <input placeholder="e.g. Called Bruce: van for 23 + luggage trailer confirmed; driver TBD" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn primary">Add</button>
      </form>
      {sorted.map((entry) => (
        <div key={`${entry.date}|${entry.note}`} className="log-entry">
          <span className="muted small nowrap">{fmtShort(entry.date)}</span>
          <span>{entry.note}</span>
          <button className="btn small ghost" onClick={() => onChange(log.filter((x) => x !== entry))} aria-label="Delete note">
            ✕
          </button>
        </div>
      ))}
    </section>
  )
}
