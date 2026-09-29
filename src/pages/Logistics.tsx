import { Link } from 'react-router-dom'
import { daysBetween, fmtRange, fmtShort, fmtWeekdayShort, today } from '../dates'
import { hotelChanges, hotelSnapshot, roomingRows } from '../hotel'
import { taskApplies, taskDue } from '../logic'
import { must, supabase } from '../supabase'
import { changesSince, passengers, snapshot } from '../transport'
import type { Participant, Project, ScheduleItem, Task } from '../types'
import { Loading, useData } from '../ui'

const HORIZON_DAYS = 45

async function load() {
  const projects = (must(await supabase.from('projects').select('*').is('closed_at', null).order('arrival_date')) as Project[]).filter(
    (p) => p.departure_date >= today() && daysBetween(today(), p.arrival_date) <= HORIZON_DAYS,
  )
  const ids = projects.map((p) => p.id)
  const [tasks, people, items] = await Promise.all([
    supabase.from('tasks').select('*').in('project_id', ids),
    supabase.from('participants').select('*').in('project_id', ids),
    supabase.from('schedule_items').select('*').in('project_id', ids),
  ])
  return { projects, tasks: must(tasks) as Task[], people: must(people) as Participant[], items: must(items) as ScheduleItem[] }
}

type Status = { text: string; tone: 'ok' | 'warn' | 'todo' }

function sentStatus(sentAt: string | null, changes: string[]): Status {
  if (!sentAt) return { text: 'Not sent', tone: 'todo' }
  if (changes.length) return { text: `Changed since ${fmtShort(sentAt.slice(0, 10))}: ${changes.join('; ')}`, tone: 'warn' }
  return { text: `Up to date (${fmtShort(sentAt.slice(0, 10))})`, tone: 'ok' }
}

// Hotel and Agenda status for every group arriving soon. Emails stay one thread per program;
// this is for seeing everything at once and for phone calls.
export default function Logistics() {
  const { data, error } = useData(load, [])
  if (!data) return <Loading error={error} />

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Logistics board</h1>
          <div className="muted">Hotel and Agenda USA status for groups in KC or arriving in the next {HORIZON_DAYS} days. Keep one email thread per program.</div>
        </div>
      </div>
      {data.projects.length === 0 && <p className="muted">No groups in the next {HORIZON_DAYS} days.</p>}
      <div className="table-wrap card">
        <table className="board">
          <thead>
            <tr>
              <th>Program</th>
              <th>Hotel</th>
              <th>Agenda USA</th>
              <th>Next logistics step</th>
            </tr>
          </thead>
          <tbody>
            {data.projects.map((p) => {
              const people = data.people.filter((x) => x.project_id === p.id)
              const items = data.items.filter((x) => x.project_id === p.id)
              const tasks = data.tasks.filter((t) => t.project_id === p.id && taskApplies(t, p))
              const hotel = sentStatus(p.hotel_sent_at, p.hotel_sent ? hotelChanges(p.hotel_sent, hotelSnapshot(p, people)) : [])
              const agenda = sentStatus(p.transport_sent_at, p.transport_sent ? changesSince(p.transport_sent, snapshot(p, people, items)) : [])
              const booked = tasks.find((t) => t.email_key === 'transport_request')?.done_at
              const missingConf = roomingRows(people).filter((r) => !r.confirmation).length
              const next = tasks
                .filter((t) => !t.done_at && /hotel|agenda/i.test(t.title))
                .map((t) => ({ t, due: taskDue(t, p) ?? '9999' }))
                .sort((a, b) => a.due.localeCompare(b.due))[0]
              const days = daysBetween(today(), p.arrival_date)
              return (
                <tr key={p.id}>
                  <td>
                    <Link to={`/projects/${p.id}/hotel`}>
                      <b>{p.name}</b>
                    </Link>
                    <div className="muted small">
                      {fmtRange(p.arrival_date, p.departure_date)} · {days > 0 ? `in ${days} days` : 'in KC now'}
                    </div>
                  </td>
                  <td>
                    <div>{p.hotel_name || <span className="muted">No hotel</span>}</div>
                    <div className="small">
                      {hotelSnapshot(p, people).rooms} rooms{missingConf > 0 && ` · ${missingConf} without confirmation #`}
                    </div>
                    <div className={`small tone-${hotel.tone}`}>Rooming list: {hotel.text}</div>
                  </td>
                  <td>
                    <div className="small">
                      {passengers(people)} passengers · {p.luggage_count ?? '?'} bags · {booked ? 'booked' : <span className="tone-todo">not booked</span>}
                    </div>
                    <div className={`small tone-${agenda.tone}`}>Calendar: {agenda.text}</div>
                    <div className="small">
                      {p.drivers.filter((d) => d.name).length ? (
                        p.drivers
                          .filter((d) => d.name)
                          .map((d) => `${d.name}${d.role ? ` (${d.role})` : ''} ${d.phone}`)
                          .join(', ')
                      ) : (
                        <span className="tone-todo">No driver yet</span>
                      )}
                    </div>
                  </td>
                  <td className="small">
                    {next ? (
                      <>
                        {next.t.title}
                        <div className={next.due < today() ? 'due overdue' : 'due'}>{next.due === '9999' ? 'no date' : fmtWeekdayShort(next.due)}</div>
                      </>
                    ) : (
                      <span className="tone-ok">All done</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
