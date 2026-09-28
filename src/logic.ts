import { addDays, daysBetween, today } from './dates'
import type { Anchor, Participant, Project, ScheduleItem, Task } from './types'

export function anchorDate(project: Project, anchor: Anchor): string {
  if (anchor === 'accepted') return project.accepted_on
  if (anchor === 'arrival') return project.arrival_date
  return project.departure_date
}

// Template tasks follow their anchor; standalone or manually dated tasks use due_date.
export function taskDue(task: Task, project: Project | undefined): string | null {
  if (task.anchor === null) return task.due_date
  if (!project) throw new Error(`Task ${task.id} is anchored but has no project`)
  return addDays(anchorDate(project, task.anchor), task.offset_days!)
}

// A task counts toward the project when enabled and its condition applies.
export function taskApplies(task: Task, project: Project | undefined): boolean {
  if (!task.enabled) return false
  if (task.requires === 'none') return true
  if (!project) throw new Error(`Task ${task.id} has a condition but no project`)
  return task.requires === 'home_hospitality' ? project.home_hospitality : project.has_event
}

export function progress(project: Project, tasks: Task[]): { done: number; total: number } {
  const applicable = tasks.filter((t) => t.project_id === project.id && taskApplies(t, project))
  return { done: applicable.filter((t) => t.done_at).length, total: applicable.length }
}

export function canClose(project: Project, tasks: Task[]): boolean {
  const p = progress(project, tasks)
  return p.done === p.total
}

export function stage(project: Project, tasks: Task[]): string {
  const now = today()
  if (project.closed_at) return 'Closed'
  if (now < project.arrival_date) {
    const days = daysBetween(now, project.arrival_date)
    return days === 1 ? 'Arrives tomorrow' : `Arrives in ${days} days`
  }
  if (now <= project.departure_date) return 'In Kansas City'
  return canClose(project, tasks) ? 'Ready to close' : 'Wrap-up'
}

export function fullName(p: Participant): string {
  return `${p.given_name} ${p.family_name.toUpperCase()}`
}

export function activePeople(people: Participant[]): Participant[] {
  return people.filter((p) => !p.cancelled_at)
}

export function sortItems(items: ScheduleItem[]): ScheduleItem[] {
  return [...items].sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      (a.start_time ?? '').localeCompare(b.start_time ?? '') ||
      a.created_at.localeCompare(b.created_at),
  )
}

export const KIND_LABELS: Record<ScheduleItem['kind'], string> = {
  meeting: 'Meeting',
  meal: 'Meal',
  activity: 'Cultural activity',
  home_hospitality: 'Home hospitality',
  transport: 'Transport',
  flight: 'Flight',
  note: 'Note',
}

export const STATUS_LABELS: Record<NonNullable<ScheduleItem['status']>, string> = {
  planned: 'To request',
  requested: 'Requested',
  confirmed: 'Confirmed',
  declined: 'Declined',
  thanked: 'Thanked',
}
