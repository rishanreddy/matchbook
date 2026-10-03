import type { RosterScoutDocType } from '../../lib/db/schemas/roster.schema'
import { POSITIONS, positionLabel, type PlanMatch } from './assign'
import { slotId, teamNumberOf } from './assignmentService'
import type { SlotStatus } from './coverage'

export type AssignmentRow = {
  matchKey: string
  matchNumber: number
  position: (typeof POSITIONS)[number]
  teamNumber: number | null
  scoutId: string
  scoutName: string
  status: SlotStatus
}

const STATUS_WORDS: Record<SlotStatus, string> = {
  open: 'Open',
  received: 'Received',
  waiting: 'Waiting for data',
  late: 'Late',
}

export function statusWords(status: SlotStatus): string {
  return STATUS_WORDS[status]
}

/** One row per station that has a team, in match order. */
export function buildRows(
  matches: readonly PlanMatch[],
  scoutBySlot: ReadonlyMap<string, string>,
  roster: readonly RosterScoutDocType[],
  statuses: ReadonlyMap<string, SlotStatus>,
): AssignmentRow[] {
  const names = new Map(roster.map((scout) => [scout.id, scout.name]))
  const rows: AssignmentRow[] = []
  for (const match of [...matches].sort((a, b) => a.matchNumber - b.matchNumber)) {
    for (const position of POSITIONS) {
      const teamKey = match.teams[position]
      if (teamKey === '') {
        continue
      }

      const id = slotId(match.key, position)
      const scoutId = scoutBySlot.get(id) ?? ''
      rows.push({
        matchKey: match.key,
        matchNumber: match.matchNumber,
        position,
        teamNumber: teamNumberOf(teamKey),
        scoutId,
        scoutName: scoutId === '' ? '' : (names.get(scoutId) ?? 'Unknown scout'),
        status: statuses.get(id) ?? 'open',
      })
    }
  }
  return rows
}

/** The plan as spreadsheet rows, grouped by scout so each scout's matches are together. */
export function toCsvRows(rows: readonly AssignmentRow[]): Record<string, unknown>[] {
  return [...rows]
    .filter((row) => row.scoutId !== '')
    .sort((a, b) => a.scoutName.localeCompare(b.scoutName) || a.matchNumber - b.matchNumber)
    .map((row) => ({
      Scout: row.scoutName,
      Match: row.matchNumber,
      Station: positionLabel(row.position),
      Team: row.teamNumber ?? '',
      Status: statusWords(row.status),
    }))
}
