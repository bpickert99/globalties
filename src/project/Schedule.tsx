import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { addDays, dayRange, daysBetween, fmtLong, fmtShort, fmtTimeRange } from '../dates'
import { recentMeetings, relative, type Visit } from '../fatigue'
import CalendarView from './Calendar'
import { KIND_LABELS, sortItems, STATUS_LABELS } from '../logic'
import type { TabProps } from '../pages/Project'
import ResourceForm from '../ResourceForm'
import { CATEGORY_LABELS, resourceOf, visitContacts } from '../resources'
import { must, supabase } from '../supabase'
import type { ItemKind, MeetingStatus, Project, Resource, Restaurant, ScheduleItem } from '../types'
import { act, Field, useData } from '../ui'
import HostGroupsEditor from './HostGroups'

type Draft = Omit<ScheduleItem, 'id' | 'project_id' | 'created_at' | 'status_changed_at'>

const blank = (day: string): Draft => ({
  day,
  start_time: null,
  end_time: null,
  kind: 'meeting',
  title: '',
  resource_id: null,
  contact_ids: [],
  topic: '',
  description: '',
  restaurants: [],
  hh_groups: [],
  status: 'planned',
  internal_notes: '',
})

const STATUSES = Object.keys(STATUS_LABELS) as MeetingStatus[]
// Meetings and cultural activities are visits to a saved resource.
const VISITS: ItemKind[] = ['meeting', 'activity']

type FatigueData = { visits: Visit[]; projects: Map<string, string> }

async function loadVisits(): Promise<FatigueData> {
  const [visits, projects] = await Promise.all([
    supabase.from('schedule_items').select('id, project_id, resource_id, day, title, status, contact_ids').not('resource_id', 'is', null),
    supabase.from('projects').select('id, name'),
  ])
  return { visits: must(visits) as Visit[], projects: new Map((must(projects) as { id: string; name: string }[]).map((p) => [p.id, p.name])) }
}

export default function Schedule({ data, reload }: TabProps) {
  const { project } = data
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'calendar' ? 'calendar' : 'list'
  const [editing, setEditing] = useState<{ id: string | null; day: string; start?: string | null } | null>(null)
  const [copying, setCopying] = useState(false)
  const fatigue = useData(loadVisits, [data.items])
  const items = sortItems(data.items)
  const days = dayRange(project.arrival_date, project.departure_date)
  const outside = items.filter((i) => !days.includes(i.day))
  const meetings = items.filter((i) => i.kind === 'meeting')
  const windowDays = data.settings.fatigue_days
  const warnings = new Set(fatigue.data ? items.filter((i) => recentMeetings(i, fatigue.data!.visits, windowDays).length > 0).map((i) => i.id) : [])

  async function done() {
    setEditing(null)
    await fatigue.reload()
  }

  async function setStatus(item: ScheduleItem, status: MeetingStatus) {
    await act(async () => must(await supabase.from('schedule_items').update({ status, status_changed_at: new Date().toISOString() }).eq('id', item.id)))
    await reload()
  }

  const meta = (item: ScheduleItem) => {
    if (!item.resource_id) return KIND_LABELS[item.kind]
    const r = resourceOf(item, data.resources)
    return [KIND_LABELS[item.kind], r.address.split('\n')[0], ...visitContacts(item, r).map((c) => c.name)].filter(Boolean).join(' · ')
  }

  const form = (item: ScheduleItem | undefined, day: string, start?: string | null) => (
    <ItemForm key={item?.id ?? `new-${day}-${start}`} data={data} item={item} day={day} start={start} fatigue={fatigue.data} onDone={done} reload={reload} />
  )

  const itemRow = (item: ScheduleItem) =>
    view === 'list' && editing?.id === item.id ? (
      form(item, item.day)
    ) : (
      <div key={item.id} className={`item kind-${item.kind}`} onClick={() => setEditing({ id: item.id, day: item.day })}>
        <div className="item-time">{fmtTimeRange(item.start_time, item.end_time)}</div>
        <div className="item-main">
          <div className="item-title">
            {warnings.has(item.id) && (
              <span className="fatigue-badge" title="Met with a group recently">
                ⚠ met recently
              </span>
            )}
            {item.title}
          </div>
          <div className="muted small">{meta(item)}</div>
        </div>
        {item.status && (
          <select
            className={`status status-${item.status}`}
            value={item.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setStatus(item, e.target.value as MeetingStatus)}
            aria-label="Meeting status"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
      </div>
    )

  const editingItem = editing?.id ? items.find((i) => i.id === editing.id) : undefined

  return (
    <div className="stack">
      <div className="row spread">
        <div className="stats">
          {STATUSES.map((s) => (
            <span key={s} className={`status-${s}`}>
              <b>{meetings.filter((m) => m.status === s).length}</b> {STATUS_LABELS[s].toLowerCase()}
            </span>
          ))}
        </div>
        <div className="row">
          <div className="seg" role="group" aria-label="View">
            <button className={view === 'list' ? 'on' : ''} onClick={() => setParams({}, { replace: true })}>
              List
            </button>
            <button className={view === 'calendar' ? 'on' : ''} onClick={() => setParams({ view: 'calendar' }, { replace: true })}>
              Calendar
            </button>
          </div>
          <button className="btn small" onClick={() => setCopying(!copying)}>
            Copy from a past project
          </button>
          <Link className="btn small" to={`/resources?project=${project.id}`}>
            View on map
          </Link>
        </div>
      </div>
      {copying && <CopyFromProject data={data} onDone={async () => (setCopying(false), await reload())} />}

      {view === 'calendar' ? (
        <>
          <p className="muted small">Click an empty time to add a meeting, meal, transit, cultural activity or home hospitality. Click an item to edit it, drag it to another time or day, or drag its bottom edge to change when it ends.</p>
          <CalendarView project={project} items={data.items} warnings={warnings} onEdit={(i) => setEditing({ id: i.id, day: i.day })} onAdd={(day, start) => setEditing({ id: null, day, start })}
            onMove={async (item, move) => {
              await act(async () => must(await supabase.from('schedule_items').update(move).eq('id', item.id)))
              await reload()
            }}
          />
          {editing && (
            <div className="modal" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
              <div className="modal-body">{form(editingItem, editing.day, editing.start)}</div>
            </div>
          )}
        </>
      ) : (
        <>
          {days.map((day) => (
            <section key={day} className="card day">
              <div className="row spread">
                <h2>{fmtLong(day)}</h2>
                <button className="btn small" onClick={() => setEditing({ id: null, day })}>
                  + Add
                </button>
              </div>
              {items.filter((i) => i.day === day).map(itemRow)}
              {editing && editing.id === null && editing.day === day && form(undefined, day)}
            </section>
          ))}
        </>
      )}
      {outside.length > 0 && (
        <section className="card day">
          <h2>Outside the program dates</h2>
          <p className="muted small">These items are not in the itinerary. Move them to a program day or delete them.</p>
          {outside.map(itemRow)}
        </section>
      )}
    </div>
  )
}

// Copy meetings, meals and activities from an earlier project, keeping each one's day of the
// program (day 1, day 2...) and times. Meetings come in as "to request".
function CopyFromProject({ data, onDone }: { data: TabProps['data']; onDone: () => Promise<void> }) {
  const projects = useData(
    async () => must(await supabase.from('projects').select('id, name, arrival_date, departure_date').neq('id', data.project.id).order('arrival_date', { ascending: false })) as Pick<Project, 'id' | 'name' | 'arrival_date' | 'departure_date'>[],
    [data.project.id],
  )
  const [sourceId, setSourceId] = useState('')
  const source = projects.data?.find((p) => p.id === sourceId)
  const sourceItems = useData(async () => (sourceId ? (must(await supabase.from('schedule_items').select('*').eq('project_id', sourceId)) as ScheduleItem[]) : []), [sourceId])
  const [chosen, setChosen] = useState<Set<string> | null>(null)
  const list = sortItems(sourceItems.data ?? []).filter((i) => i.kind !== 'flight')
  const picked = chosen ?? new Set(list.filter((i) => i.kind !== 'transport' && i.kind !== 'pickup').map((i) => i.id))
  const span = daysBetween(data.project.arrival_date, data.project.departure_date)

  async function copy() {
    if (!source) return
    const rows = list
      .filter((i) => picked.has(i.id))
      .map((i) => {
        const { id, project_id, created_at, status_changed_at, ...rest } = i
        void [id, project_id, created_at, status_changed_at]
        const offset = Math.min(daysBetween(source.arrival_date, i.day), span)
        return {
          ...rest,
          project_id: data.project.id,
          day: addDays(data.project.arrival_date, Math.max(0, offset)),
          status: i.kind === 'meeting' ? 'planned' : null,
          hh_groups: i.hh_groups.map((g) => ({ ...g, participant_ids: [] })),
        }
      })
    if (await act(async () => must(await supabase.from('schedule_items').insert(rows)))) await onDone()
  }

  return (
    <section className="card form">
      <h2>Copy from a past project</h2>
      <Field label="Project">
        <select
          value={sourceId}
          onChange={(e) => {
            setSourceId(e.target.value)
            setChosen(null)
          }}
        >
          <option value="">Choose a project…</option>
          {projects.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({fmtShort(p.arrival_date)})
            </option>
          ))}
        </select>
      </Field>
      {source && (
        <>
          <p className="muted small">Each item keeps its day of the program and its times. Meetings come in as "To request"; home hospitality hosts come in without guests assigned.</p>
          <div className="copy-list">
            {list.map((i) => {
              const dayNo = daysBetween(source.arrival_date, i.day) + 1
              return (
                <label key={i.id} className="toggle">
                  <input
                    type="checkbox"
                    checked={picked.has(i.id)}
                    onChange={(e) => {
                      const next = new Set(picked)
                      if (e.target.checked) next.add(i.id)
                      else next.delete(i.id)
                      setChosen(next)
                    }}
                  />
                  <span className="muted small nowrap">Day {dayNo}</span> {fmtTimeRange(i.start_time, i.end_time)} {i.title} <span className="chip subtle">{KIND_LABELS[i.kind]}</span>
                </label>
              )
            })}
            {list.length === 0 && <span className="muted">That project has no schedule yet.</span>}
          </div>
          <div className="row">
            <button className="btn primary" disabled={picked.size === 0} onClick={copy}>
              Copy {picked.size} item{picked.size === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function ItemForm({
  data,
  item,
  day,
  start,
  fatigue,
  onDone,
  reload,
}: {
  data: TabProps['data']
  item?: ScheduleItem
  day: string
  start?: string | null
  fatigue: FatigueData | undefined
  onDone: () => void
  reload: () => Promise<void>
}) {
  const [form, setForm] = useState<Draft>(() => {
    if (!item) return { ...blank(day), start_time: start ?? null, end_time: start ? endAfterHour(start) : null }
    const { id, project_id, created_at, status_changed_at, ...rest } = item
    void [id, project_id, created_at, status_changed_at]
    return rest
  })
  const [resourceQuery, setResourceQuery] = useState(() => data.resources.find((r) => r.id === item?.resource_id)?.name ?? '')
  const [creatingResource, setCreatingResource] = useState(false)
  const set = (patch: Partial<Draft>) => setForm((f) => ({ ...f, ...patch }))
  const kind = form.kind
  const isVisit = VISITS.includes(kind)
  const resource = data.resources.find((r) => r.id === form.resource_id)

  function setKind(k: ItemKind) {
    const visit = VISITS.includes(k)
    set({
      kind: k,
      status: k === 'meeting' ? (form.status ?? 'planned') : null,
      ...(k === 'pickup' ? { end_time: null } : {}),
      ...(visit ? {} : { resource_id: null, contact_ids: [] }),
    })
  }

  // Choosing a resource fills the title (when it still matches the old resource) and its contact.
  function chooseResource(r: Resource | undefined) {
    const prevName = resource?.name ?? ''
    set({
      resource_id: r?.id ?? null,
      contact_ids: r && r.contacts.length === 1 ? [r.contacts[0].id] : [],
      ...(r && (!form.title || form.title === prevName) ? { title: r.name } : {}),
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const statusChanged = item && item.status !== form.status
    const payload = { ...form, start_time: form.start_time || null, end_time: form.end_time || null, ...(statusChanged ? { status_changed_at: new Date().toISOString() } : {}) }
    const ok = await act(async () =>
      must(item ? await supabase.from('schedule_items').update(payload).eq('id', item.id) : await supabase.from('schedule_items').insert({ ...payload, project_id: data.project.id })),
    )
    if (!ok) return
    onDone()
    await reload()
  }

  async function remove() {
    if (!item || !confirm(`Delete "${item.title}"?`)) return
    const ok = await act(async () => must(await supabase.from('schedule_items').delete().eq('id', item.id)))
    if (!ok) return
    onDone()
    await reload()
  }

  // A new resource is its own form, shown in place of this one (forms can't nest).
  if (creatingResource) {
    return (
      <ResourceForm
        initialName={resourceQuery}
        onCancel={() => setCreatingResource(false)}
        onSaved={async (saved, notice) => {
          if (notice) alert(notice)
          await reload()
          setCreatingResource(false)
          setResourceQuery(saved.name)
          set({ resource_id: saved.id, contact_ids: saved.contacts.length === 1 ? [saved.contacts[0].id] : [], ...(form.title ? {} : { title: saved.name }) })
        }}
      />
    )
  }

  const typedMatch = data.resources.find((r) => r.name.toLowerCase() === resourceQuery.trim().toLowerCase())

  return (
    <form className="item-form" onSubmit={submit}>
      <div className="grid">
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value as ItemKind)}>
            {Object.entries(KIND_LABELS)
              .filter(([k]) => k !== 'home_hospitality' || data.project.home_hospitality || kind === 'home_hospitality')
              .map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Day">
          <input type="date" required value={form.day} onChange={(e) => set({ day: e.target.value })} />
        </Field>
        {kind !== 'note' && (
          <>
            <Field label={kind === 'pickup' ? 'Pickup time' : 'Start'}>
              <input type="time" required={kind === 'pickup'} value={form.start_time?.slice(0, 5) ?? ''} onChange={(e) => set({ start_time: e.target.value || null })} />
            </Field>
            {kind !== 'pickup' && (
              <Field label="End">
                <input type="time" value={form.end_time?.slice(0, 5) ?? ''} onChange={(e) => set({ end_time: e.target.value || null })} />
              </Field>
            )}
          </>
        )}
        {kind === 'meeting' && (
          <Field label="Status">
            <select value={form.status ?? 'planned'} onChange={(e) => set({ status: e.target.value as MeetingStatus })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {isVisit && (
        <div className="resource-pick">
          <Field label="Resource (organization or place)" wide>
            <input
              list="resource-names"
              value={resourceQuery}
              placeholder="Start typing a saved resource…"
              onChange={(e) => {
                setResourceQuery(e.target.value)
                chooseResource(data.resources.find((r) => r.name.toLowerCase() === e.target.value.trim().toLowerCase()))
              }}
            />
            <datalist id="resource-names">
              {data.resources.map((r) => (
                <option key={r.id} value={r.name} />
              ))}
            </datalist>
          </Field>
          {!typedMatch && (
            <button type="button" className="btn small" onClick={() => setCreatingResource(true)}>
              + Save {resourceQuery.trim() ? `"${resourceQuery.trim()}"` : 'a new resource'} to Resources
            </button>
          )}
          {resource && (
            <div className="resource-summary">
              <div className="muted small">
                {CATEGORY_LABELS[resource.category]}
                {resource.address && ` · ${resource.address.replace(/\n/g, ', ')}`}
                {resource.lat === null && ' · not on map'} ·{' '}
                <Link to={`/resources?id=${resource.id}`} target="_blank">
                  Edit resource
                </Link>
              </div>
              {resource.contacts.length > 0 ? (
                <div className="checks">
                  <span className="muted small">Contacts for this visit:</span>
                  {resource.contacts.map((c) => (
                    <label key={c.id} className="toggle">
                      <input
                        type="checkbox"
                        checked={form.contact_ids.includes(c.id)}
                        onChange={(e) => set({ contact_ids: e.target.checked ? [...form.contact_ids, c.id] : form.contact_ids.filter((x) => x !== c.id) })}
                      />
                      {c.name}
                      {c.title && <span className="muted"> ({c.title})</span>}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="muted small">No contacts saved for this resource yet. Add them with "Edit resource".</p>
              )}
            </div>
          )}
        </div>
      )}

      {isVisit && fatigue && <FatigueWarning target={{ id: item?.id, resource_id: form.resource_id, contact_ids: form.contact_ids, day: form.day }} fatigue={fatigue} data={data} />}

      <Field label={kind === 'note' ? 'Note text (italic in itinerary)' : isVisit ? 'Title on itinerary' : 'Title'} wide>
        <input
          required
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder={
            kind === 'flight' ? 'Arrive on American Airlines #3764 from Chicago, IL' : kind === 'transport' ? 'Drop-Offs' : kind === 'pickup' ? 'Pick-Ups' : kind === 'meal' ? 'Lunch' : isVisit ? 'Workshop: Midwest Center for Nonprofit Leadership' : ''
          }
        />
      </Field>
      {isVisit && (
        <Field label="Topic for this visit" wide>
          <textarea rows={2} value={form.topic} onChange={(e) => set({ topic: e.target.value })} />
        </Field>
      )}
      {kind === 'home_hospitality' && (
        <Field label="Introduction" wide>
          <textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
      )}
      {kind === 'meal' && <RestaurantsEditor value={form.restaurants} onChange={(restaurants) => set({ restaurants })} />}
      {kind === 'home_hospitality' && <HostGroupsEditor label="Host groups" unit="group" people={data.people} value={form.hh_groups} onChange={(hh_groups) => set({ hh_groups })} />}
      <Field label="Internal notes (not in itinerary)" wide>
        <textarea rows={2} value={form.internal_notes} onChange={(e) => set({ internal_notes: e.target.value })} />
      </Field>
      <div className="row">
        <button className="btn primary" disabled={isVisit && !form.resource_id} title={isVisit && !form.resource_id ? 'Choose or save a resource first' : undefined}>
          Save
        </button>
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
        {item && (
          <button type="button" className="btn ghost danger" onClick={remove}>
            Delete
          </button>
        )}
      </div>
    </form>
  )
}

function RestaurantsEditor({ value, onChange }: { value: Restaurant[]; onChange: (v: Restaurant[]) => void }) {
  const set = (i: number, patch: Partial<Restaurant>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="field wide">
      <span>Restaurant recommendations</span>
      {value.map((r, i) => (
        <div key={i} className="contact-row">
          <input placeholder="Name" value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
          <input placeholder="Address" value={r.address} onChange={(e) => set(i, { address: e.target.value })} />
          <input placeholder="Description" value={r.description} onChange={(e) => set(i, { description: e.target.value })} />
          <button type="button" className="btn small ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove restaurant">
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn small ghost" onClick={() => onChange([...value, { name: '', address: '', description: '' }])}>
        + Add restaurant
      </button>
    </div>
  )
}

function endAfterHour(start: string): string {
  const [h, m] = start.split(':').map(Number)
  return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function FatigueWarning({ target, fatigue, data }: { target: Parameters<typeof recentMeetings>[0]; fatigue: FatigueData; data: TabProps['data'] }) {
  const windowDays = data.settings.fatigue_days
  const recent = recentMeetings(target, fatigue.visits, windowDays)
  if (!recent.length) return null
  const resource = data.resources.find((r) => r.id === target.resource_id)
  const contactName = (id: string) => resource?.contacts.find((c) => c.id === id)?.name ?? 'a contact'
  return (
    <div className="notice warn">
      <b>Met recently: check this isn't asking too much of them.</b> Within {windowDays} days of this visit:
      <ul>
        {recent.map((m) => (
          <li key={m.visit.id}>
            {fatigue.projects.get(m.visit.project_id) ?? 'Another project'}: {m.visit.title} on {fmtShort(m.visit.day)} ({relative(m.days)})
            {m.visit.resource_id !== target.resource_id && m.sharedContacts.length > 0 && ` · same person: ${m.sharedContacts.map(contactName).join(', ')}`}
            {m.visit.status && ` · ${STATUS_LABELS[m.visit.status as MeetingStatus]}`}
          </li>
        ))}
      </ul>
    </div>
  )
}
