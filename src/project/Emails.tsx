import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { draftTargets, type Draft } from '../emails'
import type { TabProps } from '../pages/Project'
import { CopyButton, Field } from '../ui'

export default function Emails({ data }: TabProps) {
  const [params, setParams] = useSearchParams()
  const targets = draftTargets(data)
  const wanted = params.get('key')
  const initial = Math.max(0, targets.findIndex((t) => t.key === wanted))
  const [index, setIndex] = useState(initial)
  const target = targets[index]

  function choose(i: number) {
    setIndex(i)
    setParams({ key: targets[i].key }, { replace: true })
  }

  return (
    <div className="emails">
      <aside className="lists">
        {targets.map((t, i) => (
          <button key={t.label} className={i === index ? 'list active' : 'list'} onClick={() => choose(i)}>
            {t.label}
          </button>
        ))}
      </aside>
      <select className="lists-mobile" value={index} onChange={(e) => choose(Number(e.target.value))} aria-label="Email template">
        {targets.map((t, i) => (
          <option key={t.label} value={i}>
            {t.label}
          </option>
        ))}
      </select>
      {/* key resets the editable copy when switching templates or when project data changes */}
      <DraftEditor key={`${target.label}|${JSON.stringify(target.build())}`} draft={target.build()} />
    </div>
  )
}

function DraftEditor({ draft }: { draft: Draft }) {
  const [d, setD] = useState(draft)
  const line = (key: 'to' | 'cc' | 'subject', label: string) => (
    <Field label={label} wide>
      <div className="row nowrap">
        <input value={d[key]} onChange={(e) => setD({ ...d, [key]: e.target.value })} />
        <CopyButton text={d[key]} />
      </div>
    </Field>
  )
  const placeholders = d.body.match(/\[[^\]]+\]/g) ?? []
  return (
    <section className="card form draft">
      {line('to', 'To')}
      {line('cc', 'Cc')}
      {line('subject', 'Subject')}
      <Field label="Body" wide>
        <textarea rows={18} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} />
      </Field>
      {placeholders.length > 0 && <p className="notice">Fill in before sending: {[...new Set(placeholders)].join(', ')}</p>}
      <div className="row">
        <CopyButton text={d.body} label="Copy body" />
        <span className="muted small">Paste into a new Outlook message. Edits here are not saved.</span>
      </div>
    </section>
  )
}
