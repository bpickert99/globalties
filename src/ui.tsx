import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Contact } from './types'

// Loads data on mount / when deps change; reload() refetches after a mutation.
export function useData<T>(load: () => Promise<T>, deps: unknown[]): { data: T | undefined; error: string | null; reload: () => Promise<void> } {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(load, deps)
  const reload = useCallback(async () => {
    try {
      setData(await run())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [run])
  useEffect(() => {
    void reload()
  }, [reload])
  return { data, error, reload }
}

// Runs a mutation, surfacing any failure to the user.
export async function act(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn()
    return true
  } catch (e) {
    alert(`Something went wrong: ${(e as Error).message}`)
    return false
  }
}

export function Loading({ error }: { error: string | null }) {
  return error ? <p className="error">Could not load: {error}</p> : <p className="muted">Loading…</p>
}

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span>{label}</span>
      {children}
    </label>
  )
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="btn small"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? 'Copied ✓' : label}
    </button>
  )
}

const EMPTY_CONTACT: Contact = { name: '', title: '', phone: '', email: '' }

export function ContactsEditor({ value, onChange, titleLabel = 'Title' }: { value: Contact[]; onChange: (v: Contact[]) => void; titleLabel?: string }) {
  const set = (i: number, patch: Partial<Contact>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return (
    <div className="contacts">
      {value.map((c, i) => (
        <div className="contact-row" key={i}>
          <input placeholder="Name" value={c.name} onChange={(e) => set(i, { name: e.target.value })} />
          <input placeholder={titleLabel} value={c.title} onChange={(e) => set(i, { title: e.target.value })} />
          <input placeholder="Phone" value={c.phone} onChange={(e) => set(i, { phone: e.target.value })} />
          <input placeholder="Email" value={c.email} onChange={(e) => set(i, { email: e.target.value })} />
          <button type="button" className="btn small ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove contact">
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn small ghost" onClick={() => onChange([...value, { ...EMPTY_CONTACT }])}>
        + Add contact
      </button>
    </div>
  )
}
