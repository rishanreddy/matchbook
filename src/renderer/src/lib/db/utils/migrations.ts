import type { MigrationStrategies } from 'rxdb'
import type { AssignmentDocType } from '../schemas/assignments.schema'
import type { DeviceDocType } from '../schemas/devices.schema'
import type { EventDocType } from '../schemas/events.schema'
import type { FormSchemaDocType } from '../schemas/formSchemas.schema'
import type { MatchDocType } from '../schemas/matches.schema'
import type { ScoutDocType } from '../schemas/scouts.schema'
import type { ScoutingDataDocType } from '../schemas/scoutingData.schema'

/**
 * Placeholder migration helper for future schema version bumps.
 */
export const emptyMigrationStrategies: MigrationStrategies = {}

function extractRxMeta(oldDocument: Record<string, unknown>): Record<string, unknown> {
  const now = Date.now()
  const randomRev = `1-${Math.random().toString(36).slice(2, 12)}`

  const deleted = typeof oldDocument._deleted === 'boolean' ? oldDocument._deleted : false
  const revision = typeof oldDocument._rev === 'string' && oldDocument._rev.length > 0 ? oldDocument._rev : randomRev

  const metaSource =
    typeof oldDocument._meta === 'object' && oldDocument._meta !== null
      ? (oldDocument._meta as Record<string, unknown>)
      : null
  const lwt = typeof metaSource?.lwt === 'number' ? metaSource.lwt : now

  const attachments =
    typeof oldDocument._attachments === 'object' && oldDocument._attachments !== null ? oldDocument._attachments : {}

  return {
    _deleted: deleted,
    _rev: revision,
    _meta: { lwt },
    _attachments: attachments,
  }
}

export const assignmentMigrations: MigrationStrategies<AssignmentDocType> = {
  1: (oldDocument) => {
    const old = oldDocument as unknown as Record<string, unknown>
    const matchKey = String(oldDocument.matchKey ?? '')
    const alliancePosition = String(oldDocument.alliancePosition ?? '')
    const canonicalId = matchKey && alliancePosition ? `${matchKey}:${alliancePosition}` : String(oldDocument.id ?? '')

    return {
      ...extractRxMeta(old),
      id: canonicalId,
      eventKey: String(oldDocument.eventKey ?? ''),
      matchKey,
      alliancePosition:
        alliancePosition === 'red1' ||
        alliancePosition === 'red2' ||
        alliancePosition === 'red3' ||
        alliancePosition === 'blue1' ||
        alliancePosition === 'blue2' ||
        alliancePosition === 'blue3'
          ? alliancePosition
          : 'red1',
      teamKey: String(oldDocument.teamKey ?? ''),
      scoutId: String(oldDocument.scoutId ?? ''),
      deviceId: String(oldDocument.deviceId ?? ''),
      assignedAt: String(oldDocument.assignedAt ?? new Date().toISOString()),
    }
  },
}

export const deviceMigrations: MigrationStrategies<DeviceDocType> = {
  1: (oldDocument) => {
    const old = oldDocument as unknown as Record<string, unknown>
    return {
      ...extractRxMeta(old),
      id: String(oldDocument.id ?? ''),
      name: String(oldDocument.name ?? ''),
      isPrimary: Boolean(oldDocument.isPrimary),
      lastSeenAt: String(oldDocument.lastSeenAt ?? new Date().toISOString()),
      createdAt: String(oldDocument.createdAt ?? new Date().toISOString()),
    }
  },
}

export const eventMigrations: MigrationStrategies<EventDocType> = {
  1: (oldDocument) => {
    const old = oldDocument as unknown as Record<string, unknown>
    return {
      ...extractRxMeta(old),
      id: String(oldDocument.id ?? ''),
      name: String(oldDocument.name ?? ''),
      season: Number(oldDocument.season ?? new Date().getFullYear()),
      startDate: String(oldDocument.startDate ?? ''),
      endDate: String(oldDocument.endDate ?? ''),
      syncedAt: String(oldDocument.syncedAt ?? new Date().toISOString()),
      createdAt: String(oldDocument.createdAt ?? new Date().toISOString()),
    }
  },
}

export const matchMigrations: MigrationStrategies<MatchDocType> = {
  1: (oldDocument) => {
    const old = oldDocument as unknown as Record<string, unknown>
    return {
      ...extractRxMeta(old),
      key: String(oldDocument.key ?? ''),
      eventId: String(oldDocument.eventId ?? ''),
      matchNumber: Number(oldDocument.matchNumber ?? 0),
      compLevel: String(oldDocument.compLevel ?? ''),
      predictedTime: String(oldDocument.predictedTime ?? new Date(0).toISOString()),
      redAlliance: Array.isArray(oldDocument.redAlliance) ? oldDocument.redAlliance.map((team) => String(team)) : [],
      blueAlliance: Array.isArray(oldDocument.blueAlliance) ? oldDocument.blueAlliance.map((team) => String(team)) : [],
      createdAt: String(oldDocument.createdAt ?? new Date().toISOString()),
    }
  },
}

export const scoutMigrations: MigrationStrategies<ScoutDocType> = {
  1: (oldDocument) => {
    const old = oldDocument as unknown as Record<string, unknown>
    return {
      ...extractRxMeta(old),
      id: String(oldDocument.id ?? ''),
      name: String(oldDocument.name ?? ''),
      deviceId: String(oldDocument.deviceId ?? ''),
      createdAt: String(oldDocument.createdAt ?? new Date().toISOString()),
    }
  },
}

export const formSchemaMigrations: MigrationStrategies<FormSchemaDocType> = {
  1: (oldDocument) => {
    const old = oldDocument as unknown as Record<string, unknown>
    return {
      ...extractRxMeta(old),
      id: String(oldDocument.id ?? ''),
      name: String(oldDocument.name ?? ''),
      surveyJson: (oldDocument.surveyJson as Record<string, unknown>) ?? {},
      isActive: Boolean(oldDocument.isActive),
      createdAt: String(oldDocument.createdAt ?? new Date().toISOString()),
      updatedAt: String(oldDocument.updatedAt ?? new Date().toISOString()),
    }
  },
  2: (oldDocument) => {
    const old = oldDocument as unknown as Record<string, unknown>
    return {
      ...extractRxMeta(old),
      id: String(oldDocument.id ?? ''),
      name: String(oldDocument.name ?? ''),
      surveyJson: (oldDocument.surveyJson as Record<string, unknown>) ?? {},
      isActive: Boolean(oldDocument.isActive),
      createdAt: String(oldDocument.createdAt ?? new Date().toISOString()),
      updatedAt: String(oldDocument.updatedAt ?? new Date().toISOString()),
    }
  },
  3: (oldDocument) => {
    const old = oldDocument as unknown as Record<string, unknown>
    // Migration from v2 to v3: remove eventKey and schemaVersion fields
    return {
      ...extractRxMeta(old),
      id: String(oldDocument.id ?? ''),
      name: String(oldDocument.name ?? ''),
      surveyJson: (oldDocument.surveyJson as Record<string, unknown>) ?? {},
      isActive: Boolean(oldDocument.isActive),
      createdAt: String(oldDocument.createdAt ?? new Date().toISOString()),
      updatedAt: String(oldDocument.updatedAt ?? new Date().toISOString()),
    }
  },
}

export const scoutingDataMigrations: MigrationStrategies<ScoutingDataDocType> = {
  1: (oldDocument) => {
    const old = oldDocument as unknown as Record<string, unknown>
    return {
      ...extractRxMeta(old),
      ...oldDocument,
    }
  },
  2: (oldDocument) => {
    // Migration from v1 to v2: convert to simple schema
    const old = oldDocument as unknown as Record<string, unknown>
    const matchKey = String(old.matchKey ?? '')
    const teamKey = String(old.teamKey ?? '')

    const extractMatchNumber = (value: string): number => {
      const lowered = value.toLowerCase()
      const stageMatch = lowered.match(/(?:^|_)(?:qm|qf|sf|f)(\d+)(?:$|_)/)
      if (stageMatch) {
        const parsed = Number(stageMatch[1])
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed
        }
      }

      const lastNumber = lowered.match(/(\d+)(?!.*\d)/)
      if (lastNumber) {
        const parsed = Number(lastNumber[1])
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed
        }
      }

      return 0
    }

    const extractTeamNumber = (value: string): number => {
      const frcTeam = value.toLowerCase().match(/frc(\d+)/)
      if (frcTeam) {
        const parsed = Number(frcTeam[1])
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed
        }
      }

      const anyNumber = value.match(/(\d+)/)
      if (anyNumber) {
        const parsed = Number(anyNumber[1])
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed
        }
      }

      return 0
    }
    
    // Extract numbers from keys like "2024event_qm12" -> 12, "frc254" -> 254
    const matchNum = extractMatchNumber(matchKey)
    const teamNum = extractTeamNumber(teamKey)
    
    return {
      ...extractRxMeta(old),
      id: String(old.id ?? ''),
      eventId: 'unknown',
      deviceId: 'unknown',
      matchNumber: matchNum,
      teamNumber: teamNum,
      timestamp: String(old.timestamp ?? new Date().toISOString()),
      autoScore: Number(old.autoScore ?? 0),
      teleopScore: Number(old.teleopScore ?? 0),
      endgameScore: Number(old.endgameScore ?? 0),
      formData: (old.formData as Record<string, unknown>) ?? {},
      notes: '',
      createdAt: String(old.createdAt ?? new Date().toISOString()),
    }
  },
  3: (oldDocument) => {
    // Migration from v2 to v3: add eventId field (default to 'unknown')
    const old = oldDocument as unknown as Record<string, unknown>
    return {
      ...extractRxMeta(old),
      id: String(old.id ?? ''),
      eventId: 'unknown',
      deviceId: 'unknown',
      matchNumber: Number(old.matchNumber ?? 0),
      teamNumber: Number(old.teamNumber ?? 0),
      timestamp: String(old.timestamp ?? new Date().toISOString()),
      autoScore: Number(old.autoScore ?? 0),
      teleopScore: Number(old.teleopScore ?? 0),
      endgameScore: Number(old.endgameScore ?? 0),
      formData: (old.formData as Record<string, unknown>) ?? {},
      notes: String(old.notes ?? ''),
      createdAt: String(old.createdAt ?? new Date().toISOString()),
    }
  },
  4: (oldDocument) => {
    // Migration from v3 to v4: add deviceId field (default to 'unknown')
    const old = oldDocument as unknown as Record<string, unknown>
    return {
      ...extractRxMeta(old),
      id: String(old.id ?? ''),
      eventId: String(old.eventId ?? 'unknown'),
      deviceId: 'unknown',
      matchNumber: Number(old.matchNumber ?? 0),
      teamNumber: Number(old.teamNumber ?? 0),
      timestamp: String(old.timestamp ?? new Date().toISOString()),
      autoScore: Number(old.autoScore ?? 0),
      teleopScore: Number(old.teleopScore ?? 0),
      endgameScore: Number(old.endgameScore ?? 0),
      formData: (old.formData as Record<string, unknown>) ?? {},
      notes: String(old.notes ?? ''),
      createdAt: String(old.createdAt ?? new Date().toISOString()),
    }
  },
  5: (oldDocument) => {
    // Migration from v4 to v5: allow nullable eventId and normalize legacy sentinel
    const old = oldDocument as unknown as Record<string, unknown>
    const rawEventId = old.eventId
    const normalizedEventId =
      typeof rawEventId === 'string' && rawEventId.length > 0 && rawEventId !== 'unknown' ? rawEventId : null

    return {
      ...extractRxMeta(old),
      id: String(old.id ?? ''),
      eventId: normalizedEventId,
      deviceId: String(old.deviceId ?? 'unknown'),
      matchNumber: Number(old.matchNumber ?? 0),
      teamNumber: Number(old.teamNumber ?? 0),
      timestamp: String(old.timestamp ?? new Date().toISOString()),
      autoScore: Number(old.autoScore ?? 0),
      teleopScore: Number(old.teleopScore ?? 0),
      endgameScore: Number(old.endgameScore ?? 0),
      formData: (old.formData as Record<string, unknown>) ?? {},
      notes: String(old.notes ?? ''),
      createdAt: String(old.createdAt ?? new Date().toISOString()),
    }
  },
}
