import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TabProps } from '../pages/Project'
import { must, supabase } from '../supabase'
import type { Contact, Project } from '../types'
import { act, blankContact, ContactsEditor, Field, useData } from '../ui'

type Hotel = Pick<Project, 'hotel_name' | 'hotel_address' | 'hotel_phone' | 'hotel_contact_name' | 'hotel_contact_email' | 'hotel_rate' | 'hotel_blurb'>

// Most recent details for each hotel used before, so they don't need retyping.
async function loadHotels(excludeId: string): Promise<Hotel[]> {
  const rows = must(
    await supabase
      .from('projects')
      .select('hotel_name, hotel_address, hotel_phone, hotel_contact_name, hotel_contact_email, hotel_rate, hotel_blurb')
      .neq('id', excludeId)
      .neq('hotel_name', '')
      .order('arrival_date', { ascending: false }),
  ) as Hotel[]
  const seen = new Set<string>()
  return rows.filter((h) => !seen.has(h.hotel_name) && seen.add(h.hotel_name))
}

export default function Overview({ data, reload }: TabProps) {
  const navigate = useNavigate()
  const [form, setForm] = useState<Project>(data.project)
  const [saved, setSaved] = useState(false)
  const hotels = useData(() => loadHotels(data.project.id), [data.project.id]).data ?? []
  const set = (patch: Partial<Project>) => {
    setForm({ ...form, ...patch })
    setSaved(false)
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(data.project)

  async function save(e: FormEvent) {
    e.preventDefault()
    const { id, created_at, closed_at, ...fields } = form
    void created_at
    void closed_at
    const ok = await act(async () => must(await supabase.from('projects').update(fields).eq('id', id)))
    if (!ok) return
    await reload()
    setSaved(true)
  }

  async function remove() {
    if (!confirm(`Permanently delete "${data.project.name}" with its checklist, participants and schedule? This cannot be undone.`)) return
    const ok = await act(async () => must(await supabase.from('projects').delete().eq('id', data.project.id)))
    if (ok) navigate('/projects')
  }

  const text = (key: keyof Project, label: string, placeholder = '') => (
    <Field label={label}>
      <input value={form[key] as string} placeholder={placeholder} onChange={(e) => set({ [key]: e.target.value })} />
    </Field>
  )

  return (
    <form className="stack" onSubmit={save}>
      <div className="savebar">
        <button className="btn primary" disabled={!dirty}>
          Save changes
        </button>
        {saved && !dirty && <span className="muted small">Saved ✓</span>}
        {dirty && <span className="muted small">Unsaved changes</span>}
      </div>

      <section className="card form">
        <h2>Project</h2>
        <div className="grid">
          <Field label="Program type">
            <select value={form.program_type_id} onChange={(e) => set({ program_type_id: e.target.value })}>
              {data.types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          {text('name', 'Project name')}
          {text('subtitle', 'Subtitle (itinerary cover)', 'A Single Country Project for China')}
          {text('countries', 'Countries')}
          <Field label="Accepted on">
            <input type="date" value={form.accepted_on} onChange={(e) => set({ accepted_on: e.target.value })} />
          </Field>
          <Field label="Arrival in KC">
            <input type="date" value={form.arrival_date} onChange={(e) => set({ arrival_date: e.target.value })} />
          </Field>
          <Field label="Departure from KC">
            <input type="date" min={form.arrival_date} value={form.departure_date} onChange={(e) => set({ departure_date: e.target.value })} />
          </Field>
          <Field label="SharePoint folder">
            <div className="row nowrap">
              <input value={form.sharepoint_url} onChange={(e) => set({ sharepoint_url: e.target.value })} placeholder="https://…" />
              {form.sharepoint_url && (
                <a className="btn small" href={form.sharepoint_url} target="_blank" rel="noreferrer">
                  Open
                </a>
              )}
            </div>
          </Field>
        </div>
        <div className="row">
          <label className="toggle">
            <input type="checkbox" checked={form.home_hospitality} onChange={(e) => set({ home_hospitality: e.target.checked })} /> Home hospitality
          </label>
          <label className="toggle">
            <input type="checkbox" checked={form.has_event} onChange={(e) => set({ has_event: e.target.checked })} /> Event
          </label>
        </div>
        <p className="muted small">Changing the program type does not change the existing checklist.</p>
      </section>

      <section className="card form">
        <h2>National Program Agency</h2>
        {text('npa_org', 'Organization', 'Meridian International Center')}
        <h3>Program Manager</h3>
        <PersonFields value={form.npa_manager} onChange={(npa_manager) => set({ npa_manager })} />
        <h3>Program Associate</h3>
        <PersonFields value={form.npa_associate} onChange={(npa_associate) => set({ npa_associate })} />
        <p className="muted small">Both are included on NPA emails. The Program Manager is the billing contact in hotel and transportation emails.</p>
        <h3>Office of International Visitors (State Department)</h3>
        <ContactsEditor value={form.oiv_contacts} onChange={(oiv_contacts) => set({ oiv_contacts })} blank={blankContact} />
      </section>

      <section className="card form">
        <div className="row spread">
          <h2>Hotel</h2>
          {hotels.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const h = hotels.find((x) => x.hotel_name === e.target.value)
                if (h) set(h)
              }}
              aria-label="Use a previous hotel"
            >
              <option value="">Use a previous hotel…</option>
              {hotels.map((h) => (
                <option key={h.hotel_name}>{h.hotel_name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="grid">
          {text('hotel_name', 'Hotel name')}
          {text('hotel_address', 'Address')}
          {text('hotel_phone', 'Phone')}
          {text('hotel_rate', 'GSA rate', '$150')}
          {text('hotel_contact_name', 'Hotel contact name')}
          {text('hotel_contact_email', 'Hotel contact email')}
        </div>
        <Field label="Welcome paragraph (itinerary)" wide>
          <textarea rows={4} value={form.hotel_blurb} onChange={(e) => set({ hotel_blurb: e.target.value })} />
        </Field>
      </section>

      <section className="card form">
        <h2>Agenda Kansas City driver</h2>
        <div className="grid">
          {text('driver_name', 'Driver name')}
          {text('driver_phone', 'Driver phone')}
        </div>
        <p className="muted small">Listed under Local Transportation on the itinerary.</p>
      </section>

      <section className="card form">
        <h2>Notes</h2>
        <textarea rows={5} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
      </section>

      <div className="danger-zone">
        <button type="button" className="btn ghost danger" onClick={remove}>
          Delete project
        </button>
      </div>
    </form>
  )
}

function PersonFields({ value, onChange }: { value: Contact; onChange: (c: Contact) => void }) {
  const field = (key: keyof Contact, label: string) => (
    <Field label={label}>
      <input value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })} />
    </Field>
  )
  return (
    <div className="grid">
      {field('name', 'Name')}
      {field('phone', 'Phone')}
      {field('email', 'Email')}
    </div>
  )
}
