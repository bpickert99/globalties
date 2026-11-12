// What one schedule item prints on the itinerary, as plain blocks of text. The Word export
// (itinerary.ts) and the live preview in the schedule form both render these, so they match.

import { activePeople, fullName, itineraryTime } from './logic'
import { resourceOf } from './resources'
import type { Participant, Project, Resource, ResourceContact, ScheduleItem } from './types'

export type Seg = { text: string; bold?: boolean; italic?: boolean }
export type Line = Seg[]

// Each top-level block is followed by a blank line on the itinerary.
export type Block =
  | { kind: 'head'; time: string; title: string } // bold "time ⇥ title"
  | { kind: 'note'; text: string } // italic note under the day heading
  | { kind: 'field'; label: string; lines: Line[]; boldLabel?: boolean } // "Label: ⇥ first line", the rest under it at 1.5"
  | { kind: 'more'; lines: Line[] } // more lines at 1.5" (a second contact, a second restaurant)
  | { kind: 'aside'; segs: Seg[] } // italic, indented 1.5", justified
  | { kind: 'box'; blocks: Block[] } // a home hospitality group, boxed
  | { kind: 'para'; lines: Line[] } // full-width justified lines (host bios)

export const ROLE_LABELS = { interpreter: 'Interpreter', liaison: 'International Visitor Liaison', participant: '' } as const

const text = (t: string, o: Omit<Seg, 'text'> = {}): Seg => ({ text: t, ...o })
const plain = (texts: string[]): Line[] => texts.filter((t) => t.trim()).map((t) => [text(t)])
const splitLines = (t: string) =>
  t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

// One "Label:" block for the first entry and plain continuation blocks for the rest.
function listed(label: string, entries: Line[][]): Block[] {
  return entries.map((lines, i) => (i === 0 ? { kind: 'field', label, lines } : { kind: 'more', lines }))
}

// Speakers print under "Speaker:" or "Speakers:"; the point of contact under "Contact:", unless they are also
// speaking and the visit is set not to list them twice.
export function visitPeople(item: ScheduleItem, resource: Resource): { contacts: ResourceContact[]; speakers: ResourceContact[] } {
  const speakers = resource.contacts.filter((c) => item.speaker_ids.includes(c.id))
  const contacts = resource.contacts.filter((c) => item.contact_ids.includes(c.id) && (item.contact_when_speaking || !item.speaker_ids.includes(c.id)))
  return { contacts, speakers }
}

// Organization blurbs open with the organization's name in bold, e.g. "**Nonprofit Connect** is a regional ...".
function blurb(description: string, name: string): Seg[] {
  const lead = [name, `The ${name}`].find((n) => n && description.startsWith(n))
  return lead ? [text(lead, { bold: true, italic: true }), text(description.slice(lead.length), { italic: true })] : [text(description, { italic: true })]
}

function resourceBlocks(item: ScheduleItem, resource: Resource): Block[] {
  const out: Block[] = []
  const where = plain([resource.location, ...resource.address.split('\n')])
  if (where.length) out.push({ kind: 'field', label: 'Location:', lines: where })
  if (resource.directions.trim()) out.push({ kind: 'aside', segs: [text(resource.directions, { italic: true })] })
  const { contacts, speakers } = visitPeople(item, resource)
  out.push(...listed('Contact:', contacts.map((c) => plain([c.name, c.title, c.email, c.phone]))))
  if (speakers.length) out.push({ kind: 'field', label: speakers.length > 1 ? 'Speakers:' : 'Speaker:', lines: speakers.map((s) => [text([s.name, s.title].filter((x) => x.trim()).join(' – '))]) })
  return out
}

function hostGroupBlocks(item: ScheduleItem, people: Participant[]): Block[] {
  const active = activePeople(people)
  return item.hh_groups.map((g, i) => {
    const names = active
      .filter((x) => g.participant_ids.includes(x.id))
      .map((x) => `${fullName(x)} (${x.role === 'participant' ? x.country : ROLE_LABELS[x.role]})`)
    const blocks: Block[] = [
      { kind: 'field', label: `Group ${i + 1}:`, lines: (names.length ? names : ['']).map((n) => [text(n, { bold: true })]), boldLabel: true },
      { kind: 'field', label: 'Location:', lines: plain(g.address.split('\n')), boldLabel: true },
      { kind: 'field', label: 'Contact:', lines: plain([g.host, g.phone, g.email]), boldLabel: true },
    ]
    if (g.bio.trim()) blocks.push({ kind: 'para', lines: splitLines(g.bio).map((l) => [text(l, { italic: true })]) })
    return { kind: 'box', blocks }
  })
}

export function itemBlocks(item: ScheduleItem, project: Project, resources: Resource[], people: Participant[]): Block[] {
  if (item.kind === 'note') return [{ kind: 'note', text: item.title }]
  const out: Block[] = [{ kind: 'head', time: itineraryTime(item, project), title: item.title }]
  const resource = item.resource_id ? resourceOf(item, resources) : null
  if (resource) out.push(...resourceBlocks(item, resource))
  if (item.topic.trim()) out.push({ kind: 'aside', segs: [text(`Topic: ${item.topic}`, { italic: true })] })
  for (const l of splitLines(item.description)) out.push({ kind: 'aside', segs: [text(l, { italic: true })] })
  if (resource?.description.trim()) out.push({ kind: 'aside', segs: blurb(resource.description.trim(), resource.name) })
  const label = item.restaurants.length > 1 ? 'Recommendations:' : 'Recommendation:'
  out.push(...listed(label, item.restaurants.map((r) => [...plain([r.name, r.address]), ...(r.description.trim() ? [[text(r.description, { italic: true })]] : [])])))
  if (item.kind === 'home_hospitality') out.push(...hostGroupBlocks(item, people))
  return out
}
