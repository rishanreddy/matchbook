import type { RxJsonSchema } from 'rxdb'

export interface AssignmentDocType {
  id: string
  eventKey: string
  matchKey: string
  alliancePosition: 'red1' | 'red2' | 'red3' | 'blue1' | 'blue2' | 'blue3'
  teamKey: string
  scoutId: string
  deviceId: string
  assignedAt: string
}

export const assignmentSchema: RxJsonSchema<AssignmentDocType> = {
  title: 'assignments schema',
  version: 1,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 128 },
    eventKey: { type: 'string', maxLength: 128 },
    matchKey: { type: 'string', maxLength: 128 },
    alliancePosition: {
      type: 'string',
      maxLength: 8,
      enum: ['red1', 'red2', 'red3', 'blue1', 'blue2', 'blue3'],
    },
    teamKey: { type: 'string', maxLength: 128 },
    scoutId: { type: 'string', maxLength: 128 },
    deviceId: { type: 'string', maxLength: 128 },
    assignedAt: { type: 'string', maxLength: 64 },
  },
  required: [
    'id',
    'eventKey',
    'matchKey',
    'alliancePosition',
    'teamKey',
    'scoutId',
    'deviceId',
    'assignedAt',
  ],
  indexes: ['eventKey', 'matchKey', 'scoutId', 'deviceId', ['matchKey', 'alliancePosition']],
}
