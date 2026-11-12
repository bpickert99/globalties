// Supabase Edge Function: one assistant turn for a project chat.
// The function only reads project data and calls Claude; it never writes project records.
// Proposed changes go back to the page, which applies the ones the user approves.

import Anthropic, { toFile } from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { buildSnapshot, MODEL, PROPOSE_TOOL, proposalsFrom, SYSTEM_PROMPT, textOf, toolResultsFor, type Proposal } from './core.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

type Body = { chat_id: string; text: string; document_ids: string[] }

// Unwraps a Supabase result, throwing on error (caught once, below, and returned as a 500).
function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

Deno.serve(async (req) => {
  try {
    return await handle(req)
  } catch (err) {
    console.error(err)
    return json({ error: 'server_error', message: (err as Error).message }, 500)
  }
})

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'missing_key', message: 'The ANTHROPIC_API_KEY secret is not set for this Supabase project.' }, 503)

  // Act as the signed-in user so row level security applies to every read and write.
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const members = await db.from('members').select('email')
  if (members.error || !members.data.length) return json({ error: 'forbidden' }, 403)

  const body = (await req.json()) as Body
  if (!body.chat_id || (!body.text?.trim() && !body.document_ids?.length)) return json({ error: 'bad_request' }, 400)

  const chat = await db.from('chats').select('*').eq('id', body.chat_id).single()
  if (chat.error) return json({ error: 'chat_not_found' }, 404)
  const projectId = chat.data.project_id as string

  const history = await db.from('chat_messages').select('*').eq('chat_id', body.chat_id).order('seq')
  if (history.error) return json({ error: history.error.message }, 500)
  const past = history.data
  const lastAssistant = [...past].reverse().find((m) => m.role === 'assistant')
  const pendingProposals: Proposal[] = (lastAssistant?.ui?.proposals as Proposal[] | undefined) ?? []

  const anthropic = new Anthropic({ apiKey })

  // ----- the new user turn: tool results first, then documents, then the message -----
  const content: Anthropic.Beta.BetaContentBlockParam[] = [...toolResultsFor(lastAssistant?.api_content as Anthropic.Beta.BetaMessageParam | undefined, pendingProposals)]
  const attachments: { id: string; name: string }[] = []
  if (body.document_ids?.length) {
    const docs = await db.from('documents').select('*').in('id', body.document_ids).eq('project_id', projectId)
    if (docs.error) return json({ error: docs.error.message }, 500)
    for (const d of docs.data) {
      attachments.push({ id: d.id, name: d.name })
      if (d.text_content !== null) {
        content.push({ type: 'text', text: `<document name="${d.name}">\n${d.text_content}\n</document>` })
        continue
      }
      // PDFs and images: uploaded once to the Files API, then referenced by id.
      let fileId = d.anthropic_file_id as string | null
      if (!fileId) {
        const blob = await db.storage.from('documents').download(d.storage_path)
        if (blob.error) return json({ error: `Could not read ${d.name}: ${blob.error.message}` }, 500)
        const uploaded = await anthropic.files.upload({ file: await toFile(blob.data, d.name, { type: d.mime_type }), expires_in_seconds: 7776000 })
        fileId = uploaded.id
        await db.from('documents').update({ anthropic_file_id: fileId }).eq('id', d.id)
      }
      content.push(
        d.mime_type === 'application/pdf'
          ? { type: 'document', source: { type: 'file', file_id: fileId }, title: d.name }
          : { type: 'image', source: { type: 'file', file_id: fileId } },
      )
    }
  }
  if (body.text?.trim()) content.push({ type: 'text', text: body.text })

  // ----- current project data, shown for this turn only -----
  const [project, participants, items, resources, visits, tasks, lists, documents, settings] = await Promise.all([
    db.from('projects').select('*, program_types(name)').eq('id', projectId).single(),
    db.from('participants').select('*').eq('project_id', projectId).order('sort'),
    db.from('schedule_items').select('*').eq('project_id', projectId).order('day').order('start_time'),
    db.from('resources').select('*').order('name'),
    db.from('schedule_items').select('resource_id, day, project_id, status').not('resource_id', 'is', null),
    db.from('tasks').select('*').or(`project_id.eq.${projectId},list_id.not.is.null`),
    db.from('task_lists').select('*'),
    db.from('documents').select('name').eq('project_id', projectId),
    db.from('settings').select('fatigue_days').single(),
  ])
  const projectRow = must(project)
  const snapshot = buildSnapshot({
    today: new Date().toISOString().slice(0, 10),
    project: projectRow,
    programType: (projectRow.program_types as { name: string } | null)?.name ?? '',
    settings: must(settings),
    participants: must(participants),
    items: must(items),
    resources: must(resources),
    visits: must(visits),
    tasks: must(tasks),
    lists: must(lists),
    documents: must(documents),
  })

  const userTurn: Anthropic.Beta.BetaMessageParam = { role: 'user', content }
  const snapshotTurn: Anthropic.Beta.BetaMessageParam = { role: 'system', content: `Current project data:\n${snapshot}`, clear_at: 'next_user_message' }
  const messages = [...past.map((m) => m.api_content as Anthropic.Beta.BetaMessageParam), userTurn, snapshotTurn]

  let response: Anthropic.Beta.BetaMessage
  try {
    response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [PROPOSE_TOOL],
      messages,
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      betas: ['server-side-fallback-2026-07-01', 'mid-conversation-system-clear-at-2026-08-21'],
      fallbacks: 'default',
    })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json({ error: 'bad_key', message: 'The Claude API key was rejected.' }, 502)
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'rate_limited', message: 'Claude is busy; try again in a minute.' }, 429)
    if (err instanceof Anthropic.APIError) return json({ error: 'claude_error', message: `Claude API error ${err.status}: ${err.message}` }, 502)
    throw err
  }

  const refused = response.stop_reason === 'refusal'
  const proposals = refused ? [] : proposalsFrom(response.content)
  const reply = refused ? "I can't help with that request." : textOf(response.content) || (proposals.length ? '' : '(no reply)')

  // Persist the turn exactly as sent and received, so the next request replays it unchanged.
  const seq = (past[past.length - 1]?.seq ?? 0) + 1
  const rows = [
    { chat_id: body.chat_id, seq, role: 'user', api_content: userTurn, ui: { text: body.text, attachments } },
    { chat_id: body.chat_id, seq: seq + 1, role: 'system', api_content: snapshotTurn, ui: {} },
    { chat_id: body.chat_id, seq: seq + 2, role: 'assistant', api_content: { role: 'assistant', content: response.content }, ui: { text: reply, proposals } },
  ]
  const saved = await db.from('chat_messages').insert(rows)
  if (saved.error) return json({ error: saved.error.message }, 500)
  if (!past.length && body.text?.trim()) await db.from('chats').update({ title: body.text.trim().slice(0, 60) }).eq('id', body.chat_id)

  return json({ ok: true, usage: response.usage })
}
