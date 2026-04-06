import type { RxCollection, RxDatabase, RxDocument } from 'rxdb'
import { analysisConfigsSchema, type AnalysisConfigsDocType } from './schemas/analysisConfigs.schema'
import { appStateSchema, type AppStateDocType } from './schemas/appState.schema'
import { assignmentSchema, type AssignmentDocType } from './schemas/assignments.schema'
import { deviceSchema, type DeviceDocType } from './schemas/devices.schema'
import { eventSchema, type EventDocType } from './schemas/events.schema'
import { formSchemaSchema, type FormSchemaDocType } from './schemas/formSchemas.schema'
import { matchSchema, type MatchDocType } from './schemas/matches.schema'
import { scoutingDataSchema, type ScoutingDataDocType } from './schemas/scoutingData.schema'
import { scoutSchema, type ScoutDocType } from './schemas/scouts.schema'

export type EventDocument = RxDocument<EventDocType>
export type AnalysisConfigsDocument = RxDocument<AnalysisConfigsDocType>
export type AppStateDocument = RxDocument<AppStateDocType>
export type DeviceDocument = RxDocument<DeviceDocType>
export type ScoutDocument = RxDocument<ScoutDocType>
export type MatchDocument = RxDocument<MatchDocType>
export type AssignmentDocument = RxDocument<AssignmentDocType>
export type FormSchemaDocument = RxDocument<FormSchemaDocType>
export type ScoutingDataDocument = RxDocument<ScoutingDataDocType>

export type ScoutingCollections = {
  analysisConfigs: RxCollection<AnalysisConfigsDocType>
  appState: RxCollection<AppStateDocType>
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
  analysisConfigs: { schema: analysisConfigsSchema },
  appState: { schema: appStateSchema },
  events: { schema: eventSchema },
  devices: { schema: deviceSchema },
  scouts: { schema: scoutSchema },
  matches: { schema: matchSchema },
  assignments: { schema: assignmentSchema },
  formSchemas: { schema: formSchemaSchema },
  scoutingData: { schema: scoutingDataSchema },
}
