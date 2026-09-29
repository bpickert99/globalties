import { useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtShort, fmtTimeRange, fmtWeekdayShort, today } from '../dates'
import { hotelChanges, hotelSnapshot, roomingHtml, roomingRows, roomingText } from '../hotel'
import { activePeople, sortItems, taskApplies, taskDue } from '../logic'
import type { TabProps } from '../pages/Project'
import { must, supabase } from '../supabase'
import type { Project, Task } from '../types'
import { act, CopyRichButton, Field } from '../ui'
import VendorLog from '../VendorLog'

// Landing plus 90 minutes, rounded up to the half hour (3:52 pm landing → 5:30 pm at the hotel).
function suggestedEta(landing: string | null): string | null {
  if (!landing) return null
  const [h, m] = landing.split(':').map(Number)
  const minutes = Math.ceil((h * 60 + m + 90) / 30) * 30
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

// Everything about the hotel for one project: steps, rooming list, what the hotel has, calls.
export default function Hotel({ data, reload }: TabProps) {
  const { project, people, items, tasks } = data
  const rows = roomingRows(people)
  const now = hotelSnapshot(project, people)
  const changes = project.hotel_sent ? hotelChanges(project.hotel_sent, now) : []
  const steps = tasks.filter((t) => taskApplies(t, project) && /hotel/i.test(t.title))
  const missingConfirmations = rows.filter((r) => !r.confirmation).length
  const landing = sortItems(items).find((i) => i.day === project.arrival_date && i.kind === 'flight' && i.start_time)?.start_time ?? null

  async function update(patch: Partial<Project>) {
    await act(async () => must(await supabase.from('projects').update(patch).eq('id', project.id)))
    await reload()
  }

  async function toggleTask(t: Task) {
    await act(async () => must(await supabase.from('tasks').update({ done_at: t.done_at ? null : new Date().toISOString() }).eq('id', t.id)))
    await reload()
  }

  const byRole = (role: string) => activePeople(people).filter((p) => p.role === role).length

  return (
    <div className="stack">
      <section className="card">
        <h2>Hotel steps</h2>
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

      <section className="card">
        <div className="row spread">
          <h2>{project.hotel_name || 'No hotel yet'}</h2>
          <Link className="btn small" to="../overview">
            Edit hotel details
          </Link>
        </div>
        <div className="muted small">
          {[project.hotel_address, project.hotel_phone, project.hotel_rate && `GSA ${project.hotel_rate}`].filter(Boolean).join(' · ')}
        </div>
        <div className="small">{[project.hotel_contact_name, project.hotel_contact_email].filter(Boolean).join(' · ') || 'No hotel contact yet'}</div>
      </section>

      <Arrival key={`${project.hotel_eta}|${project.hotel_checkout}`} project={project} landing={landing} onSave={update} />

      <section className="card">
        <div className="row spread">
          <h2>Rooming list · {now.rooms} rooms</h2>
          <div className="row">
            <CopyRichButton html={roomingHtml(rows, project)} text={roomingText(rows, project)} label="Copy rooming list" />
            <button className="btn small primary" onClick={() => update({ hotel_sent: now, hotel_sent_at: new Date().toISOString() })}>
              Mark as sent to hotel
            </button>
          </div>
        </div>
        <p className="muted small">
          {byRole('participant')} participants · {byRole('interpreter')} interpreters · {byRole('liaison')} liaisons, one room each. From the Participants
          tab; add placeholders (e.g. "TBD Liaison") until names are known.
        </p>
        {!project.hotel_sent_at && <p className="notice">The hotel hasn't been sent a rooming list from here yet.</p>}
        {project.hotel_sent_at && changes.length === 0 && <p className="notice ok">The hotel is up to date. Last sent {fmtShort(project.hotel_sent_at.slice(0, 10))}.</p>}
        {changes.length > 0 && (
          <div className="notice warn">
            <b>Changed since you sent it to the hotel on {fmtShort(project.hotel_sent_at!.slice(0, 10))}:</b>
            <ul>
              {changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            The "Hotel: final details" email lists the cancellations. After sending, click "Mark as sent to hotel".
          </div>
        )}
        {missingConfirmations > 0 && rows.length > 0 && <p className="notice">{missingConfirmations} room(s) without a confirmation number yet.</p>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name (Last, First)</th>
                <th>Role</th>
                <th>Confirmation #</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name}>
                  <td>{i + 1}</td>
                  <td>{r.name}</td>
                  <td>{r.role}</td>
                  <td>{r.confirmation || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <VendorLog
        party="hotel"
        log={project.vendor_log}
        hint="Contract, credit card authorization, confirmation numbers, room changes: note what was agreed and when."
        placeholder="e.g. Jessica sent countersigned contract + confirmation numbers"
        onChange={(vendor_log) => update({ vendor_log })}
      />
    </div>
  )
}

function Arrival({ project, landing, onSave }: { project: Project; landing: string | null; onSave: (p: Partial<Project>) => Promise<void> }) {
  const [eta, setEta] = useState(project.hotel_eta?.slice(0, 5) ?? '')
  const [checkout, setCheckout] = useState(project.hotel_checkout.slice(0, 5))
  const suggestion = suggestedEta(landing)
  const dirty = eta !== (project.hotel_eta?.slice(0, 5) ?? '') || checkout !== project.hotel_checkout.slice(0, 5)
  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave({ hotel_eta: eta || null, hotel_checkout: checkout })
      }}
    >
      <h2>Arrival & checkout</h2>
      <div className="grid">
        <Field label="Flight lands">
          <input value={landing ? fmtTimeRange(landing, null) : ''} readOnly placeholder="Add the arrival flight on the Schedule tab" />
        </Field>
        <Field label="Expected at hotel">
          <div className="row nowrap">
            <input type="time" value={eta} onChange={(e) => setEta(e.target.value)} />
            {suggestion && eta !== suggestion && (
              <button type="button" className="btn small" onClick={() => setEta(suggestion)}>
                Use {fmtTimeRange(suggestion, null)}
              </button>
            )}
          </div>
        </Field>
        <Field label={`Checkout by (${fmtShort(project.departure_date)})`}>
          <input type="time" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
        </Field>
      </div>
      <button className="btn primary" disabled={!dirty}>
        Save
      </button>
    </form>
  )
}
