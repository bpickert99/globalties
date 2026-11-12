import { useState, type DragEvent } from 'react'
import { fmtShort } from '../dates'
import { ACCEPTED, deleteDocument, fmtSize, openDocument, uploadDocument } from '../documents'
import type { TabProps } from '../pages/Project'
import { must, supabase } from '../supabase'
import type { ProjectDocument } from '../types'
import { act, Loading, useData } from '../ui'

// Everything uploaded for this project: proposals, emails, rooming lists. The assistant can read them.
export default function Documents({ data }: TabProps) {
  const projectId = data.project.id
  const docs = useData(async () => must(await supabase.from('documents').select('*').eq('project_id', projectId).order('created_at', { ascending: false })) as ProjectDocument[], [projectId])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  async function upload(files: FileList | File[]) {
    setBusy(true)
    for (const f of Array.from(files)) await act(() => uploadDocument(projectId, f))
    setBusy(false)
    await docs.reload()
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void upload(e.dataTransfer.files)
  }

  if (!docs.data) return <Loading error={docs.error} />
  return (
    <div className="stack">
      <label
        className={dragging ? 'dropzone over' : 'dropzone'}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input type="file" multiple accept={ACCEPTED} hidden onChange={(e) => e.target.files && upload(e.target.files)} />
        <b>{busy ? 'Uploading…' : 'Drop files here or click to choose'}</b>
        <span className="muted small">Project proposals (PDF or Word), saved emails (.msg, .eml), rooming lists, images. Up to 25 MB each.</span>
      </label>
      <section className="card">
        <h2>Documents ({docs.data.length})</h2>
        {docs.data.length === 0 && <p className="muted">Nothing uploaded yet.</p>}
        {docs.data.map((d) => (
          <div key={d.id} className="doc-row">
            <button className="link" onClick={() => act(() => openDocument(d))}>
              {d.name}
            </button>
            <span className="muted small">
              {fmtSize(d.size_bytes)} · {fmtShort(d.created_at.slice(0, 10))}
            </span>
            <button
              className="btn small ghost"
              onClick={async () => {
                if (!confirm(`Delete ${d.name}?`)) return
                await act(() => deleteDocument(d))
                await docs.reload()
              }}
            >
              Delete
            </button>
          </div>
        ))}
        <p className="muted small">Open the ✦ Assistant and attach a document to have it pull out participants, meetings and project details for you to approve.</p>
      </section>
    </div>
  )
}
