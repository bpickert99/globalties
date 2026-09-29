import { useState, type FormEvent } from 'react'
import { fmtShort, today } from './dates'
import type { Vendor, VendorLogEntry } from './types'

const NAMES: Record<Vendor, string> = { hotel: 'the hotel', agenda: 'Agenda' }

// Calls and emails with one vendor, stored in the project's shared vendor log.
export default function VendorLog({
  party,
  log,
  hint,
  placeholder,
  onChange,
}: {
  party: Vendor
  log: VendorLogEntry[]
  hint: string
  placeholder: string
  onChange: (log: VendorLogEntry[]) => Promise<void>
}) {
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const mine = log.filter((e) => e.party === party).sort((a, b) => b.date.localeCompare(a.date))

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    await onChange([...log, { date, party, note: note.trim() }])
    setNote('')
  }

  return (
    <section className="card form">
      <h2>Calls & emails with {NAMES[party]}</h2>
      <p className="muted small">{hint}</p>
      <form className="add-task call-form" onSubmit={add}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        <input placeholder={placeholder} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn primary">Add</button>
      </form>
      {mine.map((entry) => (
        <div key={`${entry.date}|${entry.note}`} className="log-entry">
          <span className="muted small nowrap">{fmtShort(entry.date)}</span>
          <span>{entry.note}</span>
          <button className="btn small ghost" onClick={() => onChange(log.filter((x) => x !== entry))} aria-label="Delete note">
            ✕
          </button>
        </div>
      ))}
    </section>
  )
}
