import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fmtShort, fmtTimeRange } from '../dates'
import { STATUS_LABELS } from '../logic'
import MapView, { type MapPoint } from '../MapView'
import ResourceForm from '../ResourceForm'
import { CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS } from '../resources'
import { must, supabase } from '../supabase'
import type { MeetingStatus, Project, Resource, ResourceCategory } from '../types'
import { act, Loading, useData } from '../ui'

type Visit = {
  id: string
  project_id: string
  resource_id: string
  day: string
  start_time: string | null
  end_time: string | null
  title: string
  status: MeetingStatus | null
}

async function load() {
  const [resources, visits, projects] = await Promise.all([
    supabase.from('resources').select('*').order('name'),
    supabase.from('schedule_items').select('id, project_id, resource_id, day, start_time, end_time, title, status').not('resource_id', 'is', null),
    supabase.from('projects').select('id, name, arrival_date, closed_at').order('arrival_date', { ascending: false }),
  ])
  return {
    resources: must(resources) as Resource[],
    visits: (must(visits) as Visit[]).sort((a, b) => a.day.localeCompare(b.day) || (a.start_time ?? '').localeCompare(b.start_time ?? '')),
    projects: must(projects) as Pick<Project, 'id' | 'name' | 'arrival_date' | 'closed_at'>[],
  }
}

export default function Resources() {
  const { data, error, reload } = useData(load, [])
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<ResourceCategory | ''>('')
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const placePin = useRef<((lat: number, lng: number) => void) | null>(null)
  const selectedId = params.get('id')
  const projectId = params.get('project') ?? ''

  const select = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params)
      if (id) next.set('id', id)
      else next.delete('id')
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  const shown = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const inProject = projectId ? data.visits.filter((v) => v.project_id === projectId) : null
    let list = data.resources.filter(
      (r) =>
        (!category || r.category === category) &&
        (!q || [r.name, r.address, r.description, ...r.contacts.map((c) => c.name)].some((s) => s.toLowerCase().includes(q))) &&
        (!inProject || inProject.some((v) => v.resource_id === r.id)),
    )
    if (inProject) {
      const firstVisit = (r: Resource) => inProject.findIndex((v) => v.resource_id === r.id)
      list = [...list].sort((a, b) => firstVisit(a) - firstVisit(b))
    }
    return list
  }, [data, search, category, projectId])

  const points: MapPoint[] = useMemo(
    () =>
      shown
        .filter((r) => r.lat !== null && r.lng !== null)
        .map((r) => ({
          id: r.id,
          lat: r.lat!,
          lng: r.lng!,
          color: CATEGORY_COLORS[r.category],
          label: r.name,
          number: projectId ? shown.indexOf(r) + 1 : undefined,
        })),
    [shown, projectId],
  )

  if (!data) return <Loading error={error} />
  const projectName = new Map(data.projects.map((p) => [p.id, p.name]))
  const editingResource = data.resources.find((r) => r.id === editing)

  async function remove(r: Resource) {
    if (!confirm(`Delete "${r.name}" from Resources?`)) return
    if (await act(async () => must(await supabase.from('resources').delete().eq('id', r.id)))) {
      select(null)
      await reload()
    }
  }

  function requestPin(place: (lat: number, lng: number) => void) {
    placePin.current = place
    setPicking(true)
  }

  const form = editing && (
    <ResourceForm
      key={editing}
      resource={editingResource}
      onRequestPin={requestPin}
      onCancel={() => {
        setEditing(null)
        setPicking(false)
      }}
      onSaved={async (saved, msg) => {
        setEditing(null)
        setPicking(false)
        setNotice(msg)
        await reload()
        select(saved.id)
      }}
    />
  )

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Resources & Map</h1>
          <div className="muted">Organizations and places groups visit, saved for every future project.</div>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>
          + New resource
        </button>
      </div>
      {notice && (
        <p className="notice warn" onClick={() => setNotice(null)}>
          {notice}
        </p>
      )}
      <div className="resources-page">
        <div className="map-pane">
          <MapView
            points={points}
            selectedId={selectedId}
            onSelect={select}
            picking={picking}
            onPick={(lat, lng) => {
              placePin.current?.(lat, lng)
              setPicking(false)
            }}
          />
          {picking && <p className="notice">Click the map where this resource is.</p>}
          <div className="legend">
            {CATEGORIES.map((c) => (
              <span key={c}>
                <i style={{ background: CATEGORY_COLORS[c] }} /> {CATEGORY_LABELS[c]}
              </span>
            ))}
          </div>
        </div>
        <div className="list-pane">
          {form}
          <div className="filters">
            <input placeholder="Search name, address, contact…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={category} onChange={(e) => setCategory(e.target.value as ResourceCategory | '')} aria-label="Category">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <select
              value={projectId}
              onChange={(e) => {
                const next = new URLSearchParams(params)
                if (e.target.value) next.set('project', e.target.value)
                else next.delete('project')
                setParams(next, { replace: true })
              }}
              aria-label="Project"
            >
              <option value="">All projects</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.closed_at ? ' (closed)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="muted small">
            {shown.length} resource{shown.length === 1 ? '' : 's'}
            {shown.some((r) => r.lat === null) && ` · ${shown.filter((r) => r.lat === null).length} not on the map`}
          </div>
          {shown.map((r, i) => {
            const visits = data.visits.filter((v) => v.resource_id === r.id)
            const open = r.id === selectedId
            return (
              <div key={r.id} className={open ? 'resource open' : 'resource'} onClick={() => select(open ? null : r.id)}>
                <div className="row spread nowrap">
                  <div>
                    <div className="item-title">
                      {projectId && <span className="num">{i + 1}</span>}
                      {r.name}
                    </div>
                    <div className="muted small">
                      <span className="dot" style={{ background: CATEGORY_COLORS[r.category] }} /> {CATEGORY_LABELS[r.category]}
                      {r.address && ` · ${r.address.split('\n')[0]}`}
                      {r.lat === null && ' · not on map'}
                    </div>
                  </div>
                  <span className="count">{visits.length} visit{visits.length === 1 ? '' : 's'}</span>
                </div>
                {open && (
                  <div className="resource-detail" onClick={(e) => e.stopPropagation()}>
                    {r.location && <div>{r.location}</div>}
                    {r.address && <div style={{ whiteSpace: 'pre-line' }}>{r.address}</div>}
                    {r.website && (
                      <a href={r.website.startsWith('http') ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer">
                        {r.website}
                      </a>
                    )}
                    {r.directions && <p className="small">{r.directions}</p>}
                    {r.description && <p>{r.description}</p>}
                    {r.contacts.length > 0 && (
                      <ul className="small">
                        {r.contacts.map((c) => (
                          <li key={c.id}>{[c.name, c.title, c.email, c.phone].filter(Boolean).join(' · ')}</li>
                        ))}
                      </ul>
                    )}
                    {r.notes && <p className="small muted">Notes: {r.notes}</p>}
                    <h3>Visits</h3>
                    {visits.length === 0 && <p className="muted small">Not yet used in a project.</p>}
                    <ul className="small">
                      {visits.map((v) => (
                        <li key={v.id}>
                          <Link to={`/projects/${v.project_id}/schedule`}>{projectName.get(v.project_id)}</Link> · {fmtShort(v.day)}{' '}
                          {fmtTimeRange(v.start_time, v.end_time)}
                          {v.title !== r.name && ` · ${v.title}`}
                          {v.status && ` · ${STATUS_LABELS[v.status]}`}
                        </li>
                      ))}
                    </ul>
                    <div className="row">
                      <button className="btn small" onClick={() => setEditing(r.id)}>
                        Edit resource
                      </button>
                      {visits.length === 0 && (
                        <button className="btn small ghost danger" onClick={() => remove(r)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {data.resources.length === 0 && <p className="muted">No resources yet. Add one here or from a project's Schedule tab.</p>}
        </div>
      </div>
    </div>
  )
}
