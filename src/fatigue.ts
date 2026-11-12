// Meeting fatigue: has Global Ties met this organization, or this person, recently?
// Counts meetings and activities in any project within the window (before or after the
// visit being planned), except ones that were declined.

import { daysBetween } from './dates'

export type Visit = {
  id: string
  project_id: string
  resource_id: string
  day: string
  title: string
  status: string | null
  contact_ids: string[]
  speaker_ids: string[]
}

// Everyone the group meets at a visit: the point of contact and the speakers.
const met = (v: { contact_ids: string[]; speaker_ids: string[] }) => [...v.contact_ids, ...v.speaker_ids]

export type RecentMeeting = { visit: Visit; days: number; sharedContacts: string[] }

export function recentMeetings(
  target: { id?: string; resource_id: string | null; contact_ids: string[]; speaker_ids: string[]; day: string },
  visits: Visit[],
  windowDays: number,
): RecentMeeting[] {
  if (!target.resource_id) return []
  return visits
    .filter((v) => v.id !== target.id && v.status !== 'declined')
    .map((v) => ({ visit: v, days: daysBetween(v.day, target.day), sharedContacts: met(v).filter((c) => met(target).includes(c)) }))
    .filter((m) => Math.abs(m.days) <= windowDays && (m.visit.resource_id === target.resource_id || m.sharedContacts.length > 0))
    .sort((a, b) => Math.abs(a.days) - Math.abs(b.days))
}

// "12 days before", "3 days after", "the same day"
export function relative(days: number): string {
  if (days === 0) return 'the same day'
  const n = Math.abs(days)
  return `${n} day${n === 1 ? '' : 's'} ${days > 0 ? 'before' : 'after'}`
}
