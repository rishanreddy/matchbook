import type { RxCollection, RxDatabase, RxDocument } from 'rxdb'
import { assignmentSchema, type AssignmentDocType } from './schemas/assignments.schema'
import { deviceSchema, type DeviceDocType } from './schemas/devices.schema'
import { eventSchema, type EventDocType } from './schemas/events.schema'
import { formSchemaSchema, type FormSchemaDocType } from './schemas/formSchemas.schema'
import { matchSchema, type MatchDocType } from './schemas/matches.schema'
import { scoutSchema, type ScoutDocType } from './schemas/scouts.schema'
import { scoutingDataSchema, type ScoutingDataDocType } from './schemas/scoutingData.schema'

export type EventDocument = RxDocument<EventDocType>
export type DeviceDocument = RxDocument<DeviceDocType>
export type ScoutDocument = RxDocument<ScoutDocType>
export type MatchDocument = RxDocument<MatchDocType>
export type AssignmentDocument = RxDocument<AssignmentDocType>
export type FormSchemaDocument = RxDocument<FormSchemaDocType>
export type ScoutingDataDocument = RxDocument<ScoutingDataDocType>

export type ScoutingCollections = {
  events: RxCollection<EventDocType>
  devices: RxCollection<DeviceDocType>
  scouts: RxCollection<ScoutDocType>
  matches: RxCollection<MatchDocType>
  assignments: RxCollection<AssignmentDocType>
  formSchemas: RxCollection<FormSchemaDocType>
  scoutingData: RxCollection<ScoutingDataDocType>
}

export type ScoutingDatabase = RxDatabase<ScoutingCollections>

export const collectionSchemas = {
  events: { schema: eventSchema },
  devices: { schema: deviceSchema },
  scouts: { schema: scoutSchema },
  matches: { schema: matchSchema },
  assignments: { schema: assignmentSchema },
  formSchemas: { schema: formSchemaSchema },
  scoutingData: { schema: scoutingDataSchema },
}
