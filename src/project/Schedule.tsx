import { useState, type FormEvent } from 'react'
import { dayRange, fmtLong, fmtTimeRange } from '../dates'
import { activePeople, fullName, KIND_LABELS, sortItems, STATUS_LABELS } from '../logic'
import type { TabProps } from '../pages/Project'
import { must, supabase } from '../supabase'
import type { HostGroup, ItemKind, MeetingStatus, Restaurant, ScheduleItem } from '../types'
import { act, ContactsEditor, Field, useData } from '../ui'

type Draft = Omit<ScheduleItem, 'id' | 'project_id' | 'created_at' | 'status_changed_at'>

const blank = (day: string): Draft => ({
  day,
  start_time: null,
  end_time: null,
  kind: 'meeting',
  title: '',
  location: '',
  address: '',
  directions: '',
  contacts: [],
  topic: '',
  description: '',
  restaurants: [],
  hh_groups: [],
  status: 'planned',
  internal_notes: '',
})

const STATUSES = Object.keys(STATUS_LABELS) as MeetingStatus[]
const HAS_PLACE: ItemKind[] = ['meeting', 'activity', 'home_hospitality', 'meal']
const HAS_DETAILS: ItemKind[] = ['meeting', 'activity']

// Past meetings/activities from other projects, most recent per title, to reuse details.
async function loadPast(projectId: string): Promise<ScheduleItem[]> {
  const rows = must(
    await supabase.from('schedule_items').select('*').in('kind', ['meeting', 'activity']).neq('project_id', projectId).order('day', { ascending: false }),
  ) as ScheduleItem[]
  const seen = new Set<string>()
  return rows.filter((r) => !seen.has(r.title) && seen.add(r.title))
}

export default function Schedule({ data, reload }: TabProps) {
  const { project } = data
  const [editing, setEditing] = useState<{ id: string | null; day: string } | null>(null)
  const past = useData(() => loadPast(project.id), [project.id]).data ?? []
  const items = sortItems(data.items)
  const days = dayRange(project.arrival_date, project.departure_date)
  const outside = items.filter((i) => !days.includes(i.day))
  const meetings = items.filter((i) => i.kind === 'meeting')

  async function setStatus(item: ScheduleItem, status: MeetingStatus) {
    await act(async () => must(await supabase.from('schedule_items').update({ status, status_changed_at: new Date().toISOString() }).eq('id', item.id)))
    await reload()
  }

  const itemRow = (item: ScheduleItem) =>
    editing?.id === item.id ? (
      <ItemForm key={item.id} data={data} item={item} day={item.day} past={past} onDone={() => setEditing(null)} reload={reload} />
    ) : (
      <div key={item.id} className={`item kind-${item.kind}`} onClick={() => setEditing({ id: item.id, day: item.day })}>
        <div className="item-time">{fmtTimeRange(item.start_time, item.end_time)}</div>
        <div className="item-main">
          <div className="item-title">{item.title}</div>
          <div className="muted small">
            {KIND_LABELS[item.kind]}
            {item.address && ` · ${item.address.split('\n')[0]}`}
            {item.contacts[0] && ` · ${item.contacts[0].name}`}
          </div>
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

  return (
    <div className="stack">
      <div className="stats">
        {STATUSES.map((s) => (
          <span key={s} className={`status-${s}`}>
            <b>{meetings.filter((m) => m.status === s).length}</b> {STATUS_LABELS[s].toLowerCase()}
          </span>
        ))}
      </div>
      {days.map((day) => (
        <section key={day} className="card day">
          <div className="row spread">
            <h2>{fmtLong(day)}</h2>
            <button className="btn small" onClick={() => setEditing({ id: null, day })}>
              + Add
            </button>
          </div>
          {items.filter((i) => i.day === day).map(itemRow)}
          {editing && editing.id === null && editing.day === day && (
            <ItemForm data={data} day={day} past={past} onDone={() => setEditing(null)} reload={reload} />
          )}
        </section>
      ))}
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

function ItemForm({
  data,
  item,
  day,
  past,
  onDone,
  reload,
}: {
  data: TabProps['data']
  item?: ScheduleItem
  day: string
  past: ScheduleItem[]
  onDone: () => void
  reload: () => Promise<void>
}) {
  const [form, setForm] = useState<Draft>(() => {
    if (!item) return blank(day)
    const { id, project_id, created_at, status_changed_at, ...rest } = item
    void [id, project_id, created_at, status_changed_at]
    return rest
  })
  const set = (patch: Partial<Draft>) => setForm({ ...form, ...patch })
  const kind = form.kind

  function setKind(k: ItemKind) {
    set({ kind: k, status: k === 'meeting' ? (form.status ?? 'planned') : null })
  }

  function setTitle(title: string) {
    const match = past.find((p) => p.title === title)
    if (match && !item) {
      set({ title, location: match.location, address: match.address, directions: match.directions, contacts: match.contacts, topic: match.topic, description: match.description })
    } else set({ title })
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

  return (
    <form className="item-form" onSubmit={submit}>
      <div className="grid">
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value as ItemKind)}>
            {Object.entries(KIND_LABELS).map(([k, l]) => (
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
            <Field label="Start">
              <input type="time" value={form.start_time?.slice(0, 5) ?? ''} onChange={(e) => set({ start_time: e.target.value || null })} />
            </Field>
            <Field label="End">
              <input type="time" value={form.end_time?.slice(0, 5) ?? ''} onChange={(e) => set({ end_time: e.target.value || null })} />
            </Field>
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
      <Field label={kind === 'note' ? 'Note text (italic in itinerary)' : kind === 'meeting' ? 'Organization / meeting title' : 'Title'} wide>
        <input
          required
          list={HAS_DETAILS.includes(kind) ? 'past-titles' : undefined}
          value={form.title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'flight' ? 'Arrive on American Airlines #3764 from Chicago, IL' : kind === 'transport' ? 'Depart Hotel' : kind === 'meal' ? 'Lunch' : ''}
        />
        <datalist id="past-titles">
          {past.map((p) => (
            <option key={p.id} value={p.title} />
          ))}
        </datalist>
      </Field>
      {HAS_DETAILS.includes(kind) && !item && past.length > 0 && <p className="muted small">Pick an organization you've used before to fill in its address, contact and description.</p>}
      {HAS_PLACE.includes(kind) && kind !== 'meal' && kind !== 'home_hospitality' && (
        <div className="grid">
          <Field label="Location (building, room)">
            <input value={form.location} onChange={(e) => set({ location: e.target.value })} />
          </Field>
          <Field label="Address">
            <textarea rows={2} value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
        </div>
      )}
      {HAS_DETAILS.includes(kind) && (
        <>
          <Field label="How to get to the meeting space" wide>
            <textarea rows={2} value={form.directions} onChange={(e) => set({ directions: e.target.value })} />
          </Field>
          <div className="field wide">
            <span>Contacts</span>
            <ContactsEditor value={form.contacts} onChange={(contacts) => set({ contacts })} />
          </div>
          <Field label="Topic" wide>
            <textarea rows={2} value={form.topic} onChange={(e) => set({ topic: e.target.value })} />
          </Field>
        </>
      )}
      {(HAS_DETAILS.includes(kind) || kind === 'home_hospitality') && (
        <Field label={kind === 'home_hospitality' ? 'Introduction' : 'Organization description'} wide>
          <textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
      )}
      {kind === 'meal' && <RestaurantsEditor value={form.restaurants} onChange={(restaurants) => set({ restaurants })} />}
      {kind === 'home_hospitality' && <HostGroupsEditor data={data} value={form.hh_groups} onChange={(hh_groups) => set({ hh_groups })} />}
      <Field label="Internal notes (not in itinerary)" wide>
        <textarea rows={2} value={form.internal_notes} onChange={(e) => set({ internal_notes: e.target.value })} />
      </Field>
      <div className="row">
        <button className="btn primary">Save</button>
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

function HostGroupsEditor({ data, value, onChange }: { data: TabProps['data']; value: HostGroup[]; onChange: (v: HostGroup[]) => void }) {
  const people = activePeople(data.people)
  const set = (i: number, patch: Partial<HostGroup>) => onChange(value.map((g, j) => (j === i ? { ...g, ...patch } : g)))
  const assigned = new Set(value.flatMap((g) => g.participant_ids))
  return (
    <div className="field wide">
      <span>Host groups</span>
      {value.map((g, i) => (
        <div key={i} className="host-group">
          <div className="row spread">
            <b>Group {i + 1}</b>
            <button type="button" className="btn small ghost" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              Remove group
            </button>
          </div>
          <div className="grid">
            <Field label="Host name(s)">
              <input value={g.host} onChange={(e) => set(i, { host: e.target.value })} />
            </Field>
            <Field label="Address">
              <input value={g.address} onChange={(e) => set(i, { address: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input value={g.phone} onChange={(e) => set(i, { phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <input value={g.email} onChange={(e) => set(i, { email: e.target.value })} />
            </Field>
          </div>
          <Field label="Host bio (itinerary)" wide>
            <textarea rows={2} value={g.bio} onChange={(e) => set(i, { bio: e.target.value })} />
          </Field>
          <div className="checks">
            {people.map((p) => (
              <label key={p.id} className={assigned.has(p.id) && !g.participant_ids.includes(p.id) ? 'toggle muted' : 'toggle'}>
                <input
                  type="checkbox"
                  checked={g.participant_ids.includes(p.id)}
                  onChange={(e) =>
                    set(i, { participant_ids: e.target.checked ? [...g.participant_ids, p.id] : g.participant_ids.filter((x) => x !== p.id) })
                  }
                />
                {fullName(p)}
                {p.role !== 'participant' && ` (${p.role})`}
              </label>
            ))}
            {people.length === 0 && <span className="muted small">Add participants first.</span>}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn small ghost"
        onClick={() => onChange([...value, { host: '', address: '', phone: '', email: '', bio: '', participant_ids: [] }])}
      >
        + Add host group
      </button>
    </div>
  )
}
