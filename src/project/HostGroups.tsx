import { activePeople, fullName } from '../logic'
import type { HostGroup, Participant } from '../types'
import { Field } from '../ui'

// Hosts with the visitors assigned to each: home hospitality dinner groups, or the host
// families a group stays with instead of a hotel.
export default function HostGroupsEditor({
  label,
  unit,
  people: all,
  value,
  onChange,
}: {
  label: string
  unit: 'group' | 'family'
  people: Participant[]
  value: HostGroup[]
  onChange: (v: HostGroup[]) => void
}) {
  const people = activePeople(all)
  const Unit = unit === 'group' ? 'Group' : 'Host family'
  const set = (i: number, patch: Partial<HostGroup>) => onChange(value.map((g, j) => (j === i ? { ...g, ...patch } : g)))
  const assigned = new Set(value.flatMap((g) => g.participant_ids))
  return (
    <div className="field wide">
      <span>{label}</span>
      {value.map((g, i) => (
        <div key={i} className="host-group">
          <div className="row spread">
            <b>
              {Unit} {i + 1}
            </b>
            <button type="button" className="btn small ghost" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              Remove {unit}
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
                  onChange={(e) => set(i, { participant_ids: e.target.checked ? [...g.participant_ids, p.id] : g.participant_ids.filter((x) => x !== p.id) })}
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
        + Add {unit === 'group' ? 'host group' : 'host family'}
      </button>
    </div>
  )
}
