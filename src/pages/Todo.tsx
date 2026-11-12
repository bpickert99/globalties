import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { addDays, fmtWeekdayShort, today } from '../dates'
import { must, supabase } from '../supabase'
import type { Project, Task, TaskList } from '../types'
import { act, Loading, useData } from '../ui'

// Google Tasks–style lists: General, one per open project, and any made by hand.
// Only tasks added here appear; project checklists stay on each project's Checklist tab.

async function load() {
  const [lists, tasks, projects] = await Promise.all([
    supabase.from('task_lists').select('*').order('sort').order('created_at'),
    supabase.from('tasks').select('*').not('list_id', 'is', null).order('created_at'),
    supabase.from('projects').select('id, name, closed_at, arrival_date'),
  ])
  return {
    lists: must(lists) as TaskList[],
    tasks: must(tasks) as Task[],
    projects: must(projects) as Pick<Project, 'id' | 'name' | 'closed_at' | 'arrival_date'>[],
  }
}

type View = 'all' | 'starred'

// "Past", "Today", "Tomorrow", "Wed, Nov 18", or "No deadline".
function dateLabel(due: string | null): string {
  if (!due) return 'No deadline'
  const now = today()
  if (due < now) return 'Past'
  if (due === now) return 'Today'
  if (due === addDays(now, 1)) return 'Tomorrow'
  return fmtWeekdayShort(due)
}

function grouped(tasks: Task[]): [string, Task[]][] {
  const open = tasks.filter((t) => !t.done_at).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.created_at.localeCompare(b.created_at))
  const groups: [string, Task[]][] = []
  for (const t of open) {
    const label = dateLabel(t.due_date)
    const last = groups[groups.length - 1]
    if (last && last[0] === label) last[1].push(t)
    else groups.push([label, [t]])
  }
  return groups
}

export default function Todo() {
  const { data, error, reload } = useData(load, [])
  const [view, setView] = useState<View>('all')
  if (!data) return <Loading error={error} />

  const closed = new Set(data.projects.filter((p) => p.closed_at).map((p) => p.id))
  const lists = data.lists.filter((l) => !l.project_id || !closed.has(l.project_id))
  const openCount = (l: TaskList) => data.tasks.filter((t) => t.list_id === l.id && !t.done_at).length

  async function toggleShown(l: TaskList) {
    await act(async () => must(await supabase.from('task_lists').update({ shown: !l.shown }).eq('id', l.id)))
    await reload()
  }

  async function createList() {
    const name = prompt('Name of the new list:')?.trim()
    if (!name) return
    await act(async () => must(await supabase.from('task_lists').insert({ name, sort: 50 })))
    await reload()
  }

  const starred = data.tasks.filter((t) => t.starred && !t.done_at)

  return (
    <div className="gtasks">
      <aside className="gtasks-side">
        <button className={view === 'all' ? 'list active' : 'list'} onClick={() => setView('all')}>
          <span>☑ All tasks</span>
        </button>
        <button className={view === 'starred' ? 'list active' : 'list'} onClick={() => setView('starred')}>
          <span>☆ Starred</span>
          <span className="count">{starred.length || ''}</span>
        </button>
        <div className="side-head">Lists</div>
        {lists.map((l) => (
          <label key={l.id} className="side-list">
            <input type="checkbox" checked={l.shown} onChange={() => toggleShown(l)} />
            <span className="side-name">{l.name}</span>
            <span className="count">{openCount(l) || ''}</span>
          </label>
        ))}
        <button className="list" onClick={createList}>
          <span>+ Create new list</span>
        </button>
      </aside>
      <section className="gtasks-board">
        {view === 'starred' ? (
          <ListCard title="Starred" tasks={starred} lists={lists} onChange={reload} />
        ) : (
          lists
            .filter((l) => l.shown)
            .map((l) => <ListCard key={l.id} list={l} title={l.name} tasks={data.tasks.filter((t) => t.list_id === l.id)} lists={lists} onChange={reload} />)
        )}
        {view === 'all' && !lists.some((l) => l.shown) && <p className="muted">Tick a list on the left to show it.</p>}
      </section>
    </div>
  )
}

function ListCard({ list, title, tasks, lists, onChange }: { list?: TaskList; title: string; tasks: Task[]; lists: TaskList[]; onChange: () => Promise<void> }) {
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [menu, setMenu] = useState(false)
  const done = tasks.filter((t) => t.done_at).sort((a, b) => b.done_at!.localeCompare(a.done_at!))

  async function rename() {
    if (!list) return
    const name = prompt('Rename list:', list.name)?.trim()
    if (!name) return
    await act(async () => must(await supabase.from('task_lists').update({ name }).eq('id', list.id)))
    await onChange()
  }

  async function remove() {
    if (!list || !confirm(`Delete the list "${list.name}" and its ${tasks.length} task(s)?`)) return
    await act(async () => must(await supabase.from('task_lists').delete().eq('id', list.id)))
    await onChange()
  }

  return (
    <div className="gcard">
      <div className="gcard-head">
        <h2>{title}</h2>
        {list && (
          <div className="menu-wrap">
            <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label="List options">
              ⋮
            </button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                {list.project_id ? (
                  <Link to={`/projects/${list.project_id}`}>Open project</Link>
                ) : (
                  <>
                    <button onClick={rename}>Rename list</button>
                    <button className="danger" onClick={remove}>
                      Delete list
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {list && (adding ? <TaskEditor listId={list.id} lists={lists} onDone={() => setAdding(false)} onSaved={onChange} /> : (
        <button className="add-link" onClick={() => setAdding(true)}>
          ⊕ Add a task
        </button>
      ))}
      {grouped(tasks).map(([label, group]) => (
        <div key={label} className="ggroup">
          <div className={label === 'Past' ? 'ggroup-label overdue' : label === 'Today' ? 'ggroup-label today' : 'ggroup-label'}>{label}</div>
          {group.map((t) => (
            <TaskRow key={t.id} task={t} lists={lists} onChange={onChange} />
          ))}
        </div>
      ))}
      {tasks.filter((t) => !t.done_at).length === 0 && !adding && <p className="muted small pad-s">No tasks</p>}
      {done.length > 0 && (
        <>
          <button className="done-toggle" onClick={() => setShowDone(!showDone)}>
            {showDone ? '▾' : '▸'} Completed ({done.length})
          </button>
          {showDone && done.map((t) => <TaskRow key={t.id} task={t} lists={lists} onChange={onChange} />)}
        </>
      )}
    </div>
  )
}

function TaskRow({ task, lists, onChange }: { task: Task; lists: TaskList[]; onChange: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)

  async function update(patch: Partial<Task>) {
    await act(async () => must(await supabase.from('tasks').update(patch).eq('id', task.id)))
    await onChange()
  }

  if (editing) return <TaskEditor task={task} listId={task.list_id!} lists={lists} onDone={() => setEditing(false)} onSaved={onChange} />

  return (
    <div className={task.done_at ? 'gtask done' : 'gtask'}>
      <button className="check" onClick={() => update({ done_at: task.done_at ? null : new Date().toISOString() })} aria-label={task.done_at ? 'Mark not done' : 'Mark done'}>
        {task.done_at ? '✓' : ''}
      </button>
      <div className="gtask-body" onClick={() => setEditing(true)}>
        <div className="gtask-title">{task.title}</div>
        {task.details && <div className="gtask-notes">{task.details}</div>}
        {task.due_date && task.done_at && <div className="muted small">{fmtWeekdayShort(task.due_date)}</div>}
      </div>
      <button className={task.starred ? 'star on' : 'star'} onClick={() => update({ starred: !task.starred })} aria-label={task.starred ? 'Unstar' : 'Star'}>
        {task.starred ? '★' : '☆'}
      </button>
    </div>
  )
}

function TaskEditor({ task, listId, lists, onDone, onSaved }: { task?: Task; listId: string; lists: TaskList[]; onDone: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.details ?? '')
  const [due, setDue] = useState(task?.due_date ?? '')
  const [list, setList] = useState(listId)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return onDone()
    const fields = { title: title.trim(), details: notes, due_date: due || null, list_id: list }
    const ok = await act(async () => must(task ? await supabase.from('tasks').update(fields).eq('id', task.id) : await supabase.from('tasks').insert(fields)))
    if (!ok) return
    onDone()
    await onSaved()
  }

  async function remove() {
    if (!task || !confirm(`Delete "${task.title}"?`)) return
    const ok = await act(async () => must(await supabase.from('tasks').delete().eq('id', task.id)))
    if (!ok) return
    onDone()
    await onSaved()
  }

  return (
    <form className="gedit" onSubmit={submit}>
      <input autoFocus placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea rows={2} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="row">
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
        {due && (
          <button type="button" className="btn small ghost" onClick={() => setDue('')}>
            Clear date
          </button>
        )}
        <select value={list} onChange={(e) => setList(e.target.value)} aria-label="List">
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <button className="btn small primary">Save</button>
        <button type="button" className="btn small ghost" onClick={onDone}>
          Cancel
        </button>
        {task && (
          <button type="button" className="btn small ghost danger" onClick={remove}>
            Delete
          </button>
        )}
      </div>
    </form>
  )
}
