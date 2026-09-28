// Email drafts from the IVLP Programmer Guide templates, filled from project data.
// Anything the data can't supply is left as a [bracketed] placeholder to edit.

import { fmtLong, fmtRange, fmtTimeRange, parseDate } from './dates'
import { activePeople, fullName, sortItems } from './logic'
import type { Contact, EmailKey, HostGroup, Participant, Project, ScheduleItem, Settings } from './types'

export type Draft = { to: string; cc: string; subject: string; body: string }

export type EmailContext = {
  project: Project
  people: Participant[]
  items: ScheduleItem[]
  settings: Settings
}

// One draft target: most emails are per project, host emails per group, thanks per meeting.
export type DraftTarget = { key: EmailKey; label: string; build: () => Draft }

export const EMAIL_LABELS: Record<EmailKey, string> = {
  hotel_request: 'Request rooms from hotel',
  hotel_npa_connect: 'Connect hotel and NPA',
  transport_request: 'Request transportation (Agenda USA)',
  hh_host_details: 'Home hospitality host details',
  partner_thanks: 'Meeting partner thank-you',
  hh_thanks: 'Home hospitality host thank-you',
}

const ROLE_NAMES = { participant: 'Participant', interpreter: 'Interpreter', liaison: 'Liaison' } as const
const or = (value: string, placeholder: string) => value.trim() || `[${placeholder}]`
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? ''
const emails = (contacts: Contact[]) => contacts.map((c) => c.email).filter(Boolean)
const join = (list: string[]) => list.filter(Boolean).join('; ')

function billingContact(project: Project): string {
  const c = project.npa_contacts[0]
  if (!c) return '[Billing contact: name, position, organization, email, phone]'
  return [c.name, c.title, project.npa_org, c.email, c.phone].filter(Boolean).join(', ')
}

function dates(project: Project): string {
  return fmtRange(project.arrival_date, project.departure_date)
}

function month(project: Project): string {
  return parseDate(project.arrival_date).toLocaleDateString('en-US', { month: 'long' })
}

function hotelRequest({ project, people }: EmailContext): Draft {
  const active = activePeople(people)
  return {
    to: project.hotel_contact_email,
    cc: '',
    subject: `Room availability: ${project.name}, ${dates(project)}`,
    body: `Hi ${or(firstName(project.hotel_contact_name), 'name')},

Hope you are doing well! I am reaching out to see if you have availability for one of our upcoming groups. Below are the details for the project:

Program Name: ${project.name}
Dates: ${dates(project)}
Number of Rooms: ${active.length || '[XX]'}
Names: ${active.length ? active.map(fullName).join(', ') : '[names if available]'}
Billing Contact: ${billingContact(project)}

[Attach rooming list if already sent by NPA.]`,
  }
}

function hotelNpaConnect({ project, people, settings }: EmailContext): Draft {
  return {
    to: join([project.hotel_contact_email, ...emails(project.npa_contacts)]),
    cc: settings.cc_email,
    subject: `Kansas City hotel: ${project.name}, ${dates(project)}`,
    body: `Hi all,

Hope you are doing well! I wanted to connect all of you regarding the hotel in Kansas City for the ${project.name} group in ${month(project)}. We are confirmed for ${activePeople(people).length || '[number of]'} rooms at ${or(project.hotel_name, 'hotel name')} (${or(project.hotel_address, 'hotel address')}) at GSA rate of ${or(project.hotel_rate, '$xx')} from ${dates(project)}. ${or(project.hotel_contact_name, 'Hotel contact')} will send confirmation numbers once they receive the rooming list.

For future communication, please make sure to keep me and my colleague on the cc so we can all be on the same page. Thanks all!`,
  }
}

function transportRequest({ project, people, settings }: EmailContext): Draft {
  return {
    to: settings.transport_email,
    cc: '',
    subject: `Transportation: ${project.name}, ${dates(project)}`,
    body: `Hi ${or(settings.transport_contact_name, 'name')},

Hope you are doing well! I wanted to reach out about availability of transportation for the upcoming program. Details below:

Program Name: ${project.name}
Dates: ${dates(project)}
Passenger Count: ${activePeople(people).length || '[XX]'} [any details of specific vehicle size]
Billing Contact: ${billingContact(project)}`,
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
  return {
    to: join(emails(item.contacts)),
    cc: ctx.settings.ceo_email,
    subject: `Thank you for meeting with the ${ctx.project.name} group`,
    body: `Hi ${or(firstName(item.contacts[0]?.name ?? ''), 'name')},

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
    { key: 'transport_request', label: EMAIL_LABELS.transport_request, build: () => transportRequest(ctx) },
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
