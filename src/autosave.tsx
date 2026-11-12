import { useEffect, useRef, useState } from 'react'

const DELAY_MS = 800

export type SaveState = { status: 'saved' | 'pending' | 'saving' | 'error'; error?: string }

// Saves `value` a moment after it stops changing, and right away when the component goes
// away (switching tabs), so nothing typed is lost. One save runs at a time, newest last.
export function useAutosave<T>(value: T, save: (value: T) => Promise<void>): SaveState {
  const json = JSON.stringify(value)
  const savedJson = useRef(json)
  const latest = useRef({ value, json, save })
  useEffect(() => {
    latest.current = { value, json, save }
  })
  const queue = useRef<Promise<void>>(Promise.resolve())
  const [state, setState] = useState<SaveState>({ status: 'saved' })

  function flush() {
    const { value: v, json: j, save: s } = latest.current
    if (j === savedJson.current) return
    savedJson.current = j
    setState({ status: 'saving' })
    queue.current = queue.current.then(async () => {
      try {
        await s(v)
        if (latest.current.json === j) setState({ status: 'saved' })
      } catch (err) {
        savedJson.current = ''
        setState({ status: 'error', error: (err as Error).message })
      }
    })
  }

  useEffect(() => {
    if (json === savedJson.current) return
    setState({ status: 'pending' })
    const timer = setTimeout(flush, DELAY_MS)
    return () => clearTimeout(timer)
  }, [json]) // eslint-disable-line react-hooks/exhaustive-deps -- flush reads the latest values from refs

  useEffect(() => flush, []) // eslint-disable-line react-hooks/exhaustive-deps -- save what's left when leaving

  return state
}

export function SaveStatus({ state }: { state: SaveState }) {
  if (state.status === 'error') return <span className="save-status error">Couldn't save: {state.error}</span>
  return <span className="save-status muted small">{state.status === 'saved' ? '✓ All changes saved' : 'Saving…'}</span>
}
