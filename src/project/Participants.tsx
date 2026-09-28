import { useState, type FormEvent } from 'react'
import { activePeople, fullName } from '../logic'
import type { TabProps } from '../pages/Project'
import { must, supabase } from '../supabase'
import type { MediaConsent, Participant, ParticipantRole } from '../types'
import { act, Field } from '../ui'

type Draft = Omit<Participant, 'id' | 'project_id' | 'cancelled_at' | 'created_at'>

const BLANK: Draft = {
  role: 'participant',
  given_name: '',
  family_name: '',
  position: '',
  country: '',
  phone: '',
  email: '',
  dietary: '',
  media_consent: 'unknown',
  arrival_flight: '',
  departure_flight: '',
  hotel_confirmation: '',
  bio: '',
  notes: '',
  sort: 0,
}

const ROLE_LABEL: Record<ParticipantRole, string> = { participant: 'Participant', interpreter: 'Interpreter', liaison: 'Liaison' }
const CONSENT_LABEL: Record<MediaConsent, string> = { unknown: '?', yes: 'Yes', no: 'No' }

export default function Participants({ data, reload }: TabProps) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const active = activePeople(data.people)
  const cancelled = data.people.filter((p) => p.cancelled_at)
  const count = (role: ParticipantRole) => active.filter((p) => p.role === role).length
  const noConsent = active.filter((p) => p.media_consent === 'no')
  const unknownConsent = active.filter((p) => p.media_consent === 'unknown')

  async function setCancelled(p: Participant, cancelled: boolean) {
    await act(async () => must(await supabase.from('participants').update({ cancelled_at: cancelled ? new Date().toISOString() : null }).eq('id', p.id)))
    await reload()
  }

  async function remove(p: Participant) {
    if (!confirm(`Permanently delete ${fullName(p)}? (Use "Cancel" instead to keep a record.)`)) return
    await act(async () => must(await supabase.from('participants').delete().eq('id', p.id)))
    await reload()
  }

  const row = (p: Participant) => (
    <tr key={p.id} className={p.cancelled_at ? 'cancelled' : ''}>
      <td>
        <b>{fullName(p)}</b>
        <div className="muted small">{p.position}</div>
      </td>
      <td>{ROLE_LABEL[p.role]}</td>
      <td>{p.country}</td>
      <td>{p.dietary}</td>
      <td className={`consent-${p.media_consent}`}>{CONSENT_LABEL[p.media_consent]}</td>
      <td className="small">
        {p.arrival_flight}
        {p.departure_flight && <div>{p.departure_flight}</div>}
      </td>
      <td>{p.hotel_confirmation}</td>
      <td className="actions">
        <button className="btn small" onClick={() => setEditing(p.id)}>
          Edit
        </button>
        {p.cancelled_at ? (
          <>
            <button className="btn small ghost" onClick={() => setCancelled(p, false)}>
              Restore
            </button>
            <button className="btn small ghost danger" onClick={() => remove(p)}>
              Delete
            </button>
          </>
        ) : (
          <button className="btn small ghost" onClick={() => setCancelled(p, true)}>
            Cancel
          </button>
        )}
      </td>
    </tr>
  )

  const editingPerson = data.people.find((p) => p.id === editing)

  return (
    <div className="stack">
      <div className="row spread">
        <div className="stats">
          <span>
            <b>{count('participant')}</b> participants
          </span>
          <span>
            <b>{count('interpreter')}</b> interpreters
          </span>
          <span>
            <b>{count('liaison')}</b> liaisons
          </span>
          <span>
            <b>{active.length}</b> rooms
          </span>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>
          + Add person
        </button>
      </div>
      {noConsent.length > 0 && <p className="notice warn">No media consent: {noConsent.map(fullName).join(', ')}. Keep them out of photos in SharePoint and posts.</p>}
      {unknownConsent.length > 0 && <p className="notice">Media consent not yet recorded for {unknownConsent.length} people.</p>}
      {editing && (
        <PersonForm
          key={editing}
          projectId={data.project.id}
          person={editingPerson}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await reload()
          }}
        />
      )}
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Country</th>
              <th>Dietary</th>
              <th>Media</th>
              <th>Flights</th>
              <th>Hotel conf.</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {active.map(row)}
            {cancelled.length > 0 && (
              <tr className="divider">
                <td colSpan={8}>Cancelled</td>
              </tr>
            )}
            {cancelled.map(row)}
          </tbody>
        </table>
        {data.people.length === 0 && <p className="muted pad">No one added yet.</p>}
      </div>
    </div>
  )
}

function PersonForm({ projectId, person, onClose, onSaved }: { projectId: string; person?: Participant; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Draft>(() => {
    if (!person) return BLANK
    const { id, project_id, cancelled_at, created_at, ...rest } = person
    void [id, project_id, cancelled_at, created_at]
    return rest
  })
  const set = (patch: Partial<Draft>) => setForm({ ...form, ...patch })
  const text = (key: keyof Draft, label: string, placeholder = '') => (
    <Field label={label}>
      <input value={form[key] as string} placeholder={placeholder} onChange={(e) => set({ [key]: e.target.value })} />
    </Field>
  )

  async function submit(e: FormEvent) {
    e.preventDefault()
    const ok = await act(async () =>
      must(person ? await supabase.from('participants').update(form).eq('id', person.id) : await supabase.from('participants').insert({ ...form, project_id: projectId })),
    )
    if (ok) await onSaved()
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{person ? `Edit ${fullName(person)}` : 'Add person'}</h2>
      <div className="grid">
        <Field label="Role">
          <select value={form.role} onChange={(e) => set({ role: e.target.value as ParticipantRole })}>
            {Object.entries(ROLE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Given name">
          <input required value={form.given_name} onChange={(e) => set({ given_name: e.target.value })} />
        </Field>
        <Field label="Family name">
          <input required value={form.family_name} onChange={(e) => set({ family_name: e.target.value })} />
        </Field>
        {text('position', form.role === 'participant' ? 'Position, organization' : 'Title on itinerary', form.role === 'participant' ? 'Program Manager, Little Fish Charity' : 'Mandarin Language Interpreter')}
        {text('country', 'Country')}
        {text('phone', 'Phone')}
        {text('email', 'Email')}
        {text('dietary', 'Dietary needs', 'Vegetarian, halal, allergies…')}
        <Field label="Media consent">
          <select value={form.media_consent} onChange={(e) => set({ media_consent: e.target.value as MediaConsent })}>
            <option value="unknown">Not yet known</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        {text('arrival_flight', 'Arrival flight', 'AA #3764 3:22 pm')}
        {text('departure_flight', 'Departure flight', 'AS #418 1:34 pm')}
        {text('hotel_confirmation', 'Hotel confirmation #')}
      </div>
      <Field label="Short bio (for home hospitality hosts)" wide>
        <textarea rows={3} value={form.bio} onChange={(e) => set({ bio: e.target.value })} />
      </Field>
      <Field label="Internal notes" wide>
        <textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
      <div className="row">
        <button className="btn primary">Save</button>
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </form>
  )
}
