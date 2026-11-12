import { FunctionsHttpError } from '@supabase/supabase-js'
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { applyOperations, describe } from '../apply'
import { ACCEPTED, uploadDocument } from '../documents'
import { fullName } from '../logic'
import type { TabProps } from '../pages/Project'
import { must, supabase } from '../supabase'
import type { Chat, ChatMessage, Operation, ProjectDocument, Proposal } from '../types'
import { act, useData } from '../ui'

// Minimal formatting for replies: paragraphs, "- " bullets and **bold**. Built as React
// elements, never as raw HTML.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part))
}

function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        if (lines.every((l) => /^\s*[-•*] /.test(l)))
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-•*] /, ''))}</li>
              ))}
            </ul>
          )
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </span>
            ))}
          </p>
        )
      })}
    </>
  )
}

type Failure = { code: string; message: string }

async function callAssistant(chatId: string, text: string, documentIds: string[]): Promise<Failure | null> {
  const { error } = await supabase.functions.invoke('assistant', { body: { chat_id: chatId, text, document_ids: documentIds } })
  if (!error) return null
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => ({}))) as { error?: string; message?: string }
    return { code: body.error ?? 'error', message: body.message ?? error.message }
  }
  return { code: 'network', message: error.message }
}

export default function AssistantPanel({ data, reload, onClose }: TabProps & { onClose: () => void }) {
  const projectId = data.project.id
  const chats = useData(async () => must(await supabase.from('chats').select('*').eq('project_id', projectId).order('created_at', { ascending: false })) as Chat[], [projectId])
  const [chatId, setChatId] = useState<string | null>(null)
  const activeId = chatId ?? chats.data?.[0]?.id ?? null
  const messages = useData(
    async () => (activeId ? (must(await supabase.from('chat_messages').select('*').eq('chat_id', activeId).neq('role', 'system').order('seq')) as ChatMessage[]) : []),
    [activeId],
  )
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [dragging, setDragging] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  // Block body on purpose: scrollIntoView returns a Promise in current Chrome, and an effect
  // must not return anything but a cleanup function.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.data, busy])

  async function newChat(): Promise<string> {
    const chat = must(await supabase.from('chats').insert({ project_id: projectId }).select('*').single()) as Chat
    await chats.reload()
    setChatId(chat.id)
    return chat.id
  }

  async function send() {
    if (busy || (!text.trim() && !files.length)) return
    setBusy(true)
    setFailure(null)
    try {
      const id = activeId ?? (await newChat())
      const docs: ProjectDocument[] = []
      for (const f of files) docs.push(await uploadDocument(projectId, f))
      const fail = await callAssistant(id, text, docs.map((d) => d.id))
      if (fail) setFailure(fail)
      else {
        setText('')
        setFiles([])
      }
      await messages.reload()
      await chats.reload()
    } catch (err) {
      setFailure({ code: 'error', message: (err as Error).message })
    }
    setBusy(false)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    setFiles([...files, ...Array.from(e.dataTransfer.files)])
  }

  return (
    <aside className={dragging ? 'assistant dragging' : 'assistant'} onDragOver={(e) => (e.preventDefault(), setDragging(true))} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <div className="assistant-head">
        <b>✦ Assistant</b>
        <select value={activeId ?? ''} onChange={(e) => setChatId(e.target.value)} aria-label="Conversation">
          {!chats.data?.length && <option value="">New conversation</option>}
          {chats.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button className="btn small" onClick={() => act(newChat)} title="Start a new conversation">
          + New
        </button>
        <button className="icon-btn" onClick={onClose} aria-label="Close assistant">
          ✕
        </button>
      </div>

      <div className="assistant-log">
        {!messages.data?.length && !busy && (
          <div className="assistant-empty">
            <p>Paste an email, drop in a document, or ask where things stand.</p>
            <ul className="small muted">
              <li>"Here's the project proposal. Add the participants and the meetings."</li>
              <li>"Jessica says one participant cancelled. Update the rooming list."</li>
              <li>"What's still open before arrival?"</li>
            </ul>
            <p className="small muted">The assistant only proposes changes. You review and apply each one.</p>
          </div>
        )}
        {messages.data?.map((m) => (
          <div key={m.id} className={`bubble from-${m.role}`}>
            {m.role === 'user' && m.ui.attachments && m.ui.attachments.length > 0 && (
              <div className="chips">
                {m.ui.attachments.map((a) => (
                  <span key={a.id} className="chip subtle">
                    📎 {a.name}
                  </span>
                ))}
              </div>
            )}
            {m.ui.text && <Rich text={m.ui.text} />}
            {m.ui.proposals?.map((p) => (
              <ProposalCard key={p.tool_use_id} message={m} proposal={p} data={data} onApplied={async () => (await messages.reload(), await reload())} />
            ))}
          </div>
        ))}
        {busy && <div className="bubble from-assistant muted">Reading and thinking… this can take up to a minute for long documents.</div>}
        {failure && <FailureNote failure={failure} />}
        <div ref={endRef} />
      </div>

      <div className="assistant-compose">
        {files.length > 0 && (
          <div className="chips">
            {files.map((f, i) => (
              <span key={i} className="chip subtle">
                📎 {f.name}{' '}
                <button className="link" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          rows={4}
          value={text}
          placeholder="Paste an email or ask a question… (Ctrl+Enter to send)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send()
          }}
        />
        <div className="row spread">
          <label className="btn small">
            📎 Attach
            <input type="file" multiple hidden accept={ACCEPTED} onChange={(e) => e.target.files && setFiles([...files, ...Array.from(e.target.files)])} />
          </label>
          <button className="btn primary" disabled={busy || (!text.trim() && !files.length)} onClick={send}>
            {busy ? 'Working…' : 'Send'}
          </button>
        </div>
      </div>
    </aside>
  )
}

function FailureNote({ failure }: { failure: Failure }) {
  if (failure.code === 'missing_key')
    return (
      <div className="notice warn">
        <b>The assistant isn't switched on yet.</b> It needs a Claude API key saved in Supabase:
        <ol>
          <li>At console.anthropic.com, create an account, add a payment method, and create an API key.</li>
          <li>In Supabase, open project globalties → Edge Functions → Secrets.</li>
          <li>Add a secret named ANTHROPIC_API_KEY with the key as its value, then try again.</li>
        </ol>
      </div>
    )
  return (
    <div className="notice warn">
      Couldn't get a reply: {failure.message} {failure.code === 'bad_key' && 'Check the ANTHROPIC_API_KEY secret in Supabase.'}
    </div>
  )
}

function ProposalCard({ message, proposal, data, onApplied }: { message: ChatMessage; proposal: Proposal; data: TabProps['data']; onApplied: () => Promise<void> }) {
  const pending = proposal.operations.some((o) => o.status === 'pending')
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(proposal.operations.map((o, i) => (o.status === 'pending' ? i : -1)).filter((i) => i >= 0)))
  const [busy, setBusy] = useState(false)
  const lookup = {
    participant: (id: string) => {
      const p = data.people.find((x) => x.id === id)
      return p ? fullName(p) : 'a participant'
    },
    item: (id: string) => data.items.find((x) => x.id === id)?.title ?? 'an item',
    resource: (id: string) => data.resources.find((x) => x.id === id)?.name ?? 'a resource',
    task: (id: string) => data.tasks.find((x) => x.id === id)?.title ?? 'a task',
  }

  async function save(operations: Operation[]) {
    const proposals = (message.ui.proposals ?? []).map((p) => (p.tool_use_id === proposal.tool_use_id ? { ...p, operations } : p))
    must(await supabase.from('chat_messages').update({ ui: { ...message.ui, proposals } }).eq('id', message.id))
  }

  async function apply(all: boolean) {
    setBusy(true)
    await act(async () => {
      const result = await applyOperations(data.project, proposal.operations, all ? chosen : new Set())
      await save(result)
    })
    setBusy(false)
    await onApplied()
  }

  const mark = { applied: '✓', rejected: '✕', failed: '⚠', pending: '' } as const

  return (
    <div className="proposal">
      <div className="proposal-head">
        <b>Proposed changes</b> <span className="muted small">{proposal.summary}</span>
      </div>
      {proposal.operations.map((o, i) => (
        <label key={i} className={`op op-${o.status}`}>
          {o.status === 'pending' ? (
            <input
              type="checkbox"
              checked={chosen.has(i)}
              onChange={(e) => {
                const next = new Set(chosen)
                if (e.target.checked) next.add(i)
                else next.delete(i)
                setChosen(next)
              }}
            />
          ) : (
            <span className="op-mark">{mark[o.status]}</span>
          )}
          <span>
            <span className="op-what">{describe(o, lookup)}</span>
            {o.reason && <span className="op-why">{o.reason}</span>}
            {o.error && <span className="op-error">Failed: {o.error}</span>}
            {o.data && Object.keys(o.data).length > 0 && (
              <details>
                <summary className="small muted">Details</summary>
                <dl className="op-data">
                  {Object.entries(o.data).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </span>
        </label>
      ))}
      {pending && (
        <div className="row">
          <button className="btn small primary" disabled={busy || chosen.size === 0} onClick={() => apply(true)}>
            {busy ? 'Applying…' : `Apply ${chosen.size} selected`}
          </button>
          <button className="btn small ghost" disabled={busy} onClick={() => apply(false)}>
            Reject all
          </button>
        </div>
      )}
    </div>
  )
}
