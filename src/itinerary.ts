// Builds the editable Word itinerary in the GTKC layout, taken from the office's own
// itineraries (e.g. 26.9 China American Philanthropy, 26.11 Quad Ports):
// cover with logo and participants, contacts page, program-at-a-glance grid, then day by day.
// Times New Roman 12 pt throughout; labels at the margin, values on a 1.5" tab.

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Tab,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  TextWrappingType,
  UnderlineType,
  VerticalPositionRelativeFrom,
  WidthType,
} from 'docx'
import logoUrl from './assets/gtkc-logo.png?inline'
import { dayRange, fmtLong, fmtRange, parseDate } from './dates'
import { activePeople, fullName, itineraryTime, sortItems } from './logic'
import { type Block, itemBlocks, ROLE_LABELS, type Seg } from './itineraryItem'
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

const FONT = 'Times New Roman'
const VALUE_TAB = 2160 // 1.5": where values sit after "Location:", times, etc.
const NAME_TAB = 2880 // 2": participant names on the cover
const GRID_WIDTH = 10705 // the at-a-glance table runs a little into the side margins
const RULE = { style: BorderStyle.SINGLE, size: 4, color: 'auto', space: 1 }
const BOX = { style: BorderStyle.SINGLE, size: 4, color: 'auto' }
const BOX_BORDERS = { top: BOX, bottom: BOX, left: BOX, right: BOX }

type RunOpts = {
  bold?: boolean
  italics?: boolean
  underline?: boolean
  size?: number
}
type Run = TextRun

function run(text: string, o: RunOpts = {}): Run {
  return new TextRun({
    text,
    bold: o.bold,
    italics: o.italics,
    size: o.size,
    underline: o.underline ? { type: UnderlineType.SINGLE } : undefined,
  })
}

function tab(o: RunOpts = {}): Run {
  return new TextRun({ children: [new Tab()], bold: o.bold, size: o.size })
}

type ParaOpts = {
  align?: 'center' | 'both'
  left?: number
  hanging?: number
  tabAt?: number
  rule?: boolean
  pageBreak?: boolean
}

function p(runs: Run[] = [], o: ParaOpts = {}): Paragraph {
  return new Paragraph({
    children: runs,
    alignment: o.align === 'center' ? AlignmentType.CENTER : o.align === 'both' ? AlignmentType.JUSTIFIED : undefined,
    indent: o.left !== undefined ? { left: o.left, hanging: o.hanging } : undefined,
    tabStops: o.tabAt !== undefined ? [{ type: TabStopType.LEFT, position: o.tabAt }] : undefined,
    border: o.rule ? { bottom: RULE } : undefined,
    pageBreakBefore: o.pageBreak,
  })
}

const blank = (o: ParaOpts = {}) => p([], o)
const centered = (text: string, o: RunOpts = {}) => p([run(text, o)], { align: 'center' })
const splitLines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

// "Label:<tab>first line" then the remaining lines lined up under the first, at 1.5".
function labelled(label: string, lines: Run[][], labelOpts: RunOpts = {}): Paragraph[] {
  return lines.map((runs, i) =>
    i === 0
      ? p([run(label, labelOpts), tab(), ...runs], {
          left: VALUE_TAB,
          hanging: VALUE_TAB,
          tabAt: VALUE_TAB,
        })
      : p(runs, { left: VALUE_TAB }),
  )
}

const plain = (texts: string[]): Run[][] => texts.filter((t) => t.trim()).map((t) => [run(t)])

// Italic paragraph indented to the value column, as used for topics, directions and blurbs.
function indentedItalic(runs: Run[]): Paragraph {
  return p(runs, { left: VALUE_TAB, align: 'both' })
}

// ---- Cover -----------------------------------------------------------------

function logo(data: ArrayBuffer): Paragraph {
  return new Paragraph({
    children: [
      new ImageRun({
        type: 'png',
        data,
        transformation: { width: 215, height: 41 },
        floating: {
          horizontalPosition: {
            relative: HorizontalPositionRelativeFrom.MARGIN,
            align: HorizontalPositionAlign.CENTER,
          },
          verticalPosition: {
            relative: VerticalPositionRelativeFrom.PARAGRAPH,
            offset: -276225,
          },
          wrap: { type: TextWrappingType.NONE },
        },
      }),
    ],
  })
}


function coverPage({ project, programType, people }: ItineraryInput, logoData: ArrayBuffer): Paragraph[] {
  const active = activePeople(people)
  const participants = active.filter((x) => x.role === 'participant')
  const escorts = active.filter((x) => x.role !== 'participant')
  const multiCountry = new Set(participants.map((x) => x.country)).size > 1
  // Large groups are set in 9 pt so the roster stays on the cover, as in the WHA and EUR itineraries.
  const size = participants.length > 12 ? 18 : undefined
  const twoCol = { left: NAME_TAB, hanging: NAME_TAB, tabAt: NAME_TAB }

  const out: Paragraph[] = [
    logo(logoData),
    blank(),
    centered(project.name, { bold: true, size: 28 }),
    ...(project.subtitle ? [centered(project.subtitle, { bold: true })] : []),
    blank(),
    centered(fmtRange(project.arrival_date, project.departure_date).replace(' - ', '-'), { italics: true }),
    blank(),
    centered(programType.itinerary_intro, { italics: true, size: 22 }),
    blank(),
  ]
  if (participants.length) {
    out.push(p([run('Participants:', { bold: true, underline: true, size })]), blank())
    participants.forEach((x, i) => {
      const country = multiCountry || i === 0 ? x.country : ''
      out.push(p([run(country, { bold: true, size }), tab({ size }), run(fullName(x), { bold: true, size })], twoCol))
      for (const line of splitLines(x.position)) out.push(p([run(line, { size })], { left: NAME_TAB }))
      out.push(blank())
    })
  }
  escorts.forEach((x, i) => {
    const role = x.position.trim() || ROLE_LABELS[x.role]
    const who = [run(fullName(x), { bold: true, size }), ...(role ? [run(`, ${role}`, { size })] : [])]
    out.push(i === 0 ? p([run('Accompanied By:', { bold: true, underline: true, size }), tab({ size }), ...who], twoCol) : p(who, { left: NAME_TAB }))
  })
  return out
}

// ---- Contacts page -----------------------------------------------------------

const contactLine = (c: Contact) => [c.name, c.phone, c.email].filter((s) => s.trim()).join(', ')

// Contacts page block for groups staying with host families: each family and its guests.
function hostFamiliesBlock({ project, people }: ItineraryInput): Paragraph[] {
  const active = activePeople(people)
  return [
    centered('Host Families:', { bold: true }),
    ...project.host_families.flatMap((f) => {
      const guests = active.filter((x) => f.participant_ids.includes(x.id)).map(fullName)
      return [
        centered(f.host, { bold: true }),
        ...splitLines(f.address).map((l) => centered(l)),
        ...[f.phone, f.email].filter((x) => x.trim()).map((l) => centered(l)),
        ...(guests.length ? [centered(`Guests: ${guests.join(', ')}`, { italics: true })] : []),
        blank(),
      ]
    }),
  ]
}

function contactsPage(input: ItineraryInput): Paragraph[] {
  const { project, staff, settings } = input
  const out: Paragraph[] = [
    p([run('Local Program by Global Ties KC', { bold: true })], {
      align: 'center',
      pageBreak: true,
    }),
    ...splitLines(settings.office_address).map((l) => centered(l)),
  ]
  for (const s of staff.filter((x) => x.name.trim())) {
    out.push(
      blank(),
      centered([s.name, s.title].filter(Boolean).join(', '), { bold: true }),
      ...[
        s.office_phone && `${s.office_phone} (Office)`,
        s.mobile_phone && `${s.emergency_contact ? 'Emergency Contact: ' : ''}${s.mobile_phone} (Mobile)`,
        s.email,
      ]
        .filter(Boolean)
        .map((l) => centered(l)),
    )
  }
  out.push(blank({ rule: true }), blank())

  const npaTeam = [project.npa_manager, project.npa_associate].filter((c) => c.name.trim())
  if (project.npa_org.trim()) {
    out.push(centered(`Administered by ${project.npa_org}`, { bold: true }), ...npaTeam.map((c) => centered(contactLine(c))))
  }
  if (project.oiv_contacts.length) {
    if (project.npa_org.trim()) out.push(blank())
    out.push(
      centered(`Sponsored and Administered by the ${project.sponsor_office}`, {
        bold: true,
      }),
      centered('Bureau of Educational and Cultural Affairs, U.S. Department of State', { bold: true }),
      ...project.oiv_contacts.map((c) => centered(contactLine(c))),
    )
  }
  if (project.npa_org.trim() || project.oiv_contacts.length) out.push(blank({ rule: true }), blank())

  if (project.lodging === 'host_families') out.push(...hostFamiliesBlock(input))
  if (project.lodging === 'hotel' && project.hotel_name) {
    out.push(
      centered('Local Hotel:', { bold: true }),
      centered(project.hotel_name),
      ...splitLines(project.hotel_address).map((l) => centered(l)),
      ...(project.hotel_phone ? [centered(`Phone: ${project.hotel_phone}`)] : []),
      blank(),
    )
  }
  if (settings.transport_block.trim()) {
    out.push(centered('Local Transportation:', { bold: true }), ...splitLines(settings.transport_block).map((l) => centered(l)), blank())
  }
  for (const d of project.drivers.filter((x) => x.name.trim())) {
    out.push(centered(`${d.role.trim() || 'Driver'}:`, { bold: true }), centered(d.name), ...(d.phone ? [centered(d.phone)] : []), blank())
  }
  return out
}

// ---- Program at a glance -----------------------------------------------------

const GRID_SIZE = 18 // 9 pt

function gridCell(dayItems: ScheduleItem[], project: Project): Paragraph[] {
  const out: Paragraph[] = []
  for (const item of dayItems) {
    if (item.kind === 'note')
      out.push(
        p([run(item.title, { italics: true, size: GRID_SIZE })], {
          align: 'center',
        }),
        blank({ align: 'center' }),
      )
  }
  for (const item of dayItems.filter((i) => i.kind !== 'note')) {
    const time = itineraryTime(item, project)
    if (time) out.push(p([run(time, { size: GRID_SIZE })], { align: 'center' }))
    out.push(
      p([run(item.title, { bold: true, size: GRID_SIZE })], {
        align: 'center',
      }),
      blank({ align: 'center' }),
    )
  }
  return out.length ? out : [blank()]
}

function gridPage({ project, items }: ItineraryInput): (Paragraph | Table)[] {
  const days = dayRange(project.arrival_date, project.departure_date)
  const sorted = sortItems(items)
  const colWidth = Math.floor(GRID_WIDTH / days.length)
  const head = new TableRow({
    tableHeader: true,
    children: days.map((d) => {
      const date = parseDate(d)
      return new TableCell({
        width: { size: colWidth, type: WidthType.DXA },
        children: [
          p(
            [
              run(date.toLocaleDateString('en-US', { weekday: 'long' }), {
                size: GRID_SIZE,
              }),
            ],
            { align: 'center' },
          ),
          p(
            [
              run(
                date.toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                }),
                { size: GRID_SIZE },
              ),
            ],
            { align: 'center' },
          ),
        ],
      })
    }),
  })
  const body = new TableRow({
    children: days.map(
      (d) =>
        new TableCell({
          width: { size: colWidth, type: WidthType.DXA },
          children: gridCell(sorted.filter((i) => i.day === d), project),
        }),
    ),
  })
  return [
    blank({ align: 'center', pageBreak: true }),
    blank({ align: 'center' }),
    centered(fmtRange(project.arrival_date, project.departure_date).replace(' - ', '-'), { bold: true, size: 44 }),
    blank({ align: 'center' }),
    blank({ align: 'center' }),
    new Table({
      width: { size: colWidth * days.length, type: WidthType.DXA },
      columnWidths: days.map(() => colWidth),
      layout: TableLayoutType.FIXED,
      alignment: AlignmentType.CENTER,
      borders: { ...BOX_BORDERS, insideHorizontal: BOX, insideVertical: BOX },
      rows: [head, body],
    }),
  ]
}

// ---- Day by day --------------------------------------------------------------

const segRuns = (segs: Seg[]): Run[] => segs.map((s) => run(s.text, { bold: s.bold, italics: s.italic }))

// Word paragraphs for one block of an item (see itineraryItem.ts, shared with the preview).
function renderBlock(b: Block): (Paragraph | Table)[] {
  switch (b.kind) {
    case 'head':
      return [p([run(b.time, { bold: true }), tab({ bold: true }), run(b.title, { bold: true })], { left: VALUE_TAB, hanging: VALUE_TAB, tabAt: VALUE_TAB })]
    case 'note':
      return [p([run(b.text, { italics: true })])]
    case 'field':
      return labelled(b.label, b.lines.map(segRuns), b.boldLabel ? { bold: true } : {})
    case 'more':
      return b.lines.map((l) => p(segRuns(l), { left: VALUE_TAB }))
    case 'aside':
      return [indentedItalic(segRuns(b.segs))]
    case 'para':
      return b.lines.map((l) => p(segRuns(l), { align: 'both' }))
    case 'box':
      return [
        new Table({
          width: { size: 9350, type: WidthType.DXA },
          columnWidths: [9350],
          borders: BOX_BORDERS,
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 9350, type: WidthType.DXA },
                  children: b.blocks.flatMap((x, i) => [...(renderBlock(x) as Paragraph[]), ...(i < b.blocks.length - 1 ? [blank()] : [])]),
                }),
              ],
            }),
          ],
        }),
      ]
  }
}

function itemBlock(item: ScheduleItem, input: ItineraryInput): (Paragraph | Table)[] {
  return itemBlocks(item, input.project, input.resources, input.people).flatMap((b) => [...renderBlock(b), blank()])
}

function hotelWelcome(project: Project): Paragraph[] {
  if (project.lodging !== 'hotel' || !project.hotel_name) return []
  return [
    ...labelled('Hotel:', plain([project.hotel_name, ...project.hotel_address.split('\n'), project.hotel_phone && `Phone: ${project.hotel_phone}`])),
    blank(),
    centered('Welcome to Kansas City!', {
      bold: true,
      italics: true,
      size: 32,
    }),
    blank(),
    ...project.hotel_blurb
      .split(/\n\s*\n/)
      .map((x) => x.trim())
      .filter(Boolean)
      .flatMap((x) => [p([run(x)], { align: 'both' }), blank()]),
  ]
}

function detailPages(input: ItineraryInput): (Paragraph | Table)[] {
  const { project } = input
  const sorted = sortItems(input.items)
  const out: (Paragraph | Table)[] = []
  dayRange(project.arrival_date, project.departure_date).forEach((day, n) => {
    const dayItems = sorted.filter((i) => i.day === day)
    // Two lines down the page before the first day, one blank line between days.
    out.push(...(n === 0 ? [blank({ pageBreak: true }), blank()] : [blank()]))
    out.push(p([run(fmtLong(day), { bold: true })], { rule: true }), blank())
    const lastMeeting = dayItems.map((i) => i.kind).lastIndexOf('meeting')
    const firstFlight = n === 0 ? dayItems.findIndex((i) => i.kind === 'flight') : -2
    if (firstFlight === -1) out.push(...hotelWelcome(project))
    dayItems.forEach((item, i) => {
      out.push(...itemBlock(item, input))
      if (i === firstFlight) out.push(...hotelWelcome(project))
      if (i === lastMeeting)
        out.push(
          p(
            [
              run('**Your professional meetings are concluded for the day**', {
                bold: true,
                italics: true,
              }),
            ],
            { left: VALUE_TAB },
          ),
          blank(),
        )
    })
  })
  out.push(
    blank(),
    centered('We hope you enjoyed your time in the Heartland of America!', {
      bold: true,
      italics: true,
      size: 32,
    }),
  )
  return out
}

export function itineraryFileName(project: Project): string {
  const safe = (s: string) => s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')
  // GTKC convention: YY.M of arrival, then countries and name, e.g. 26.9_China_American_Philanthropy_Itinerary.docx
  const arrival = parseDate(project.arrival_date)
  const yearMonth = `${String(arrival.getFullYear()).slice(2)}.${arrival.getMonth() + 1}`
  return `${[yearMonth, safe(project.countries), safe(project.name), 'Itinerary'].filter(Boolean).join('_')}.docx`
}

export function buildItinerary(input: ItineraryInput, logoData: ArrayBuffer): Document {
  return new Document({
    creator: 'Global Ties KC',
    title: `${input.project.name} Itinerary`,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 24 },
          paragraph: { spacing: { after: 0, line: 240 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1440,
              right: 1440,
              header: 1080,
              footer: 720,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: 'Calibri',
                    size: 22,
                  }),
                ],
              }),
            ],
          }),
        },
        children: [...coverPage(input, logoData), ...contactsPage(input), ...gridPage(input), ...detailPages(input)],
      },
    ],
  })
}

export async function downloadItinerary(input: ItineraryInput): Promise<void> {
  const res = await fetch(logoUrl)
  if (!res.ok) throw new Error(`Could not load the GTKC logo (${res.status})`)
  const blob = await Packer.toBlob(buildItinerary(input, await res.arrayBuffer()))
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = itineraryFileName(input.project)
  a.click()
  URL.revokeObjectURL(url)
}
