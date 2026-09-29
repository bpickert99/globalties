// Agenda USA coordination: passengers, luggage, and the day-by-day "overarching calendar".

import { dayRange, fmtSlashRange, fmtTimeRange, parseDate } from './dates'
import { activePeople, sortItems } from './logic'
import type { Participant, Project, ScheduleItem, TransportSnapshot } from './types'

export const BAGS_PER_PERSON = 3

// Everyone riding: participants, interpreters and liaisons who haven't cancelled.
export function passengers(people: Participant[]): number {
  return activePeople(people).length
}

export type CalendarDay = { day: string; lines: string[] }

// Every scheduled movement per day, in order; a day with nothing is a free day.
export function calendar(project: Project, items: ScheduleItem[]): CalendarDay[] {
  const sorted = sortItems(items)
  return dayRange(project.arrival_date, project.departure_date).map((day) => {
    const lines = sorted.filter((i) => i.day === day).map((i) => [fmtTimeRange(i.start_time, i.end_time), i.title].filter(Boolean).join(' '))
    return { day, lines: lines.length ? lines : ['Free Day'] }
  })
}

export function snapshot(project: Project, people: Participant[], items: ScheduleItem[]): TransportSnapshot {
  return {
    passengers: passengers(people),
    luggage: project.luggage_count,
    hotel: project.hotel_name,
    days: Object.fromEntries(calendar(project, items).map((d) => [d.day, d.lines.join('\n')])),
  }
}

const dayLabel = (iso: string) => parseDate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

// Human-readable list of what changed since the last send (empty when nothing did).
export function changesSince(sent: TransportSnapshot, now: TransportSnapshot): string[] {
  const out: string[] = []
  if (sent.passengers !== now.passengers) out.push(`Passengers ${sent.passengers} → ${now.passengers}`)
  if (sent.luggage !== now.luggage) out.push(`Luggage ${sent.luggage ?? 'not given'} → ${now.luggage ?? 'not given'}`)
  if (sent.hotel !== now.hotel) out.push(`Hotel "${sent.hotel}" → "${now.hotel}"`)
  const days = [...new Set([...Object.keys(sent.days), ...Object.keys(now.days)])].sort()
  for (const d of days) {
    if (!(d in now.days)) out.push(`${dayLabel(d)} is no longer part of the program`)
    else if (!(d in sent.days)) out.push(`${dayLabel(d)} was added`)
    else if (sent.days[d] !== now.days[d]) out.push(`${dayLabel(d)} schedule changed`)
  }
  return out
}

// "10/1-10/6: Youth in the Political Process", the subject Agenda files programs under.
export function agendaSubject(project: Project): string {
  return `${fmtSlashRange(project.arrival_date, project.departure_date)}: ${project.name}`
}

export function calendarText(days: CalendarDay[]): string {
  return days.map((d) => `${dayLabel(d.day)}\n${d.lines.map((l) => `  ${l}`).join('\n')}`).join('\n\n')
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// One column per day, like the calendar grid pasted into Agenda emails.
export function calendarHtml(days: CalendarDay[]): string {
  const cell = 'border:1px solid #999;padding:6px;vertical-align:top;font-family:Calibri,Arial,sans-serif;font-size:10pt'
  const head = days
    .map((d) => {
      const date = parseDate(d.day)
      return `<th style="${cell};background:#eef1f5">${date.toLocaleDateString('en-US', { weekday: 'long' })}<br>${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</th>`
    })
    .join('')
  const body = days.map((d) => `<td style="${cell}">${d.lines.map(esc).join('<br><br>')}</td>`).join('')
  return `<table style="border-collapse:collapse"><tr>${head}</tr><tr>${body}</tr></table>`
}
