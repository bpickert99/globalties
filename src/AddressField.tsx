import { useState } from 'react'
import { lookupAddress, type AddressMatch } from './resources'

// An address box with a "Look up" button: the typed address is searched on the map and the
// chosen match fills the box in "street / City, ST ZIP" form. Fields with a map pin take the
// match through onPick (address and pin together) instead of onChange.
export default function AddressField({
  value,
  onChange,
  onPick,
  multiline = false,
  placeholder,
  label,
}: {
  value: string
  onChange: (address: string) => void
  onPick?: (address: string, lat: number, lng: number) => void
  multiline?: boolean
  placeholder?: string
  label?: string
}) {
  const [matches, setMatches] = useState<AddressMatch[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const join = (m: AddressMatch) => [m.street, m.cityLine].filter(Boolean).join(multiline ? '\n' : ', ')

  async function look() {
    setBusy(true)
    setError(null)
    setMatches(null)
    try {
      setMatches(await lookupAddress(value, 5))
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  function pick(m: AddressMatch) {
    if (onPick) onPick(join(m), m.lat, m.lng)
    else onChange(join(m))
    setMatches(null)
  }

  return (
    <div className="address-field">
      <div className="address-input">
        {multiline ? (
          <textarea rows={2} aria-label={label} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input aria-label={label} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        )}
        <button type="button" className="btn small" disabled={busy || !value.trim()} onClick={look}>
          {busy ? 'Looking…' : 'Look up'}
        </button>
      </div>
      {error && <div className="small error">{error}</div>}
      {matches && (
        <div className="address-matches" role="listbox" aria-label="Address matches">
          {matches.length === 0 && <div className="muted small">No match on the map. Check the street number and city, then look up again.</div>}
          {matches.map((m, i) => (
            <button type="button" role="option" aria-selected={false} key={i} onClick={() => pick(m)}>
              <b>{m.street}</b> <span className="muted">{m.cityLine}</span>
            </button>
          ))}
          <button type="button" className="link small" onClick={() => setMatches(null)}>
            Keep what I typed
          </button>
        </div>
      )}
    </div>
  )
}
