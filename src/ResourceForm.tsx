import { useState, type FormEvent } from 'react'
import { CATEGORIES, CATEGORY_LABELS, geocode } from './resources'
import { must, supabase } from './supabase'
import type { Resource, ResourceCategory, ResourceContact } from './types'
import { act, ContactsEditor, Field } from './ui'

type Draft = Omit<Resource, 'id' | 'created_at'>

const BLANK: Draft = {
  name: '',
  category: 'nonprofit',
  address: '',
  lat: null,
  lng: null,
  location: '',
  directions: '',
  description: '',
  website: '',
  contacts: [],
  notes: '',
}

const blankContact = (): ResourceContact => ({ id: crypto.randomUUID(), name: '', title: '', phone: '', email: '' })

// Create or edit a resource. A changed address is looked up on save; if it can't be
// found, the resource still saves and the pin can be placed by hand (onRequestPin).
export default function ResourceForm({
  resource,
  initialName = '',
  onSaved,
  onCancel,
  onRequestPin,
}: {
  resource?: Resource
  initialName?: string
  onSaved: (saved: Resource, notice: string | null) => void
  onCancel: () => void
  onRequestPin?: (place: (lat: number, lng: number) => void) => void
}) {
  const [form, setForm] = useState<Draft>(() => {
    if (!resource) return { ...BLANK, name: initialName }
    const { id, created_at, ...rest } = resource
    void [id, created_at]
    return rest
  })
  const [pinnedByHand, setPinnedByHand] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<Draft>) => setForm((f) => ({ ...f, ...patch }))
  const text = (key: 'name' | 'location' | 'website', label: string, placeholder = '') => (
    <Field label={label}>
      <input required={key === 'name'} value={form[key]} placeholder={placeholder} onChange={(e) => set({ [key]: e.target.value })} />
    </Field>
  )

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    let draft = form
    let notice: string | null = null
    const addressChanged = !resource || resource.address !== form.address
    if (addressChanged && !pinnedByHand) {
      if (!form.address.trim()) draft = { ...form, lat: null, lng: null }
      else {
        try {
          const hit = await geocode(form.address)
          draft = { ...form, lat: hit?.lat ?? null, lng: hit?.lng ?? null }
          if (!hit) notice = `Couldn't find "${form.address}" on the map. Open the resource and use "Set pin on map" to place it.`
        } catch (err) {
          draft = { ...form, lat: null, lng: null }
          notice = `${(err as Error).message}. The resource was saved without a map pin.`
        }
      }
    }
    let saved: Resource | undefined
    const ok = await act(async () => {
      saved = must(
        resource
          ? await supabase.from('resources').update(draft).eq('id', resource.id).select('*').single()
          : await supabase.from('resources').insert(draft).select('*').single(),
      ) as Resource
    })
    setBusy(false)
    if (ok && saved) onSaved(saved, notice)
  }

  return (
    <form className="card form resource-form" onSubmit={submit}>
      <h2>{resource ? `Edit ${resource.name}` : 'New resource'}</h2>
      <div className="grid">
        {text('name', 'Organization / place', 'Nonprofit Connect')}
        <Field label="Category">
          <select value={form.category} onChange={(e) => set({ category: e.target.value as ResourceCategory })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        {text('website', 'Website')}
      </div>
      <div className="grid">
        <Field label="Street address">
          <textarea
            rows={2}
            value={form.address}
            placeholder={'1703 Wyandotte St Ste 100\nKansas City, MO 64108'}
            onChange={(e) => {
              set({ address: e.target.value })
              setPinnedByHand(false)
            }}
          />
        </Field>
        {text('location', 'Building / room', 'Bloch Executive Hall, Room 414')}
      </div>
      <div className="row">
        <span className="muted small">
          {form.lat !== null ? (pinnedByHand ? 'Pin placed by hand ✓' : 'On the map ✓') : 'Not on the map yet. The address is looked up when you save.'}
        </span>
        {onRequestPin && (
          <button
            type="button"
            className="btn small"
            onClick={() =>
              onRequestPin((lat, lng) => {
                set({ lat, lng })
                setPinnedByHand(true)
              })
            }
          >
            Set pin on map
          </button>
        )}
      </div>
      <Field label="How to get to the meeting space" wide>
        <textarea rows={2} value={form.directions} onChange={(e) => set({ directions: e.target.value })} />
      </Field>
      <Field label="Description (itinerary)" wide>
        <textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <div className="field wide">
        <span>Contacts</span>
        <ContactsEditor value={form.contacts} onChange={(contacts) => set({ contacts })} blank={blankContact} />
      </div>
      <Field label="Internal notes" wide>
        <textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Best times, parking, past feedback…" />
      </Field>
      <div className="row">
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save resource'}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
