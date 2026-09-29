import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { fmtShort, fmtWeekdayShort, parseDate, today } from '../dates'
import { activePeople, taskApplies, taskDue } from '../logic'
import type { TabProps } from '../pages/Project'
import { must, supabase } from '../supabase'
import { BAGS_PER_PERSON, calendar, calendarHtml, calendarText, changesSince, passengers, snapshot } from '../transport'
import type { Driver, Project, Task } from '../types'
import VendorLog from '../VendorLog'
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

      <TripDetails key={`${project.luggage_count}|${JSON.stringify(project.drivers)}|${project.vehicle_notes}`} project={project} pax={pax} onSave={update}>
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

      <VendorLog
        party="agenda"
        log={project.vendor_log}
        hint="Bruce prefers the phone. Log what was agreed (driver, vehicles, changes) so it isn't only in someone's inbox or head."
        placeholder="e.g. Bruce: Carl Perico all week (913-850-2299); luggage vehicle on arrival and departure"
        onChange={(vendor_log) => update({ vendor_log })}
      />
    </div>
  )
}

function TripDetails({ project, pax, onSave, children }: { project: Project; pax: number; onSave: (p: Partial<Project>) => Promise<void>; children: ReactNode }) {
  const [luggage, setLuggage] = useState(project.luggage_count === null ? '' : String(project.luggage_count))
  const [drivers, setDrivers] = useState<Driver[]>(project.drivers)
  const [vehicleNotes, setVehicleNotes] = useState(project.vehicle_notes)
  const suggested = pax * BAGS_PER_PERSON
  const dirty =
    luggage !== (project.luggage_count === null ? '' : String(project.luggage_count)) ||
    JSON.stringify(drivers) !== JSON.stringify(project.drivers) ||
    vehicleNotes !== project.vehicle_notes
  const setDriver = (i: number, patch: Partial<Driver>) => setDrivers(drivers.map((d, j) => (j === i ? { ...d, ...patch } : d)))

  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave({ luggage_count: luggage === '' ? null : Number(luggage), drivers, vehicle_notes: vehicleNotes })
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
      </div>
      {children}
      <p className="muted small">About {BAGS_PER_PERSON} bags per person; ask the liaisons if the group is packing heavy.</p>
      <div className="field wide">
        <span>Agenda drivers (printed under Local Transportation on the itinerary)</span>
        {drivers.map((d, i) => (
          <div key={i} className="contact-row driver-row">
            <input placeholder="Role, e.g. All week / Airport Driver" value={d.role} onChange={(e) => setDriver(i, { role: e.target.value })} />
            <input placeholder="Name" value={d.name} onChange={(e) => setDriver(i, { name: e.target.value })} />
            <input placeholder="Phone" value={d.phone} onChange={(e) => setDriver(i, { phone: e.target.value })} />
            <button type="button" className="btn small ghost" onClick={() => setDrivers(drivers.filter((_, j) => j !== i))} aria-label="Remove driver">
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="btn small ghost" onClick={() => setDrivers([...drivers, { role: '', name: '', phone: '' }])}>
          + Add driver
        </button>
      </div>
      <Field label="Vehicle notes (internal)" wide>
        <input value={vehicleNotes} placeholder="e.g. Luggage vehicle on arrival and departure" onChange={(e) => setVehicleNotes(e.target.value)} />
      </Field>
      <button className="btn primary" disabled={!dirty}>
        Save
      </button>
    </form>
  )
}
