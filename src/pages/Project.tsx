import { useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { fmtRange } from '../dates'
import { canClose, progress, stage } from '../logic'
import AssistantPanel from '../project/Assistant'
import Checklist from '../project/Checklist'
import Documents from '../project/Documents'
import Emails from '../project/Emails'
import HostFamilies from '../project/HostFamilies'
import Hotel from '../project/Hotel'
import Overview from '../project/Overview'
import Participants from '../project/Participants'
import Schedule from '../project/Schedule'
import Transportation from '../project/Transportation'
import { must, supabase } from '../supabase'
import type { Participant, ProgramType, Project, Resource, ScheduleItem, Settings, Staff, Task } from '../types'
import { act, Loading, useData } from '../ui'

export type ProjectData = {
  project: Project
  programType: ProgramType
  types: ProgramType[]
  tasks: Task[]
  people: Participant[]
  items: ScheduleItem[]
  resources: Resource[]
  settings: Settings
  staff: Staff[]
}

const ROLE_ORDER = { participant: 0, interpreter: 1, liaison: 2 } as const

export type TabProps = { data: ProjectData; reload: () => Promise<void> }

async function load(id: string): Promise<ProjectData> {
  const [project, types, tasks, people, items, resources, settings, staff] = await Promise.all([
    supabase.from('projects').select('*').eq('id', id).single(),
    supabase.from('program_types').select('*').order('sort'),
    supabase.from('tasks').select('*').eq('project_id', id).order('sort'),
    supabase.from('participants').select('*').eq('project_id', id).order('sort').order('family_name'),
    supabase.from('schedule_items').select('*').eq('project_id', id),
    supabase.from('resources').select('*').order('name'),
    supabase.from('settings').select('*').single(),
    supabase.from('staff').select('*').order('sort'),
  ])
  const p = must(project) as Project
  const allTypes = must(types) as ProgramType[]
  const programType = allTypes.find((t) => t.id === p.program_type_id)
  if (!programType) throw new Error('Project has an unknown program type')
  return {
    project: p,
    programType,
    types: allTypes,
    tasks: must(tasks) as Task[],
    people: (must(people) as Participant[]).sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]),
    items: must(items) as ScheduleItem[],
    resources: must(resources) as Resource[],
    settings: must(settings) as Settings,
    staff: must(staff) as Staff[],
  }
}

export default function ProjectPage() {
  const { id } = useParams()
  if (!id) throw new Error('Missing project id')
  const navigate = useNavigate()
  const { data, error, reload } = useData(() => load(id), [id])
  const [assistantOpen, setAssistantOpen] = useState(false)
  if (!data) return <Loading error={error} />
  const { project } = data
  const prog = progress(project, data.tasks)
  const closable = canClose(project, data.tasks)

  async function setClosed(closed: boolean) {
    if (closed && !confirm('Close this project? It will move to the closed list.')) return
    await act(async () => must(await supabase.from('projects').update({ closed_at: closed ? new Date().toISOString() : null }).eq('id', project.id)))
    if (closed) navigate('/projects')
    else await reload()
  }

  const tabs = [
    ['overview', 'Overview'],
    ['checklist', `Checklist (${prog.done}/${prog.total})`],
    ['participants', 'Participants'],
    ['schedule', 'Schedule'],
    data.project.lodging === 'hotel' ? ['hotel', 'Hotel'] : ['host-families', 'Host Families'],
    ['transportation', 'Transportation'],
    ['emails', 'Emails'],
    ['documents', 'Documents'],
  ]

  return (
    <div className="project-shell">
      <header className="project-band">
        <div className="band-top">
          <div>
            <div className="band-eyebrow">
              Project · {data.programType.name} · {stage(project, data.tasks)}
            </div>
            <h1>{project.name}</h1>
            <div className="band-meta">{[project.countries, fmtRange(project.arrival_date, project.departure_date)].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="row">
            <button className={assistantOpen ? 'btn band-btn active' : 'btn band-btn'} onClick={() => setAssistantOpen(!assistantOpen)}>
              ✦ Assistant
            </button>
            <button className="btn band-btn" onClick={() => act(async () => (await import('../itinerary')).downloadItinerary(data))}>
              ⬇ Itinerary
            </button>
            {project.closed_at ? (
              <button className="btn band-btn" onClick={() => setClosed(false)}>
                Reopen
              </button>
            ) : (
              <button
                className="btn band-btn"
                disabled={!closable}
                title={closable ? 'Close project' : `${prog.total - prog.done} checklist task(s) still open`}
                onClick={() => setClosed(true)}
              >
                Close project
              </button>
            )}
          </div>
        </div>
        <nav className="band-tabs">
          {tabs.map(([path, label]) => (
            <NavLink key={path} to={`/projects/${project.id}/${path}`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      {!closable && !project.closed_at && prog.done > 0 && prog.total - prog.done <= 3 && (
        <p className="notice">Almost there: {prog.total - prog.done} task(s) left before this project can be closed.</p>
      )}
      <div className={assistantOpen ? 'project-body with-assistant' : 'project-body'}>
        <div className="project-main">
      <Routes>
        <Route path="overview" element={<Overview data={data} reload={reload} />} />
        <Route path="checklist" element={<Checklist data={data} reload={reload} />} />
        <Route path="participants" element={<Participants data={data} reload={reload} />} />
        <Route path="schedule" element={<Schedule data={data} reload={reload} />} />
        {data.project.lodging === 'hotel' ? (
          <Route path="hotel" element={<Hotel data={data} reload={reload} />} />
        ) : (
          <Route path="host-families" element={<HostFamilies data={data} reload={reload} />} />
        )}
        <Route path="transportation" element={<Transportation data={data} reload={reload} />} />
        <Route path="emails" element={<Emails data={data} reload={reload} />} />
        <Route path="documents" element={<Documents data={data} reload={reload} />} />
        <Route path="*" element={<Navigate to="overview" replace />} />
      </Routes>
        </div>
        {assistantOpen && <AssistantPanel data={data} reload={reload} onClose={() => setAssistantOpen(false)} />}
      </div>
    </div>
  )
}
