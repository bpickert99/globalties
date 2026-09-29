// Hotel coordination: rooms and rooming list from the roster, and what changed since it was sent.

import { fmtShort, fmtTimeRange } from './dates'
import { activePeople, sortItems } from './logic'
import type { HotelSnapshot, Participant, Project, ScheduleItem } from './types'

// "Nguere, Juan Diosdado": how hotels list guests.
export function roomingName(p: Participant): string {
  return `${p.family_name}, ${p.given_name}`
}

export function hotelSnapshot(project: Project, people: Participant[]): HotelSnapshot {
  const active = activePeople(people)
  return {
    rooms: active.length,
    names: active.map(roomingName).sort(),
    arrival: project.arrival_date,
    departure: project.departure_date,
  }
}

export function hotelChanges(sent: HotelSnapshot, now: HotelSnapshot): string[] {
  const out: string[] = []
  if (sent.rooms !== now.rooms) out.push(`Rooms ${sent.rooms} → ${now.rooms}`)
  const removed = sent.names.filter((n) => !now.names.includes(n))
  const added = now.names.filter((n) => !sent.names.includes(n))
  if (removed.length) out.push(`Cancel: ${removed.join('; ')}`)
  if (added.length) out.push(`Add: ${added.join('; ')}`)
  if (sent.arrival !== now.arrival || sent.departure !== now.departure) {
    out.push(`Dates ${fmtShort(sent.arrival)}–${fmtShort(sent.departure)} → ${fmtShort(now.arrival)}–${fmtShort(now.departure)}`)
  }
  return out
}

// Names that were on the list the hotel has but are no longer coming.
export function cancelledSinceSent(sent: HotelSnapshot | null, now: HotelSnapshot): string[] {
  return sent ? sent.names.filter((n) => !now.names.includes(n)) : []
}

// Landing time: the first flight on arrival day.
export function arrivalFlightTime(project: Project, items: ScheduleItem[]): string | null {
  const flight = sortItems(items).find((i) => i.day === project.arrival_date && i.kind === 'flight' && i.start_time)
  return flight ? fmtTimeRange(flight.start_time, null) : null
}

type RoomingRow = { name: string; role: string; confirmation: string }

export function roomingRows(people: Participant[]): RoomingRow[] {
  const role = { participant: 'Participant', interpreter: 'Interpreter', liaison: 'Liaison' } as const
  return activePeople(people)
    .map((p) => ({ name: roomingName(p), role: role[p.role], confirmation: p.hotel_confirmation }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function roomingText(rows: RoomingRow[], project: Project): string {
  return [`Check-in ${fmtShort(project.arrival_date)}, check-out ${fmtShort(project.departure_date)}`, ...rows.map((r, i) => `${i + 1}. ${r.name} (${r.role})${r.confirmation ? ` — #${r.confirmation}` : ''}`)].join('\n')
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function roomingHtml(rows: RoomingRow[], project: Project): string {
  const cell = 'border:1px solid #999;padding:4px 8px;font-family:Calibri,Arial,sans-serif;font-size:10pt'
  const head = ['#', 'Name (Last, First)', 'Role', 'Check-in', 'Check-out', 'Confirmation #'].map((h) => `<th style="${cell};background:#eef1f5">${h}</th>`).join('')
  const body = rows
    .map((r, i) =>
      [String(i + 1), r.name, r.role, fmtShort(project.arrival_date), fmtShort(project.departure_date), r.confirmation].map((v) => `<td style="${cell}">${esc(v)}</td>`).join(''),
    )
    .map((tds) => `<tr>${tds}</tr>`)
    .join('')
  return `<table style="border-collapse:collapse"><tr>${head}</tr>${body}</table>`
}
