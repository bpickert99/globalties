import { useState, type FormEvent } from 'react'
import { EMAIL_LABELS } from '../emails'
import { must, supabase } from '../supabase'
import type { Anchor, EmailKey, ProgramType, Requires, Settings, Staff, TaskTemplate } from '../types'
import { act, Field, Loading, useData } from '../ui'

async function load() {
  const [settings, staff, types, templates, members] = await Promise.all([
    supabase.from('settings').select('*').single(),
    supabase.from('staff').select('*').order('sort'),
    supabase.from('program_types').select('*').order('sort'),
    supabase.from('task_templates').select('*').order('sort'),
    supabase.from('members').select('email'),
  ])
  return {
    settings: must(settings) as Settings,
    staff: must(staff) as Staff[],
    types: must(types) as ProgramType[],
    templates: must(templates) as TaskTemplate[],
    members: must(members) as { email: string }[],
  }
}

export default function SettingsPage() {
  const { data, error, reload } = useData(load, [])
  if (!data) return <Loading error={error} />
  return (
    <div className="stack">
      <h1>Settings</h1>
      <OrgSettings settings={data.settings} onSaved={reload} />
      <StaffEditor staff={data.staff} onSaved={reload} />
      <Checklists types={data.types} templates={data.templates} onSaved={reload} />
      <section className="card">
        <h2>Who has access</h2>
        <ul>
          {data.members.map((m) => (
            <li key={m.email}>{m.email}</li>
          ))}
        </ul>
        <p className="muted small">To give a colleague access, they create an account and their email is added to the members list in the database.</p>
      </section>
    </div>
  )
}

function OrgSettings({ settings, onSaved }: { settings: Settings; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState(settings)
  const dirty = JSON.stringify(form) !== JSON.stringify(settings)
  const text = (key: keyof Omit<Settings, 'id'>, label: string) => (
    <Field label={label}>
      <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </Field>
  )

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (await act(async () => must(await supabase.from('settings').update(form).eq('id', true)))) await onSaved()
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Office & emails</h2>
      <div className="grid">
        <Field label="Office address (itinerary)">
          <textarea rows={3} value={form.office_address} onChange={(e) => setForm({ ...form, office_address: e.target.value })} />
        </Field>
        <Field label="Local transportation block (itinerary)">
          <textarea rows={5} value={form.transport_block} onChange={(e) => setForm({ ...form, transport_block: e.target.value })} />
        </Field>
        {text('transport_contact_name', 'Transportation contact first name')}
        {text('transport_email', 'Transportation email')}
        {text('cc_name', 'Colleague to cc (name)')}
        {text('cc_email', 'Colleague to cc (email)')}
        {text('ceo_email', 'President & CEO email (cc on thank-yous)')}
        {text('survey_url', 'Feedback survey link')}
      </div>
      <button className="btn primary" disabled={!dirty}>
        Save
      </button>
    </form>
  )
}

function StaffEditor({ staff, onSaved }: { staff: Staff[]; onSaved: () => Promise<void> }) {
  const [rows, setRows] = useState(staff)
  const dirty = JSON.stringify(rows) !== JSON.stringify(staff)
  const set = (i: number, patch: Partial<Staff>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  async function save() {
    const ok = await act(async () => {
      const keep = rows.filter((r) => r.id).map((r) => r.id)
      const removed = staff.filter((s) => !keep.includes(s.id)).map((s) => s.id)
      if (removed.length) must(await supabase.from('staff').delete().in('id', removed))
      for (const [i, r] of rows.entries()) {
        const { id, ...fields } = r
        const payload = { ...fields, sort: i }
        must(id ? await supabase.from('staff').update(payload).eq('id', id) : await supabase.from('staff').insert(payload))
      }
    })
    if (ok) await onSaved()
  }

  return (
    <section className="card form">
      <h2>Staff on itineraries</h2>
      <p className="muted small">Listed in this order on the itinerary contacts page. Mark who is the emergency contact.</p>
      {rows.map((r, i) => (
        <div key={r.id || `new-${i}`} className="contact-row staff-row">
          <input placeholder="Name" value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
          <input placeholder="Title" value={r.title} onChange={(e) => set(i, { title: e.target.value })} />
          <input placeholder="Office phone" value={r.office_phone} onChange={(e) => set(i, { office_phone: e.target.value })} />
          <input placeholder="Mobile phone" value={r.mobile_phone} onChange={(e) => set(i, { mobile_phone: e.target.value })} />
          <input placeholder="Email" value={r.email} onChange={(e) => set(i, { email: e.target.value })} />
          <label className="toggle">
            <input type="checkbox" checked={r.emergency_contact} onChange={(e) => set(i, { emergency_contact: e.target.checked })} /> Emergency
          </label>
          <button type="button" className="btn small ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove">
            ✕
          </button>
        </div>
      ))}
      <div className="row">
        <button
          type="button"
          className="btn small ghost"
          onClick={() => setRows([...rows, { id: '', name: '', title: '', office_phone: '', mobile_phone: '', email: '', emergency_contact: false, sort: rows.length }])}
        >
          + Add staff
        </button>
        <button type="button" className="btn primary" disabled={!dirty} onClick={save}>
          Save staff
        </button>
      </div>
    </section>
  )
}

const ANCHOR_LABEL: Record<Anchor, string> = { accepted: 'accepted', arrival: 'arrival', departure: 'departure' }

function describeOffset(t: Pick<TaskTemplate, 'anchor' | 'offset_days'>): string {
  const n = Math.abs(t.offset_days)
  if (n === 0) return `on ${ANCHOR_LABEL[t.anchor]}`
  return `${n} day${n === 1 ? '' : 's'} ${t.offset_days < 0 ? 'before' : 'after'} ${ANCHOR_LABEL[t.anchor]}`
}

function Checklists({ types, templates, onSaved }: { types: ProgramType[]; templates: TaskTemplate[]; onSaved: () => Promise<void> }) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? '')
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const type = types.find((t) => t.id === typeId)
  const list = templates.filter((t) => t.program_type_id === typeId)

  async function addType() {
    const name = prompt('Name of the new program type (its checklist starts as a copy of the current one):')?.trim()
    if (!name || !type) return
    let newId = ''
    const ok = await act(async () => {
      newId = (must(await supabase.from('program_types').insert({ name, sort: types.length + 1, itinerary_intro: type.itinerary_intro }).select('id').single()) as { id: string }).id
      const copies = list.map(({ id, program_type_id, ...rest }) => {
        void [id, program_type_id]
        return { ...rest, program_type_id: newId }
      })
      if (copies.length) must(await supabase.from('task_templates').insert(copies))
    })
    if (!ok) return
    await onSaved()
    setTypeId(newId)
  }

  async function saveIntro(itinerary_intro: string) {
    if (!type || itinerary_intro === type.itinerary_intro) return
    if (await act(async () => must(await supabase.from('program_types').update({ itinerary_intro }).eq('id', type.id)))) await onSaved()
  }

  async function remove(t: TaskTemplate) {
    if (!confirm(`Remove "${t.title}" from the ${type?.name} checklist? Existing projects keep their tasks.`)) return
    if (await act(async () => must(await supabase.from('task_templates').delete().eq('id', t.id)))) await onSaved()
  }

  return (
    <section className="card form">
      <div className="row spread">
        <h2>Checklists by program type</h2>
        <div className="row">
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label="Program type">
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn small" onClick={addType}>
            + New program type
          </button>
        </div>
      </div>
      <p className="muted small">Changes apply to projects created from now on. Existing projects keep their own checklist.</p>
      {type && (
        <Field label="Itinerary cover introduction" wide>
          <textarea key={type.id} rows={3} defaultValue={type.itinerary_intro} onBlur={(e) => saveIntro(e.target.value)} />
        </Field>
      )}
      <table className="templates">
        <tbody>
          {list.map((t, i) =>
            editing === t.id ? (
              <tr key={t.id}>
                <td colSpan={3}>
                  <TemplateForm template={t} typeId={typeId} onDone={() => setEditing(null)} onSaved={onSaved} />
                </td>
              </tr>
            ) : (
              <tr key={t.id}>
                <td>
                  {(i === 0 || list[i - 1].phase !== t.phase) && <div className="phase">{t.phase}</div>}
                  <b>{t.title}</b>
                  {t.requires !== 'none' && <span className="chip subtle">{t.requires === 'home_hospitality' ? 'Home hospitality' : 'Event'}</span>}
                  {t.details && <div className="muted small">{t.details}</div>}
                </td>
                <td className="muted small nowrap">{describeOffset(t)}</td>
                <td className="actions">
                  <button type="button" className="btn small" onClick={() => setEditing(t.id)}>
                    Edit
                  </button>
                  <button type="button" className="btn small ghost" onClick={() => remove(t)}>
                    ✕
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {editing === 'new' ? (
        <TemplateForm typeId={typeId} nextSort={(list[list.length - 1]?.sort ?? 0) + 10} onDone={() => setEditing(null)} onSaved={onSaved} />
      ) : (
        <button type="button" className="btn small ghost" onClick={() => setEditing('new')}>
          + Add checklist item
        </button>
      )}
    </section>
  )
}

function TemplateForm({
  template,
  typeId,
  nextSort = 0,
  onDone,
  onSaved,
}: {
  template?: TaskTemplate
  typeId: string
  nextSort?: number
  onDone: () => void
  onSaved: () => Promise<void>
}) {
  const [form, setForm] = useState<Omit<TaskTemplate, 'id'>>(
    template ?? { program_type_id: typeId, phase: '', title: '', details: '', anchor: 'arrival', offset_days: -7, requires: 'none', email_key: null, sort: nextSort },
  )
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch })

  async function save() {
    const ok = await act(async () =>
      must(template ? await supabase.from('task_templates').update(form).eq('id', template.id) : await supabase.from('task_templates').insert(form)),
    )
    if (!ok) return
    onDone()
    await onSaved()
  }

  return (
    <div className="item-form">
      <div className="grid">
        <Field label="Phase">
          <input value={form.phase} onChange={(e) => set({ phase: e.target.value })} />
        </Field>
        <Field label="Task">
          <input value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Days (negative = before)">
          <input type="number" value={form.offset_days} onChange={(e) => set({ offset_days: Number(e.target.value) })} />
        </Field>
        <Field label="Relative to">
          <select value={form.anchor} onChange={(e) => set({ anchor: e.target.value as Anchor })}>
            <option value="accepted">Accepted date</option>
            <option value="arrival">Arrival</option>
            <option value="departure">Departure</option>
          </select>
        </Field>
        <Field label="Only when">
          <select value={form.requires} onChange={(e) => set({ requires: e.target.value as Requires })}>
            <option value="none">Always</option>
            <option value="home_hospitality">Home hospitality</option>
            <option value="event">Event</option>
          </select>
        </Field>
        <Field label="Email draft">
          <select value={form.email_key ?? ''} onChange={(e) => set({ email_key: (e.target.value || null) as EmailKey | null })}>
            <option value="">None</option>
            {Object.entries(EMAIL_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Order">
          <input type="number" value={form.sort} onChange={(e) => set({ sort: Number(e.target.value) })} />
        </Field>
      </div>
      <Field label="Details" wide>
        <textarea rows={2} value={form.details} onChange={(e) => set({ details: e.target.value })} />
      </Field>
      <div className="row">
        <button type="button" className="btn primary" onClick={save} disabled={!form.title.trim() || !form.phase.trim()}>
          Save
        </button>
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  )
}
