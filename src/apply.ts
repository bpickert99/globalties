// Applies assistant proposals the user approved. Runs as the signed-in user (row level
// security applies). Every field is checked against a per-type allowlist first.

import { geocode } from './resources'
import { must, supabase } from './supabase'
import type { Operation, Project, Resource, ResourceContact, Vendor } from './types'

const PROJECT_FIELDS = [
  'name', 'subtitle', 'countries', 'arrival_date', 'departure_date', 'npa_org', 'npa_address', 'npa_manager', 'npa_associate', 'billing_contact',
  'hotel_name', 'hotel_address', 'hotel_phone', 'hotel_contact_name', 'hotel_contact_email', 'hotel_rate', 'hotel_eta', 'hotel_checkout',
  'home_hospitality', 'lodging', 'has_event', 'luggage_count', 'vehicle_notes', 'drivers', 'notes',
]
const PARTICIPANT_FIELDS = ['role', 'given_name', 'family_name', 'position', 'country', 'phone', 'email', 'dietary', 'media_consent', 'arrival_flight', 'departure_flight', 'hotel_confirmation', 'bio', 'notes']
const RESOURCE_FIELDS = ['name', 'category', 'address', 'location', 'directions', 'description', 'website', 'notes']
const ITEM_FIELDS = ['day', 'start_time', 'end_time', 'kind', 'title', 'topic', 'description', 'status', 'internal_notes']
const VISITS = ['meeting', 'activity']

function allowed(data: Record<string, unknown> | undefined, fields: string[]): Record<string, unknown> {
  if (!data) return {}
  return Object.fromEntries(Object.entries(data).filter(([k, v]) => fields.includes(k) && v !== undefined))
}

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined || value === null || value === '') throw new Error(`missing ${what}`)
  return value
}

function contacts(raw: unknown): ResourceContact[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({ id: crypto.randomUUID(), name: String(c.name ?? ''), title: String(c.title ?? ''), phone: String(c.phone ?? ''), email: String(c.email ?? '') }))
    .filter((c) => c.name.trim())
}

type Context = { project: Project; refs: Map<string, string> }

async function addResource(op: Operation, ctx: Context) {
  const fields = allowed(op.data, RESOURCE_FIELDS)
  need(fields.name, 'resource name')
  const address = String(fields.address ?? '')
  const point = address.trim() ? await geocode(address).catch(() => null) : null
  const row = must(
    await supabase
      .from('resources')
      .insert({ ...fields, contacts: contacts(op.data?.contacts), lat: point?.lat ?? null, lng: point?.lng ?? null })
      .select('id')
      .single(),
  ) as { id: string }
  if (op.ref) ctx.refs.set(op.ref, row.id)
}

async function scheduleFields(op: Operation, ctx: Context, creating: boolean): Promise<Record<string, unknown>> {
  const fields = allowed(op.data, ITEM_FIELDS)
  const data = op.data ?? {}
  const resourceId = (data.resource_id as string | undefined) ?? (data.resource_ref ? ctx.refs.get(String(data.resource_ref)) : undefined)
  if (data.resource_ref && !resourceId) throw new Error(`resource "${data.resource_ref}" was not added (approve it in the same batch)`)
  if (resourceId) fields.resource_id = resourceId
  const kind = (fields.kind as string | undefined) ?? undefined
  if (creating) {
    need(fields.day, 'day')
    need(fields.title, 'title')
    need(kind, 'kind')
    if (VISITS.includes(kind!)) need(resourceId, 'resource for this meeting/activity')
    if (kind === 'meeting' && !fields.status) fields.status = 'planned'
  }
  if (kind && !VISITS.includes(kind)) fields.resource_id = null
  if (kind && kind !== 'meeting') fields.status = null
  if (resourceId && Array.isArray(data.contact_names)) {
    const r = must(await supabase.from('resources').select('contacts').eq('id', resourceId).single()) as Pick<Resource, 'contacts'>
    const wanted = (data.contact_names as unknown[]).map((n) => String(n).toLowerCase().trim())
    fields.contact_ids = r.contacts.filter((c) => wanted.includes(c.name.toLowerCase().trim())).map((c) => c.id)
  }
  if (fields.status) fields.status_changed_at = new Date().toISOString()
  return fields
}

async function listId(project: Project, which: unknown): Promise<string> {
  const query = which === 'general' ? supabase.from('task_lists').select('id').is('project_id', null).eq('name', 'General') : supabase.from('task_lists').select('id').eq('project_id', project.id)
  return (must(await query.single()) as { id: string }).id
}

async function applyOne(op: Operation, ctx: Context): Promise<void> {
  const { project } = ctx
  switch (op.type) {
    case 'update_project':
      must(await supabase.from('projects').update(allowed(op.data, PROJECT_FIELDS)).eq('id', project.id))
      return
    case 'add_participant': {
      const f = allowed(op.data, PARTICIPANT_FIELDS)
      need(f.given_name, 'given name')
      need(f.family_name, 'family name')
      must(await supabase.from('participants').insert({ ...f, project_id: project.id }))
      return
    }
    case 'update_participant':
      must(await supabase.from('participants').update(allowed(op.data, PARTICIPANT_FIELDS)).eq('id', need(op.id, 'participant id')).eq('project_id', project.id))
      return
    case 'cancel_participant':
      must(await supabase.from('participants').update({ cancelled_at: new Date().toISOString() }).eq('id', need(op.id, 'participant id')).eq('project_id', project.id))
      return
    case 'add_resource':
      return addResource(op, ctx)
    case 'update_resource': {
      const f = allowed(op.data, RESOURCE_FIELDS)
      if (op.data?.contacts) f.contacts = contacts(op.data.contacts)
      if (typeof f.address === 'string' && f.address.trim()) {
        const point = await geocode(f.address).catch(() => null)
        Object.assign(f, { lat: point?.lat ?? null, lng: point?.lng ?? null })
      }
      must(await supabase.from('resources').update(f).eq('id', need(op.id, 'resource id')))
      return
    }
    case 'add_schedule_item':
      must(await supabase.from('schedule_items').insert({ ...(await scheduleFields(op, ctx, true)), project_id: project.id }))
      return
    case 'update_schedule_item':
      must(await supabase.from('schedule_items').update(await scheduleFields(op, ctx, false)).eq('id', need(op.id, 'schedule item id')).eq('project_id', project.id))
      return
    case 'add_task': {
      const d = op.data ?? {}
      must(await supabase.from('tasks').insert({ title: need(d.title as string, 'title'), details: String(d.notes ?? ''), due_date: (d.due_date as string) || null, list_id: await listId(project, d.list) }))
      return
    }
    case 'complete_task':
      must(await supabase.from('tasks').update({ done_at: new Date().toISOString() }).eq('id', need(op.id, 'task id')))
      return
    case 'add_log_note': {
      const d = op.data ?? {}
      const party: Vendor | null = d.party === 'hotel' ? 'hotel' : d.party === 'agenda' ? 'agenda' : null
      if (!party) throw new Error('party must be hotel or agenda')
      const entry = { date: String(d.date ?? new Date().toISOString().slice(0, 10)), party, note: need(d.note as string, 'note') }
      must(await supabase.from('projects').update({ vendor_log: [...project.vendor_log, entry] }).eq('id', project.id))
      project.vendor_log = [...project.vendor_log, entry]
      return
    }
  }
}

// Applies the chosen operations (resources first so later ones can link to them) and
// returns every operation with its new status.
export async function applyOperations(project: Project, ops: Operation[], chosen: Set<number>): Promise<Operation[]> {
  const ctx: Context = { project: { ...project }, refs: new Map() }
  const result = ops.map((o) => ({ ...o }))
  const order = result.map((_, i) => i).sort((a, b) => Number(result[b].type === 'add_resource') - Number(result[a].type === 'add_resource'))
  for (const i of order) {
    const op = result[i]
    if (op.status !== 'pending') continue
    if (!chosen.has(i)) {
      op.status = 'rejected'
      continue
    }
    try {
      await applyOne(op, ctx)
      op.status = 'applied'
    } catch (err) {
      op.status = 'failed'
      op.error = (err as Error).message
    }
  }
  return result
}

// One-line description of an operation for the review card.
export function describe(op: Operation, lookup: { participant: (id: string) => string; item: (id: string) => string; resource: (id: string) => string; task: (id: string) => string }): string {
  const d = op.data ?? {}
  const s = (k: string) => (d[k] === undefined || d[k] === null ? '' : String(d[k]))
  // Only fields that will actually be written are listed.
  const keys = (fields: string[]) => Object.keys(allowed(d, fields)).join(', ') || 'nothing that can be changed'
  switch (op.type) {
    case 'update_project':
      return `Update project: ${keys(PROJECT_FIELDS)}`
    case 'add_participant':
      return `Add ${s('role') || 'participant'}: ${s('given_name')} ${s('family_name').toUpperCase()}${s('position') ? ` — ${s('position')}` : ''}${s('country') ? ` (${s('country')})` : ''}`
    case 'update_participant':
      return `Update ${lookup.participant(op.id ?? '')}: ${keys(PARTICIPANT_FIELDS)}`
    case 'cancel_participant':
      return `Cancel ${lookup.participant(op.id ?? '')}`
    case 'add_resource':
      return `Add resource: ${s('name')}${s('category') ? ` (${s('category')})` : ''}`
    case 'update_resource':
      return `Update resource ${lookup.resource(op.id ?? '')}: ${keys([...RESOURCE_FIELDS, 'contacts'])}`
    case 'add_schedule_item':
      return `Add ${s('kind') || 'item'} on ${s('day')}${s('start_time') ? ` at ${s('start_time')}` : ''}: ${s('title')}`
    case 'update_schedule_item':
      return `Update "${lookup.item(op.id ?? '')}": ${keys([...ITEM_FIELDS, 'resource_id', 'resource_ref', 'contact_names'])}`
    case 'add_task':
      return `Add to-do (${s('list') === 'general' ? 'General' : 'project list'}): ${s('title')}${s('due_date') ? ` · due ${s('due_date')}` : ''}`
    case 'complete_task':
      return `Mark done: ${lookup.task(op.id ?? '')}`
    case 'add_log_note':
      return `Log (${s('party')}, ${s('date')}): ${s('note')}`
  }
}
