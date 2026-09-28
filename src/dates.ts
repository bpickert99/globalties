// Dates are ISO 'YYYY-MM-DD' strings in local time; times are 'HH:MM[:SS]'.

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toIso(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

export function today(): string {
  return toIso(new Date())
}

export function addDays(iso: string, days: number): string {
  const date = parseDate(iso)
  date.setDate(date.getDate() + days)
  return toIso(date)
}

export function daysBetween(fromIso: string, toIsoDate: string): number {
  return Math.round((parseDate(toIsoDate).getTime() - parseDate(fromIso).getTime()) / 86400000)
}

export function dayRange(startIso: string, endIso: string): string[] {
  const days: string[] = []
  for (let d = startIso; d <= endIso; d = addDays(d, 1)) days.push(d)
  return days
}

// Monday of the week containing iso.
export function weekStart(iso: string): string {
  const offset = (parseDate(iso).getDay() + 6) % 7
  return addDays(iso, -offset)
}

export function fmtShort(iso: string): string {
  return parseDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function fmtWeekdayShort(iso: string): string {
  return parseDate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function fmtLong(iso: string): string {
  return parseDate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function fmtMonthDay(iso: string): string {
  return parseDate(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

// "September 23-29, 2026", "July 30 - August 5, 2026", "December 28, 2026 - January 3, 2027"
export function fmtRange(startIso: string, endIso: string): string {
  const s = parseDate(startIso)
  const e = parseDate(endIso)
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'long' })
  if (s.getFullYear() !== e.getFullYear()) {
    return `${month(s)} ${s.getDate()}, ${s.getFullYear()} - ${month(e)} ${e.getDate()}, ${e.getFullYear()}`
  }
  if (s.getMonth() !== e.getMonth()) {
    return `${month(s)} ${s.getDate()} - ${month(e)} ${e.getDate()}, ${e.getFullYear()}`
  }
  return `${month(s)} ${s.getDate()}-${e.getDate()}, ${e.getFullYear()}`
}

function clock(time: string): { text: string; meridiem: 'am' | 'pm' } {
  const [h, m] = time.split(':').map(Number)
  const hour = h % 12 === 0 ? 12 : h % 12
  return { text: `${hour}:${String(m).padStart(2, '0')}`, meridiem: h < 12 ? 'am' : 'pm' }
}

// "3:22 pm", "10:00-11:30 am", "11:00 am-1:00 pm"
export function fmtTimeRange(start: string | null, end: string | null): string {
  if (!start) return ''
  const s = clock(start)
  if (!end) return `${s.text} ${s.meridiem}`
  const e = clock(end)
  if (s.meridiem === e.meridiem) return `${s.text}-${e.text} ${e.meridiem}`
  return `${s.text} ${s.meridiem}-${e.text} ${e.meridiem}`
}
