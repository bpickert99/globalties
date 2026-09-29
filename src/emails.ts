// Email drafts from the IVLP Programmer Guide templates, filled from project data.
// Anything the data can't supply is left as a [bracketed] placeholder to edit.

import { fmtLong, fmtRange, fmtSlashRange, fmtTimeRange } from './dates'
import { activePeople, fullName, sortItems } from './logic'
import { resourceOf, visitContacts } from './resources'
import { arrivalFlightTime, cancelledSinceSent, hotelSnapshot } from './hotel'
import { agendaSubject, calendar, calendarText, passengers } from './transport'
import type { Contact, EmailKey, HostGroup, Participant, ProgramType, Project, Resource, ScheduleItem, Settings } from './types'

export type Draft = { to: string; cc: string; subject: string; body: string }

export type EmailContext = {
  project: Project
  people: Participant[]
  items: ScheduleItem[]
  resources: Resource[]
  programType: ProgramType
  settings: Settings
}

// One draft target: most emails are per project, host emails per group, thanks per meeting.
export type DraftTarget = { key: EmailKey; label: string; build: () => Draft }

export const EMAIL_LABELS: Record<EmailKey, string> = {
  hotel_request: 'Hotel: request rooms',
  hotel_npa_connect: 'Hotel: connect hotel and NPA',
  hotel_final: 'Hotel: final details before arrival',
  transport_request: 'Agenda USA: book transportation',
  transport_calendar: 'Agenda USA: calendar & driver',
  hh_host_details: 'Home hospitality host details',
  partner_thanks: 'Meeting partner thank-you',
  hh_thanks: 'Home hospitality host thank-you',
}

const ROLE_NAMES = { participant: 'Participant', interpreter: 'Interpreter', liaison: 'Liaison' } as const
const or = (value: string, placeholder: string) => value.trim() || `[${placeholder}]`
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? ''
const emails = (contacts: Contact[]) => contacts.map((c) => c.email).filter(Boolean)
const join = (list: string[]) => list.filter(Boolean).join('; ')

// Billing block laid out on separate lines, as Agenda receives it.
function billingBlock(project: Project): string {
  const c = project.billing_contact === 'manager' ? project.npa_manager : project.npa_associate
  if (!c.name.trim()) return '[Billing contact: name, position, organization, address, phone, email]'
  return [c.name, c.title, project.npa_org, project.npa_address, c.phone, c.email].filter(Boolean).join('\n')
}

// "IVLP WHA Youth in the Political Process": program type, countries/region, name.
function programLabel({ project, programType }: EmailContext): string {
  return [programType.name.split(' (')[0], project.countries, project.name].filter(Boolean).join(' ')
}

// Every active person gets a room.
const rooms = (people: Participant[]) => activePeople(people).length

function luggage(project: Project): string {
  return project.luggage_count === null ? '[approx. number of bags]' : `Approx. ${project.luggage_count} bags`
}

function dates(project: Project): string {
  return fmtRange(project.arrival_date, project.departure_date)
}

// "10/1-10/6: IVLP WHA Youth in the Political Process": one thread per program.
function programSubject(ctx: EmailContext): string {
  return `${fmtSlashRange(ctx.project.arrival_date, ctx.project.departure_date)}: ${programLabel(ctx)}`
}

// Step 1: availability. Numbers are often provisional this early.
function hotelRequest(ctx: EmailContext): Draft {
  const { project, people } = ctx
  return {
    to: project.hotel_contact_email,
    cc: ctx.settings.cc_email,
    subject: programSubject(ctx),
    body: `Hi ${or(firstName(project.hotel_contact_name), 'name')},

Hope you are doing well! Details about an upcoming program below. We are working with ${or(project.npa_org, 'NPA')} for this one. Let me know if you have availability and then I can connect you to our contacts there to figure out contract signatures and such.

${programLabel(ctx)}
${dates(project)}
Rooms: ${rooms(people) || '[XX]'}

Billing Contact:
${billingBlock(project)}

Thank you!`,
  }
}

// Step 2: "KC Hotel Connect": hand billing to the NPA and ask for confirmation numbers.
function hotelNpaConnect(ctx: EmailContext): Draft {
  const { project, people, settings } = ctx
  const npa = [project.npa_manager, project.npa_associate].filter((c) => c.name.trim())
  const npaNames = npa.map((c) => c.name).join(' and ') || '[NPA contacts]'
  return {
    to: join([project.hotel_contact_email, ...emails(npa)]),
    cc: settings.cc_email,
    subject: `KC Hotel Connect: ${programSubject(ctx)}`,
    body: `Good morning all –

${or(firstName(project.hotel_contact_name), 'name')}, thank you for confirming availability for ${rooms(people) || '[XX]'} rooms at ${or(project.hotel_name, 'hotel')} for the ${programLabel(ctx)}${project.hotel_rate ? ` at the GSA rate of ${project.hotel_rate}` : ''}! Cc'd you will find ${npaNames}, our partners at ${or(project.npa_org, 'NPA')} responsible for billing for this group.

${npaNames}, can you confirm who will be signing the room block contract?

${or(firstName(project.hotel_contact_name), 'name')}, rooming list attached. Once you have the contract on file, could you enter these within your system and send us the confirmation numbers?

Feel free to connect on next steps for billing. Please keep my colleague ${or(settings.cc_name, 'colleague')} and I on the cc so we can be on the same page and support as needed. Thank you all!`,
  }
}

// Step 3: final email before arrival: cancellations by name, arrival, pre-keyed rooms, checkout.
function hotelFinal(ctx: EmailContext): Draft {
  const { project, people, items, settings } = ctx
  const now = hotelSnapshot(project, people)
  const cancelled = cancelledSinceSent(project.hotel_sent, now)
  const landing = arrivalFlightTime(project, items)
  const eta = project.hotel_eta ? fmtTimeRange(project.hotel_eta, null) : '[TIME]'
  const cancelText = cancelled.length
    ? `\nWe had ${cancelled.length === 1 ? 'a participant' : `${cancelled.length} participants`} cancel and will only be needing ${now.rooms} rooms. Apologies for not noting this earlier. Could you cancel:\n\n${cancelled.map((n, i) => `${i + 1}. ${n}`).join('\n')}\n`
    : ''
  return {
    to: project.hotel_contact_email,
    cc: settings.cc_email,
    subject: `KC Hotel Connect: ${programSubject(ctx)}`,
    body: `Hi ${or(firstName(project.hotel_contact_name), 'name')},

We are looking forward to welcoming this group on ${fmtLong(project.arrival_date)} to Kansas City.
${cancelText}
The group will be landing at ${landing ?? '[flight time]'} on ${fmtLong(project.arrival_date)} and we expect them at the hotel by ${eta}. Could you make sure their rooms are pre-keyed and ready? [I will be at the hotel to welcome them to KC.]

They will be checking out by ${fmtTimeRange(project.hotel_checkout, null)} on ${fmtLong(project.departure_date)}.

Let me know if you have any questions. Thanks!`,
  }
}

// Step 1: get the program on Agenda's calendar.
function transportRequest(ctx: EmailContext): Draft {
  const { project, people, settings } = ctx
  return {
    to: settings.transport_email,
    cc: settings.cc_email,
    subject: agendaSubject(project),
    body: `Hi ${or(settings.transport_contact_name, 'name')},

Hope you are doing well! I wanted to get the program below on your calendar:

${programLabel(ctx)}
${dates(project)}
Passengers: ${passengers(people) || '[XX]'}. ${luggage(project)}.

Billing Contact:
${billingBlock(project)}

Let me know if you have availability and once it is added within your system. Thank you!`,
  }
}

// Step 2: the day-by-day calendar and the driver question. Resend whenever it changes.
function transportCalendar(ctx: EmailContext): Draft {
  const { project, people, items, settings } = ctx
  return {
    to: settings.transport_email,
    cc: settings.cc_email,
    subject: agendaSubject(project),
    body: `Hi ${or(settings.transport_contact_name, 'name')},

Below are the details for the ${programLabel(ctx)} in Kansas City from ${dates(project)}.${project.luggage_count === null ? '' : ` We will need plenty of space for their luggage. They are coming with approximately ${project.luggage_count} suitcases.`}

Could you let me know the driver for this program?

Passengers: ${passengers(people) || '[XX]'}
Hotel: ${or(project.hotel_name, 'hotel')}
Overarching Calendar:

${calendarText(calendar(project, items))}

Let me know if you have any questions.`,
  }
}

function groupPeople(group: HostGroup, people: Participant[]): Participant[] {
  return activePeople(people).filter((p) => group.participant_ids.includes(p.id))
}

// The rideshare departure is the last transport item on that day before the dinner.
function hotelDeparture(item: ScheduleItem, items: ScheduleItem[]): string {
  const before = sortItems(items).filter(
    (i) => i.day === item.day && i.kind === 'transport' && i.start_time && item.start_time && i.start_time < item.start_time,
  )
  const last = before[before.length - 1]
  return last ? fmtTimeRange(last.start_time, null) : '[TIME]'
}

function hhHostDetails(ctx: EmailContext, item: ScheduleItem, group: HostGroup): Draft {
  const { project, people, items } = ctx
  const liaison = activePeople(people).find((p) => p.role === 'liaison')
  const visitors = groupPeople(group, people)
    .map((p) => `• ${fullName(p)}, ${p.role === 'participant' ? or(p.country, 'Country') : ROLE_NAMES[p.role]}, ${p.dietary.trim() || 'No dietary restrictions'}`)
    .join('\n')
  return {
    to: group.email,
    cc: ctx.settings.cc_email,
    subject: `Home hospitality dinner: ${fmtLong(item.day)}`,
    body: `Thank you so much for opening your home for an evening for your upcoming home hospitality dinner on ${fmtLong(item.day)} at ${or(fmtTimeRange(item.start_time, null), 'TIME')}. The visitors will arrive at your home via rideshare at approximately ${or(fmtTimeRange(item.start_time, null), 'TIME')}. They are departing from their hotel, ${or(project.hotel_name, 'hotel')} (${or(project.hotel_address, 'ADDRESS')}), at ${hotelDeparture(item, items)}. For their ride back to the hotel at the end of the night, you can contact their liaison ${liaison ? fullName(liaison) : '[liaison name]'} at ${or(liaison?.phone ?? '', 'liaison phone')}. You can find a preliminary itinerary attached, with a final one to come the week of their arrival, where your information can be found on page [NUMBER] and below. Also find your visitor details below!

${visitors || '• [Visitor, Country, Dietary Information]'}

Host details:
${or(group.host, 'Host name')}
${or(group.address, 'Address')}
${[group.phone, group.email].filter(Boolean).join(' | ') || '[Contact information]'}
${group.bio}

We would also love to know of specific details about your dinner! Please keep us updated if you are inviting other guests, then after the event, we'd love to have any photos you took and to hear how your evening went. Look for another email from staff the week following your dinner. Thank you again for representing citizen diplomacy through your warm hospitality.`,
  }
}

function partnerThanks(ctx: EmailContext, item: ScheduleItem): Draft {
  const contacts = visitContacts(item, resourceOf(item, ctx.resources))
  return {
    to: join(emails(contacts)),
    cc: ctx.settings.ceo_email,
    subject: `Thank you for meeting with the ${ctx.project.name} group`,
    body: `Hi ${or(firstName(contacts[0]?.name ?? ''), 'name')},

Thank you for meeting with this group! [Add personal note about how the meeting was impactful for the group and program.]

If you have a few short minutes, please fill out this survey about your experience to help our team better coordinate meetings in the future in addition to gather data on the impact of exchanges: ${or(ctx.settings.survey_url, 'survey link')}

We also encourage you to share about the experience through photos and stories! Please send us any pictures from the day and tag Global Ties KC on any social media posts. We will do the same and share things we see.`,
  }
}

function hhThanks(ctx: EmailContext, item: ScheduleItem, group: HostGroup): Draft {
  const names = groupPeople(group, ctx.people).map(fullName)
  return {
    to: group.email,
    cc: ctx.settings.ceo_email,
    subject: 'Thank you for hosting!',
    body: `Hi ${or(group.host, 'name')},

Thank you for hosting ${names.length ? names.join(', ') : '[names of visitors]'} on ${fmtLong(item.day)}! [Add personal note about how the hosting was impactful for the group and program.]

If you have a few short minutes, please fill out this survey about your experience to help our team better coordinate hosting opportunities in the future in addition to gather data on the impact of exchanges: ${or(ctx.settings.survey_url, 'survey link')}

We also encourage you to share about the experience through photos and stories! Please share any pictures during the evening that you would be willing to share, we would love to receive them, as well as any key notes or takeaways. If you invited additional guests who might be interested in getting involved in Global Ties KC programs in the future, we would appreciate their names and contact info. When sharing on social media, please tag Global Ties KC on any social media posts. We will do the same and share things we see.`,
  }
}

export function draftTargets(ctx: EmailContext): DraftTarget[] {
  const targets: DraftTarget[] = [
    { key: 'hotel_request', label: EMAIL_LABELS.hotel_request, build: () => hotelRequest(ctx) },
    { key: 'hotel_npa_connect', label: EMAIL_LABELS.hotel_npa_connect, build: () => hotelNpaConnect(ctx) },
    { key: 'hotel_final', label: EMAIL_LABELS.hotel_final, build: () => hotelFinal(ctx) },
    { key: 'transport_request', label: EMAIL_LABELS.transport_request, build: () => transportRequest(ctx) },
    { key: 'transport_calendar', label: EMAIL_LABELS.transport_calendar, build: () => transportCalendar(ctx) },
  ]
  const sorted = sortItems(ctx.items)
  for (const item of sorted.filter((i) => i.kind === 'home_hospitality')) {
    item.hh_groups.forEach((group, n) => {
      const who = group.host || `Group ${n + 1}`
      targets.push({ key: 'hh_host_details', label: `${EMAIL_LABELS.hh_host_details}: ${who}`, build: () => hhHostDetails(ctx, item, group) })
      targets.push({ key: 'hh_thanks', label: `${EMAIL_LABELS.hh_thanks}: ${who}`, build: () => hhThanks(ctx, item, group) })
    })
  }
  for (const item of sorted.filter((i) => i.kind === 'meeting' && i.status !== 'declined')) {
    targets.push({ key: 'partner_thanks', label: `${EMAIL_LABELS.partner_thanks}: ${item.title}`, build: () => partnerThanks(ctx, item) })
  }
  return targets
}
