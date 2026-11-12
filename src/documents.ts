// Project documents: stored in Supabase Storage; Word files and saved emails are also
// turned into text so the assistant can read them. PDFs and images are read as-is.

import { must, supabase } from './supabase'
import type { ProjectDocument } from './types'

export const ACCEPTED = '.pdf,.docx,.txt,.eml,.msg,.md,.csv,.png,.jpg,.jpeg,.gif,.webp,.html,.htm'

const MAX_BYTES = 25 * 1024 * 1024

export function readsAsIs(mime: string): boolean {
  return mime === 'application/pdf' || mime.startsWith('image/')
}

async function docxText(file: File): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return value
}

// Outlook "Save as" / drag-out .msg files.
async function msgText(file: File): Promise<string> {
  const MsgReader = (await import('@kenjiuno/msgreader')).default
  const data = new MsgReader(await file.arrayBuffer()).getFileData()
  const to = (data.recipients ?? []).map((r) => [r.name, r.email ?? r.smtpAddress].filter(Boolean).join(' ')).join('; ')
  return [
    `From: ${[data.senderName, data.senderEmail].filter(Boolean).join(' ')}`,
    to && `To: ${to}`,
    data.messageDeliveryTime && `Date: ${data.messageDeliveryTime}`,
    `Subject: ${data.subject ?? ''}`,
    '',
    data.body ?? '',
  ]
    .filter((l): l is string => typeof l === 'string')
    .join('\n')
}

function htmlText(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.innerText
}

// Text the assistant reads, or null when Claude reads the file itself (PDF, image).
async function extractText(file: File, mime: string): Promise<string | null> {
  const name = file.name.toLowerCase()
  if (readsAsIs(mime)) return null
  if (name.endsWith('.docx')) return docxText(file)
  if (name.endsWith('.msg')) return msgText(file)
  if (name.endsWith('.html') || name.endsWith('.htm')) return htmlText(await file.text())
  return file.text()
}

function mimeOf(file: File): string {
  if (file.type) return file.type
  const ext = file.name.toLowerCase().split('.').pop()
  const known: Record<string, string> = { msg: 'application/vnd.ms-outlook', eml: 'message/rfc822', md: 'text/markdown', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
  return known[ext ?? ''] ?? 'application/octet-stream'
}

export async function uploadDocument(projectId: string, file: File): Promise<ProjectDocument> {
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is larger than 25 MB`)
  const mime = mimeOf(file)
  const text = await extractText(file, mime)
  const path = `${projectId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`
  must(await supabase.storage.from('documents').upload(path, file, { contentType: mime }))
  return must(
    await supabase
      .from('documents')
      .insert({ project_id: projectId, name: file.name, mime_type: mime, size_bytes: file.size, storage_path: path, text_content: text })
      .select('*')
      .single(),
  ) as ProjectDocument
}

// Pasted email text becomes a small text document, so it is kept with the project.
export async function savePastedText(projectId: string, title: string, text: string): Promise<ProjectDocument> {
  const file = new File([text], `${title.replace(/[^\w .-]+/g, '').slice(0, 60) || 'Pasted email'}.txt`, { type: 'text/plain' })
  return uploadDocument(projectId, file)
}

export async function openDocument(doc: ProjectDocument): Promise<void> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 60)
  if (error) throw new Error(error.message)
  window.open(data.signedUrl, '_blank', 'noopener')
}

export async function deleteDocument(doc: ProjectDocument): Promise<void> {
  must(await supabase.storage.from('documents').remove([doc.storage_path]))
  must(await supabase.from('documents').delete().eq('id', doc.id))
}

export function fmtSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
