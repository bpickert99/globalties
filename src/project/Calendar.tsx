import type { MouseEvent } from 'react'
import { dayRange, fmtTimeRange, parseDate } from '../dates'
import { KIND_LABELS, sortItems } from '../logic'
import type { Project, ScheduleItem } from '../types'

const PX_PER_MIN = 1 // 60px per hour
const SLOT_MIN = 30

const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

type Placed = { item: ScheduleItem; start: number; end: number; lane: number; lanes: number }

// Side-by-side lanes for overlapping items within a day.
function layout(items: ScheduleItem[]): Placed[] {
  const timed = items
    .filter((i) => i.start_time)
    .map((i) => {
      const start = minutes(i.start_time!)
      const end = i.end_time ? Math.max(minutes(i.end_time), start + 15) : start + 60
      return { item: i, start, end, lane: 0, lanes: 1 }
    })
    .sort((a, b) => a.start - b.start || b.end - a.end)
  let cluster: Placed[] = []
  let clusterEnd = -1
  const finish = () => {
    const n = Math.max(...cluster.map((p) => p.lane)) + 1
    for (const p of cluster) p.lanes = n
  }
  for (const p of timed) {
    if (p.start >= clusterEnd && cluster.length) {
      finish()
      cluster = []
    }
    const laneEnds: number[] = []
    for (const q of cluster) laneEnds[q.lane] = Math.max(laneEnds[q.lane] ?? 0, q.end)
    let lane = laneEnds.findIndex((end) => end <= p.start)
    if (lane === -1) lane = laneEnds.length
    p.lane = lane
    cluster.push(p)
    clusterEnd = Math.max(clusterEnd, p.end)
  }
  if (cluster.length) finish()
  return timed
}

export default function CalendarView({
  project,
  items,
  warnings,
  onEdit,
  onAdd,
}: {
  project: Project
  items: ScheduleItem[]
  warnings: Set<string>
  onEdit: (item: ScheduleItem) => void
  onAdd: (day: string, time: string | null) => void
}) {
  const days = dayRange(project.arrival_date, project.departure_date)
  const sorted = sortItems(items)
  const timed = sorted.filter((i) => i.start_time)
  // Show 7 am–10 pm, widened to fit anything scheduled outside that.
  const firstHour = Math.min(7, ...timed.map((i) => Math.floor(minutes(i.start_time!) / 60)))
  const lastHour = Math.max(22, ...timed.map((i) => Math.ceil((i.end_time ? minutes(i.end_time) : minutes(i.start_time!) + 60) / 60)))
  const top = firstHour * 60
  const height = (lastHour - firstHour) * 60 * PX_PER_MIN
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i)

  function clickSlot(day: string, e: MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    const slot = Math.floor(y / PX_PER_MIN / SLOT_MIN) * SLOT_MIN + top
    onAdd(day, toTime(slot))
  }

  return (
    <div className="cal-wrap card">
      <div className="cal" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(140px, 1fr))` }}>
        <div className="cal-corner" />
        {days.map((d) => {
          const date = parseDate(d)
          return (
            <div key={d} className="cal-day-head">
              <b>{date.toLocaleDateString('en-US', { weekday: 'short' })}</b> {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          )
        })}
        <div className="cal-allday-label">All day</div>
        {days.map((d) => (
          <div key={d} className="cal-allday" onClick={(e) => e.target === e.currentTarget && onAdd(d, null)}>
            {sorted
              .filter((i) => i.day === d && !i.start_time)
              .map((i) => (
                <button key={i.id} className={`cal-chip kind-${i.kind}`} onClick={() => onEdit(i)}>
                  {i.title}
                </button>
              ))}
          </div>
        ))}
        <div className="cal-hours" style={{ height }}>
          {hours.map((h) => (
            <div key={h} className="cal-hour-label" style={{ top: (h - firstHour) * 60 * PX_PER_MIN }}>
              {h % 12 === 0 ? 12 : h % 12} {h < 12 ? 'am' : 'pm'}
            </div>
          ))}
        </div>
        {days.map((d) => (
          <div key={d} className="cal-col" style={{ height }} onClick={(e) => clickSlot(d, e)} title="Click an empty time to add">
            {hours.map((h) => (
              <div key={h} className="cal-line" style={{ top: (h - firstHour) * 60 * PX_PER_MIN }} />
            ))}
            {layout(sorted.filter((i) => i.day === d)).map((p) => (
              <button
                key={p.item.id}
                className={`cal-item kind-${p.item.kind}${p.item.status ? ` status-${p.item.status}` : ''}`}
                style={{
                  top: (p.start - top) * PX_PER_MIN,
                  height: Math.max((p.end - p.start) * PX_PER_MIN, 22),
                  left: `calc(${(100 / p.lanes) * p.lane}% + 2px)`,
                  width: `calc(${100 / p.lanes}% - 4px)`,
                }}
                onClick={() => onEdit(p.item)}
                title={`${fmtTimeRange(p.item.start_time, p.item.end_time)} ${p.item.title} (${KIND_LABELS[p.item.kind]})`}
              >
                <span className="cal-time">{fmtTimeRange(p.item.start_time, p.item.end_time)}</span>
                <span className="cal-title">
                  {warnings.has(p.item.id) && '⚠ '}
                  {p.item.title}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
