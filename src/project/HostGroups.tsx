import { useState, type DragEvent } from 'react'
import GenderMark from '../GenderMark'
import { activePeople, fullName } from '../logic'
import type { HostGroup, Participant } from '../types'
import { Field } from '../ui'

// Hosts with the visitors assigned to each: home hospitality dinner groups, or the host
// families a group stays with instead of a hotel. Visitors are dragged from the "to place"
// pool onto a host, between hosts, or back to the pool.

const PERSON_MIME = 'application/x-gtkc-person'
const POOL = -1

const ROLE_TAG = { participant: '', interpreter: 'Interpreter', liaison: 'Liaison' } as const

function VisitorChip({ person, onRemove }: { person: Participant; onRemove?: () => void }) {
  return (
    <span
      className="visitor-chip"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(PERSON_MIME, person.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      title="Drag to a host"
    >
      <GenderMark gender={person.gender} />
      <span>
        {fullName(person)}
        {ROLE_TAG[person.role] && <span className="muted small"> · {ROLE_TAG[person.role]}</span>}
        {person.role === 'participant' && person.country && <span className="muted small"> · {person.country}</span>}
      </span>
      {onRemove && (
        <button type="button" className="chip-x" onClick={onRemove} aria-label={`Unassign ${fullName(person)}`}>
          ✕
        </button>
      )}
    </span>
  )
}

function genderCount(people: Participant[]): string {
  const f = people.filter((p) => p.gender === 'female').length
  const m = people.filter((p) => p.gender === 'male').length
  const u = people.length - f - m
  return [f && `${f} ♀`, m && `${m} ♂`, u && `${u} ?`].filter(Boolean).join(' · ')
}

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
  const [over, setOver] = useState<number | null>(null)
  const set = (i: number, patch: Partial<HostGroup>) => onChange(value.map((g, j) => (j === i ? { ...g, ...patch } : g)))
  const assigned = new Set(value.flatMap((g) => g.participant_ids))
  const pool = people.filter((p) => !assigned.has(p.id))
  const guests = (g: HostGroup) => people.filter((p) => g.participant_ids.includes(p.id))

  // Each visitor is with at most one host: moving removes them from wherever they were.
  function place(personId: string, target: number) {
    onChange(
      value.map((g, j) => {
        const without = g.participant_ids.filter((id) => id !== personId)
        return { ...g, participant_ids: j === target ? [...without, personId] : without }
      }),
    )
  }

  const dropZone = (target: number) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(PERSON_MIME)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setOver(target)
    },
    onDragLeave: () => setOver(null),
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(PERSON_MIME)) return
      e.preventDefault()
      setOver(null)
      place(e.dataTransfer.getData(PERSON_MIME), target)
    },
  })

  return (
    <div className="field wide host-board">
      <span>{label}</span>
      <div className={over === POOL ? 'visitor-pool drop-over' : 'visitor-pool'} {...dropZone(POOL)}>
        <div className="pool-head">
          <b>To place</b> <span className="muted small">{genderCount(pool) || 'Everyone is placed'}</span>
        </div>
        <div className="chip-row">
          {pool.map((p) => (
            <VisitorChip key={p.id} person={p} />
          ))}
          {people.length === 0 && <span className="muted small">Add participants first.</span>}
        </div>
      </div>
      <div className="host-cards">
        {value.map((g, i) => (
          <div key={i} className="host-card">
            <div className="row spread">
              <b>
                {Unit} {i + 1}
              </b>
              <button type="button" className="btn small ghost" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                Remove {unit}
              </button>
            </div>
            <div className={over === i ? 'host-guests drop-over' : 'host-guests'} {...dropZone(i)} aria-label={`Guests of ${Unit.toLowerCase()} ${i + 1}`}>
              <div className="pool-head">
                <b>Guests</b> <span className="muted small">{genderCount(guests(g))}</span>
              </div>
              <div className="chip-row">
                {guests(g).map((p) => (
                  <VisitorChip key={p.id} person={p} onRemove={() => place(p.id, POOL)} />
                ))}
                {guests(g).length === 0 && <span className="muted small">Drag visitors here</span>}
              </div>
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
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn small ghost add-host"
        onClick={() => onChange([...value, { host: '', address: '', phone: '', email: '', bio: '', participant_ids: [] }])}
      >
        + Add {unit === 'group' ? 'host group' : 'host family'}
      </button>
    </div>
  )
}
