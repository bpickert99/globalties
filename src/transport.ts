// Agenda USA coordination: passengers, luggage, and the subject line Agenda files programs under.

import { fmtSlashRange } from './dates'
import { activePeople } from './logic'
import type { Participant, Project } from './types'

export const BAGS_PER_PERSON = 3

// Everyone riding: participants, interpreters and liaisons who haven't cancelled.
export function passengers(people: Participant[]): number {
  return activePeople(people).length
}

// "10/1-10/6: Youth in the Political Process", the subject Agenda files programs under.
export function agendaSubject(project: Project): string {
  return `${fmtSlashRange(project.arrival_date, project.departure_date)}: ${project.name}`
}
