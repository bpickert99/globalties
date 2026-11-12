import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { dayRange, fmtTimeRange, parseDate } from '../dates'
import { KIND_LABELS, sortItems } from '../logic'
import type { Project, ScheduleItem } from '../types'

const PX_PER_MIN = 1 // 60px per hour
const SLOT_MIN = 30
const SNAP_MIN = 15
const DRAG_THRESHOLD_PX = 4
const CLICK_AFTER_DROP_MS = 300

// Called from click handlers only.
const justDropped = (droppedAt: number) => Date.now() - droppedAt < CLICK_AFTER_DROP_MS

const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

type Placed = { item: ScheduleItem; start: number; end: number; lane: number; lanes: number }

// An item being dragged: moved (day and start, keeping its length) or resized (end only).
// `saving` holds the dropped position on screen until the save finishes.
type Drag = { item: ScheduleItem; mode: 'move' | 'resize'; x: number; y: number; moved: boolean; saving: boolean; day: string; start: number; end: number }

export type Move = { day: string; start_time: string; end_time: string | null }

function itemSpan(item: ScheduleItem): { start: number; end: number } {
  const start = minutes(item.start_time!)
  return { start, end: item.end_time ? Math.max(minutes(item.end_time), start + 15) : start + 60 }
}

// Side-by-side lanes for overlapping items within a day.
function layout(items: ScheduleItem[]): Placed[] {
  const timed = items
    .filter((i) => i.start_time)
    .map((i) => {
      const { start, end } = itemSpan(i)
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
  onMove,
}: {
  project: Project
  items: ScheduleItem[]
  warnings: Set<string>
  onEdit: (item: ScheduleItem) => void
  onAdd: (day: string, time: string | null) => void
  onMove: (item: ScheduleItem, move: Move) => Promise<void>
}) {
  const days = dayRange(project.arrival_date, project.departure_date)
  const [drag, setDrag] = useState<Drag | null>(null)
  const columns = useRef(new Map<string, HTMLDivElement>())
  // The click the browser fires when a drag is released must not open the editor or the add form.
  const droppedAt = useRef(0)
  const shown = drag?.moved ? items.map((i) => (i.id === drag.item.id ? { ...i, day: drag.day, start_time: toTime(drag.start), end_time: toTime(drag.end) } : i)) : items
  const sorted = sortItems(shown)
  const timed = sorted.filter((i) => i.start_time)
  // Show 7 am–10 pm, widened to fit anything scheduled outside that.
  const firstHour = Math.min(7, ...timed.map((i) => Math.floor(minutes(i.start_time!) / 60)))
  const lastHour = Math.max(22, ...timed.map((i) => Math.ceil((i.end_time ? minutes(i.end_time) : minutes(i.start_time!) + 60) / 60)))
  const top = firstHour * 60
  const height = (lastHour - firstHour) * 60 * PX_PER_MIN
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i)

  function beginDrag(e: PointerEvent<HTMLElement>, item: ScheduleItem, mode: Drag['mode']) {
    if (e.button !== 0 || drag) return
    e.stopPropagation()
    setDrag({ item, mode, x: e.clientX, y: e.clientY, moved: false, saving: false, day: item.day, ...itemSpan(item) })
  }

  // Moving an item into another day's column remounts its element, so the drag is followed on
  // the window rather than on the item (pointer capture on the item would be lost mid-drag).
  useEffect(() => {
    if (!drag || drag.saving) return
    const current = drag

    function dragTo(e: globalThis.PointerEvent) {
      const dy = e.clientY - current.y
      if (!current.moved && Math.hypot(e.clientX - current.x, dy) < DRAG_THRESHOLD_PX) return
      const delta = Math.round(dy / PX_PER_MIN / SNAP_MIN) * SNAP_MIN
      const orig = itemSpan(current.item)
      if (current.mode === 'resize') {
        setDrag({ ...current, moved: true, end: Math.min(Math.max(orig.end + delta, orig.start + SNAP_MIN), 24 * 60) })
        return
      }
      const length = orig.end - orig.start
      const start = Math.min(Math.max(orig.start + delta, 0), 24 * 60 - length)
      const day = [...columns.current].find(([, el]) => {
        const r = el.getBoundingClientRect()
        return e.clientX >= r.left && e.clientX < r.right
      })?.[0]
      setDrag({ ...current, moved: true, day: day ?? current.day, start, end: start + length })
    }

    async function drop() {
      if (!current.moved) return setDrag(null)
      droppedAt.current = Date.now()
      setDrag({ ...current, saving: true })
      const { item, day, start, end } = current
      try {
        await onMove(item, { day, start_time: toTime(start), end_time: current.mode === 'move' && !item.end_time ? null : toTime(end) })
      } finally {
        setDrag(null)
      }
    }

    const cancel = () => setDrag(null)
    window.addEventListener('pointermove', dragTo)
    window.addEventListener('pointerup', drop)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', dragTo)
      window.removeEventListener('pointerup', drop)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [drag, onMove])

  function clickSlot(day: string, e: MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || justDropped(droppedAt.current)) return
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
          <div
            key={d}
            ref={(el) => {
              if (el) columns.current.set(d, el)
              else columns.current.delete(d)
            }}
            className="cal-col"
            style={{ height }}
            onClick={(e) => clickSlot(d, e)}
            title="Click an empty time to add"
          >
            {hours.map((h) => (
              <div key={h} className="cal-line" style={{ top: (h - firstHour) * 60 * PX_PER_MIN }} />
            ))}
            {layout(sorted.filter((i) => i.day === d)).map((p) => (
              <button
                key={p.item.id}
                className={`cal-item kind-${p.item.kind}${p.item.status ? ` status-${p.item.status}` : ''}${drag?.moved && drag.item.id === p.item.id ? ' dragging' : ''}`}
                style={{
                  top: (p.start - top) * PX_PER_MIN,
                  height: Math.max((p.end - p.start) * PX_PER_MIN, 22),
                  left: `calc(${(100 / p.lanes) * p.lane}% + 2px)`,
                  width: `calc(${100 / p.lanes}% - 4px)`,
                }}
                onPointerDown={(e) => beginDrag(e, p.item, 'move')}
                onClick={() => !justDropped(droppedAt.current) && onEdit(p.item)}
                title={`${fmtTimeRange(p.item.start_time, p.item.end_time)} ${p.item.title} (${KIND_LABELS[p.item.kind]}). Drag to move; drag the bottom edge to change the end.`}
              >
                <span className="cal-time">{fmtTimeRange(p.item.start_time, p.item.end_time)}</span>
                <span className="cal-title">
                  {warnings.has(p.item.id) && '⚠ '}
                  {p.item.title}
                </span>
                <span className="cal-resize" aria-hidden onPointerDown={(e) => beginDrag(e, p.item, 'resize')} />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
