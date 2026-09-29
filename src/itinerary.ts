// Builds an editable Word itinerary in the layout of the GTKC itineraries:
// cover + participants, contacts page, week-at-a-glance grid, day-by-day detail.

import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { dayRange, fmtLong, fmtRange, fmtTimeRange, parseDate } from './dates'
import { activePeople, fullName, sortItems } from './logic'
import { resourceOf, visitContacts } from './resources'
import type { Contact, Participant, ProgramType, Project, Resource, ScheduleItem, Settings, Staff } from './types'

export type ItineraryInput = {
  project: Project
  programType: ProgramType
  people: Participant[]
  items: ScheduleItem[]
  resources: Resource[]
  staff: Staff[]
  settings: Settings
}

const FONT = 'Calibri'
const PAGE_WIDTH = 9360 // twips of text width on Letter with 1" margins
const LABEL_WIDTH = 2400

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }
const LINE = { style: BorderStyle.SINGLE, size: 4, color: '808080' }
const GRID_BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE, insideHorizontal: LINE, insideVertical: LINE }

type RunOpts = { bold?: boolean; italics?: boolean; size?: number; underline?: boolean }

function para(text: string, o: RunOpts & { align?: 'center'; after?: number; before?: number; pageBreak?: boolean } = {}): Paragraph {
  return new Paragraph({
    children: text.split('\n').map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : undefined, font: FONT, size: o.size ?? 22, bold: o.bold, italics: o.italics, underline: o.underline ? {} : undefined })),
    alignment: o.align === 'center' ? AlignmentType.CENTER : undefined,
    spacing: { after: o.after ?? 0, before: o.before ?? 0 },
    pageBreakBefore: o.pageBreak,
  })
}

function lines(texts: string[], o: RunOpts = {}): Paragraph[] {
  return texts.filter((t) => t.trim()).map((t) => para(t, o))
}

function cell(children: Paragraph[], width: number): TableCell {
  return new TableCell({ children: children.length ? children : [para('')], width: { size: width, type: WidthType.DXA } })
}

// Borderless two-column "Label:   value" block, as used throughout the itineraries.
function labelled(rows: [string, Paragraph[]][], labelWidth = LABEL_WIDTH): Table {
  return new Table({
    width: { size: PAGE_WIDTH, type: WidthType.DXA },
    columnWidths: [labelWidth, PAGE_WIDTH - labelWidth],
    borders: NO_BORDERS,
    rows: rows.map(
      ([label, content]) =>
        new TableRow({ children: [cell([para(label)], labelWidth), cell([...content, para('', { size: 12 })], PAGE_WIDTH - labelWidth)] }),
    ),
  })
}

function coverPage({ project, programType, people }: ItineraryInput): (Paragraph | Table)[] {
  const active = activePeople(people)
  const participants = active.filter((p) => p.role === 'participant')
  const escorts = active.filter((p) => p.role !== 'participant')
  const multiCountry = new Set(participants.map((p) => p.country)).size > 1
  const out: (Paragraph | Table)[] = [
    para(project.name, { bold: true, size: 36, align: 'center', before: 1200 }),
    para(project.subtitle, { size: 26, align: 'center', before: 120 }),
    para(fmtRange(project.arrival_date, project.departure_date), { size: 26, align: 'center', before: 240, after: 480 }),
    para(programType.itinerary_intro, { after: 360 }),
  ]
  const participantRows = participants.map((p, i): [string, Paragraph[]] => [
    i === 0 ? 'Participants:' : '',
    [para(multiCountry && p.country ? `${fullName(p)} (${p.country})` : fullName(p), { bold: true }), ...lines([p.position])],
  ])
  const escortRows = escorts.map((p, i): [string, Paragraph[]] => [
    i === 0 ? 'Accompanied By:' : '',
    [para([fullName(p), p.position].filter(Boolean).join(', '))],
  ])
  if (participantRows.length + escortRows.length) out.push(labelled([...participantRows, ...escortRows]))
  return out
}

function contactsPage({ project, staff, settings }: ItineraryInput): Paragraph[] {
  const out: Paragraph[] = [para('Local Program by Global Ties KC', { bold: true, pageBreak: true }), ...lines(settings.office_address.split('\n')), para('')]
  for (const s of staff) {
    out.push(
      para(`${s.name}, ${s.title}`, { bold: true }),
      ...lines([s.office_phone && `${s.office_phone} (Office)`, s.mobile_phone && `${s.emergency_contact ? 'Emergency Contact: ' : ''}${s.mobile_phone} (Mobile)`, s.email]),
      para(''),
    )
  }
  const npaTeam = [project.npa_manager, project.npa_associate].filter((c) => c.name.trim())
  if (project.npa_org || npaTeam.length) {
    out.push(para(`Administered by ${project.npa_org}`, { bold: true }))
    out.push(...lines(npaTeam.map((c) => [c.name, c.phone, c.email].filter(Boolean).join(', '))), para(''))
  }
  if (project.oiv_contacts.length) {
    out.push(
      para('Sponsored and Administered by the Office of International Visitors and U.S. Speaker Program, Bureau of Educational and Cultural Affairs, U.S. Department of State', { bold: true }),
      ...lines(project.oiv_contacts.map((c) => [c.name, c.phone, c.email].filter(Boolean).join(', '))),
      para(''),
    )
  }
  if (project.hotel_name) {
    out.push(para('Local Hotel:', { bold: true }), ...lines([project.hotel_name, project.hotel_address, project.hotel_phone && `Telephone: ${project.hotel_phone}`]), para(''))
  }
  if (settings.transport_block) {
    out.push(para('Local Transportation:', { bold: true }), ...lines(settings.transport_block.split('\n')), para(''))
  }
  if (project.driver_name) {
    out.push(para('Driver:', { bold: true }), ...lines([project.driver_name, project.driver_phone]), para(''))
  }
  return out
}

function gridSummary(item: ScheduleItem): string[] {
  return [fmtTimeRange(item.start_time, item.end_time), item.title].filter(Boolean)
}

// Week-at-a-glance: one row of up to 7 day columns per week of the program.
function gridPage({ project, items }: ItineraryInput): (Paragraph | Table)[] {
  const days = dayRange(project.arrival_date, project.departure_date)
  const sorted = sortItems(items)
  const out: (Paragraph | Table)[] = [para(fmtRange(project.arrival_date, project.departure_date), { bold: true, align: 'center', pageBreak: true, after: 240 })]
  for (let w = 0; w < days.length; w += 7) {
    const week = days.slice(w, w + 7)
    const colWidth = Math.floor(PAGE_WIDTH / week.length)
    const head = new TableRow({
      tableHeader: true,
      children: week.map((d) => {
        const date = parseDate(d)
        return cell([para(date.toLocaleDateString('en-US', { weekday: 'long' }), { bold: true, size: 15, align: 'center' }), para(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), { bold: true, size: 15, align: 'center' })], colWidth)
      }),
    })
    const body = new TableRow({
      children: week.map((d) =>
        cell(
          sorted.filter((i) => i.day === d).flatMap((i) => [...gridSummary(i).map((t) => para(t, { size: 16 })), para('', { size: 10 })]),
          colWidth,
        ),
      ),
    })
    out.push(new Table({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: week.map(() => colWidth), borders: GRID_BORDERS, rows: [head, body] }), para(''))
  }
  return out
}

function contactParagraphs(contacts: Contact[]): Paragraph[] {
  return contacts.flatMap((c) => [...lines([c.name, c.title, c.email, c.phone]), para('', { size: 12 })])
}

// Where / who / what for a visit to a resource.
function resourceRows(item: ScheduleItem, resource: Resource): [string, Paragraph[]][] {
  const rows: [string, Paragraph[]][] = []
  const where = [resource.location, resource.address].filter(Boolean).join('\n')
  if (where) rows.push(['Location:', [para(where), ...(resource.directions ? [para(''), para(resource.directions)] : [])]])
  else if (resource.directions) rows.push(['', [para(resource.directions)]])
  const contacts = visitContacts(item, resource)
  if (contacts.length) rows.push(['Contact:', contactParagraphs(contacts)])
  if (item.topic) rows.push(['Topic:', [para(item.topic)]])
  if (resource.description) rows.push(['', [para(resource.description)]])
  return rows
}

function itemBlock(item: ScheduleItem, input: ItineraryInput): (Paragraph | Table)[] {
  if (item.kind === 'note') return [para(item.title, { italics: true, after: 160 })]
  const time = fmtTimeRange(item.start_time, item.end_time)
  const rows: [string, Paragraph[]][] = [[time, [para(item.title, { bold: true })]]]
  if (item.resource_id) rows.push(...resourceRows(item, resourceOf(item, input.resources)))
  else if (item.description) rows.push(['', [para(item.description)]])
  item.restaurants.forEach((r, i) => rows.push([i === 0 ? 'Recommendation:' : '', lines([r.name, r.address, r.description])]))
  if (item.kind === 'home_hospitality') {
    const people = activePeople(input.people)
    item.hh_groups.forEach((g, i) => {
      const names = people
        .filter((p) => g.participant_ids.includes(p.id))
        .map((p) => (p.role === 'participant' ? fullName(p) : `${fullName(p)} (${p.role === 'interpreter' ? 'Interpreter' : 'Liaison'})`))
      rows.push([`Group ${i + 1}:`, lines(names)])
      rows.push(['Location:', lines([g.address])])
      rows.push(['Contact:', lines([g.host, [g.phone, g.email].filter(Boolean).join('; ')])])
      if (g.bio) rows.push(['', [para(g.bio)]])
    })
  }
  return [labelled(rows)]
}

function hotelWelcome(project: Project): (Paragraph | Table)[] {
  if (!project.hotel_name) return []
  return [
    labelled([['Hotel:', lines([project.hotel_name, project.hotel_address])]]),
    para('Welcome to Kansas City!', { bold: true, before: 120, after: 120 }),
    ...(project.hotel_blurb ? [para(project.hotel_blurb, { after: 200 })] : []),
  ]
}

function detailPages(input: ItineraryInput): (Paragraph | Table)[] {
  const { project } = input
  const sorted = sortItems(input.items)
  const out: (Paragraph | Table)[] = []
  const days = dayRange(project.arrival_date, project.departure_date)
  days.forEach((day, n) => {
    const dayItems = sorted.filter((i) => i.day === day)
    out.push(para(fmtLong(day), { bold: true, underline: true, size: 24, pageBreak: n === 0, before: n === 0 ? 0 : 240, after: 160 }))
    const lastMeeting = dayItems.map((i) => i.kind).lastIndexOf('meeting')
    const firstFlight = day === project.arrival_date ? dayItems.findIndex((i) => i.kind === 'flight') : -2
    if (firstFlight === -1) out.push(...hotelWelcome(project))
    dayItems.forEach((item, i) => {
      out.push(...itemBlock(item, input))
      if (i === firstFlight) out.push(...hotelWelcome(project))
      if (i === lastMeeting) out.push(para('**Your professional meetings are concluded for the day**', { bold: true, align: 'center', before: 120, after: 200 }))
    })
  })
  out.push(para('We hope you enjoyed your time in the Heartland of America!', { bold: true, align: 'center', before: 360 }))
  return out
}

export function itineraryFileName(project: Project): string {
  const safe = (s: string) => s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')
  // GTKC convention: YY.M of arrival, then countries and name, e.g. 26.9_China_American_Philanthropy_Itinerary.docx
  const arrival = parseDate(project.arrival_date)
  const yearMonth = `${String(arrival.getFullYear()).slice(2)}.${arrival.getMonth() + 1}`
  return `${[yearMonth, safe(project.countries), safe(project.name), 'Itinerary'].filter(Boolean).join('_')}.docx`
}

export function buildItinerary(input: ItineraryInput): Document {
  return new Document({
    creator: 'Global Ties KC',
    title: `${input.project.name} Itinerary`,
    sections: [
      {
        properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 })] })] }) },
        children: [...coverPage(input), ...contactsPage(input), ...gridPage(input), ...detailPages(input)],
      },
    ],
  })
}

export async function downloadItinerary(input: ItineraryInput): Promise<void> {
  const blob = await Packer.toBlob(buildItinerary(input))
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = itineraryFileName(input.project)
  a.click()
  URL.revokeObjectURL(url)
}
