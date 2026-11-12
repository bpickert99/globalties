// Pure logic for the assistant: prompt, the one tool, the project snapshot, and turning
// approvals into tool results. No I/O here so it can be tested outside Supabase.

import type Anthropic from '@anthropic-ai/sdk'

export const MODEL = 'claude-opus-5-5'

export const SYSTEM_PROMPT = `You are the project assistant for Global Ties KC, a nonprofit in Kansas City that runs international exchange programs (mainly the State Department's International Visitor Leadership Program, IVLP, and fee-for-service programs such as Open World). You help one program manager run a single project: a group of international visitors spending about a week in Kansas City, with professional meetings at local organizations ("resources"), meals, cultural activities, transportation by Agenda USA, a hotel block (or, for some programs such as Open World, host families the group stays with instead), and sometimes home hospitality dinners with local hosts.

The user pastes emails they receive about the project, uploads documents (project proposals, rooming lists, itineraries), and asks where things stand. Each turn you are given the current project data as JSON in a system message; treat it as the source of truth and refer to people, meetings and tasks by what it contains.

How to help:
- Answer questions about the project's status directly and briefly, citing what is still open (checklist items due or overdue, meetings not yet confirmed, logistics not yet sent).
- When an email or document contains information that belongs in the project, propose the changes with the propose_changes tool. You never change anything yourself: the user reviews every proposed change and applies only the ones they approve. Never say a change has been made unless a later tool result says it was applied.
- Put all changes for one turn in a single propose_changes call, one operation per record. Give each operation a short reason that quotes or points to its source ("from the Sept 30 email from Jessica").
- From a project proposal, extract: participants (given and family names, position and organization, country, short bio), proposed meetings with their organizations (as resources and schedule items), and project details (dates, subtitle, NPA organization and contacts).
- Before adding a resource, check the resource library in the project data. If the organization is already there, use its id instead of adding a duplicate. When a library entry shows a recent meeting (last_met within the fatigue window), mention it so the user can avoid asking the same organization too often.
- Use ISO dates (YYYY-MM-DD) and 24-hour times (HH:MM). Use ids exactly as they appear in the project data. Leave out fields you don't know rather than guessing; put uncertain details in the reason instead.
- If something is ambiguous (which participant an email means, whether a meeting is confirmed), ask instead of proposing.
- Write plainly and briefly. Use short paragraphs or bullet lists; no headings for short answers.`

const OPERATION_TYPES = [
  'update_project',
  'add_participant',
  'update_participant',
  'cancel_participant',
  'add_resource',
  'update_resource',
  'add_schedule_item',
  'update_schedule_item',
  'add_task',
  'complete_task',
  'add_log_note',
] as const

export const PROPOSE_TOOL: Anthropic.Beta.BetaTool = {
  name: 'propose_changes',
  description: `Propose changes to the project for the user to review. Nothing is changed until the user approves each operation. Operation types and their fields:
- update_project: data = any of name, subtitle, countries, arrival_date, departure_date, npa_org, npa_address, npa_manager {name,title,phone,email}, npa_associate {name,title,phone,email}, billing_contact ("manager"|"associate"), hotel_name, hotel_address, hotel_phone, hotel_contact_name, hotel_contact_email, hotel_rate, hotel_eta (HH:MM), hotel_checkout (HH:MM), home_hospitality (boolean: a dinner in a local home), lodging ("hotel" | "host_families": host_families when the group stays with host families instead of a hotel), has_event (boolean), luggage_count (number), vehicle_notes, drivers [{role,name,phone}], notes.
- add_participant: data = given_name, family_name (required), role ("participant"|"interpreter"|"liaison"), position (title and organization), country, gender ("female"|"male", only when the source states it), phone, email, dietary, media_consent ("yes"|"no"|"unknown"), arrival_flight, departure_flight, hotel_confirmation, bio, notes.
- update_participant: id = participant id; data = fields to change (same as add_participant).
- cancel_participant: id = participant id (for someone who is no longer coming).
- add_resource: ref = a short key you choose (e.g. "r1") so add_schedule_item can point to it in the same call; data = name (required), category ("nonprofit"|"government"|"education"|"business"|"cultural"|"media"|"health"|"faith"|"other"), address, location (building/room), directions, description (for the itinerary), website, contacts [{name,title,phone,email}], notes.
- update_resource: id = resource id; data = fields to change (same as add_resource).
- add_schedule_item: data = day (YYYY-MM-DD, required), kind ("meeting"|"activity"|"meal"|"transport"|"flight"|"note"|"home_hospitality", required), title (required), start_time, end_time (HH:MM), resource_id (existing resource) or resource_ref (a ref from add_resource) — required for meeting and activity, contact_names (names of the resource's contacts attending), topic, description, status for meetings ("planned"|"requested"|"confirmed"|"declined"|"thanked"), internal_notes.
- update_schedule_item: id = schedule item id; data = fields to change (same as add_schedule_item).
- add_task: data = title (required), notes, due_date (YYYY-MM-DD), list ("project" for this project's to-do list, "general" for the General list).
- complete_task: id = task id (a checklist task or a to-do task).
- add_log_note: data = party ("hotel"|"agenda"), date (YYYY-MM-DD), note: record what the hotel or Agenda USA agreed.`,
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One sentence describing the proposed changes as a whole.' },
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [...OPERATION_TYPES] },
            reason: { type: 'string', description: 'Why, with the source (email, document, page).' },
            id: { type: 'string' },
            ref: { type: 'string' },
            data: { type: 'object' },
          },
          required: ['type', 'reason'],
        },
      },
    },
    required: ['summary', 'operations'],
  },
}

export type Operation = {
  type: (typeof OPERATION_TYPES)[number]
  reason: string
  id?: string
  ref?: string
  data?: Record<string, unknown>
  status: 'pending' | 'applied' | 'rejected' | 'failed'
  error?: string
}

export type Proposal = { tool_use_id: string; summary: string; operations: Operation[] }

// Keep only well-formed operations from a tool call; the client validates fields again.
export function proposalsFrom(content: Anthropic.Beta.BetaContentBlock[]): Proposal[] {
  const out: Proposal[] = []
  for (const block of content) {
    if (block.type !== 'tool_use' || block.name !== 'propose_changes') continue
    const input = block.input as { summary?: unknown; operations?: unknown }
    const ops = Array.isArray(input.operations) ? input.operations : []
    out.push({
      tool_use_id: block.id,
      summary: typeof input.summary === 'string' ? input.summary : 'Proposed changes',
      operations: ops
        .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object' && OPERATION_TYPES.includes((o as { type: never }).type))
        .map((o) => ({
          type: o.type as Operation['type'],
          reason: typeof o.reason === 'string' ? o.reason : '',
          id: typeof o.id === 'string' ? o.id : undefined,
          ref: typeof o.ref === 'string' ? o.ref : undefined,
          data: o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : undefined,
          status: 'pending' as const,
        })),
    })
  }
  return out
}

export function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n\n')
}

// Every tool call in the previous assistant turn needs a result at the start of the next user
// turn: what the user did with that proposal (or that it was never reviewed).
export function toolResultsFor(previous: Anthropic.Beta.BetaMessageParam | undefined, proposals: Proposal[]): Anthropic.Beta.BetaToolResultBlockParam[] {
  const blocks = previous && Array.isArray(previous.content) ? previous.content : []
  const ids = blocks.filter((b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === 'tool_use').map((b) => b.id)
  return ids.map((id) => {
    const p = proposals.find((x) => x.tool_use_id === id)
    if (!p) return { type: 'tool_result', tool_use_id: id, content: 'The proposal could not be shown to the user; nothing was applied.' }
    const lines = p.operations.map((o, i) => {
      const what = `${i + 1}. ${o.type}${o.id ? ` ${o.id}` : ''}${o.ref ? ` (${o.ref})` : ''}`
      if (o.status === 'applied') return `${what}: applied`
      if (o.status === 'rejected') return `${what}: rejected by the user`
      if (o.status === 'failed') return `${what}: failed to apply (${o.error ?? 'error'})`
      return `${what}: not reviewed yet (not applied)`
    })
    return { type: 'tool_result', tool_use_id: p.tool_use_id, content: lines.join('\n') || 'No operations.' }
  })
}

// ---------- project snapshot ----------

type Row = Record<string, unknown>

export type SnapshotInput = {
  today: string
  project: Row
  programType: string
  settings: { fatigue_days: number }
  participants: Row[]
  items: Row[]
  resources: Row[]
  visits: { resource_id: string; day: string; project_id: string; status: string | null }[]
  tasks: Row[]
  lists: Row[]
  documents: Row[]
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function checklistDue(task: Row, project: Row): string | null {
  if (task.anchor === null) return (task.due_date as string | null) ?? null
  const base = task.anchor === 'accepted' ? project.accepted_on : task.anchor === 'arrival' ? project.arrival_date : project.departure_date
  return addDays(base as string, task.offset_days as number)
}

function applies(task: Row, project: Row): boolean {
  if (!task.enabled) return false
  if (task.requires === 'home_hospitality') return project.home_hospitality === true
  if (task.requires === 'event') return project.has_event === true
  if (task.requires === 'hotel') return project.lodging === 'hotel'
  return true
}

const pick = (row: Row, keys: string[]) => Object.fromEntries(keys.filter((k) => row[k] !== '' && row[k] !== null && row[k] !== undefined).map((k) => [k, row[k]]))

// Compact, stable JSON of everything the assistant may need for this project.
export function buildSnapshot(s: SnapshotInput): string {
  const p = s.project
  const projectList = s.lists.find((l) => l.project_id === p.id)
  const general = s.lists.find((l) => l.project_id === null && l.name === 'General')
  const lastMet = (resourceId: string) =>
    s.visits
      .filter((v) => v.resource_id === resourceId && v.status !== 'declined' && v.day <= s.today)
      .map((v) => v.day)
      .sort()
      .pop() ?? null
  const usedHere = new Set(s.items.map((i) => i.resource_id).filter(Boolean))
  return JSON.stringify(
    {
      today: s.today,
      fatigue_window_days: s.settings.fatigue_days,
      project: {
        ...pick(p, ['id', 'name', 'subtitle', 'countries', 'accepted_on', 'arrival_date', 'departure_date', 'npa_org', 'npa_address', 'billing_contact', 'hotel_name', 'hotel_address', 'hotel_phone', 'hotel_contact_name', 'hotel_contact_email', 'hotel_rate', 'hotel_eta', 'hotel_checkout', 'home_hospitality', 'lodging', 'host_families', 'has_event', 'luggage_count', 'vehicle_notes', 'notes', 'closed_at']),
        program_type: s.programType,
        npa_manager: p.npa_manager,
        npa_associate: p.npa_associate,
        oiv_contacts: p.oiv_contacts,
        drivers: p.drivers,
        hotel_rooming_list_last_sent: p.hotel_sent_at ?? null,
        agenda_calendar_last_sent: p.transport_sent_at ?? null,
        vendor_log: p.vendor_log,
      },
      participants: s.participants.map((x) => pick(x, ['id', 'role', 'given_name', 'family_name', 'position', 'country', 'gender', 'phone', 'email', 'dietary', 'media_consent', 'arrival_flight', 'departure_flight', 'hotel_confirmation', 'bio', 'cancelled_at'])),
      schedule: s.items.map((x) => pick(x, ['id', 'day', 'start_time', 'end_time', 'kind', 'title', 'resource_id', 'contact_ids', 'topic', 'status', 'description', 'internal_notes'])),
      resources_in_this_project: s.resources.filter((r) => usedHere.has(r.id)).map((r) => ({ ...pick(r, ['id', 'name', 'category', 'address', 'location', 'directions', 'description', 'website', 'notes']), contacts: r.contacts })),
      resource_library: s.resources.map((r) => ({ id: r.id, name: r.name, category: r.category, last_met: lastMet(r.id as string) })),
      checklist: s.tasks
        .filter((t) => t.project_id === p.id && applies(t, p))
        .map((t) => ({ id: t.id, title: t.title, phase: t.phase, due: checklistDue(t, p), done: !!t.done_at })),
      todo_lists: [projectList, general].filter(Boolean).map((l) => ({
        list: l === projectList ? 'project' : 'general',
        tasks: s.tasks.filter((t) => t.list_id === l!.id).map((t) => ({ id: t.id, title: t.title, notes: t.details || undefined, due: t.due_date ?? undefined, done: !!t.done_at })),
      })),
      documents: s.documents.map((d) => d.name),
    },
    null,
    1,
  )
}
