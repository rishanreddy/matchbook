import type { RxJsonSchema } from 'rxdb'

export interface AssignmentDocType {
  id: string
  matchKey: string
  position: string
  teamNumber: string
  scoutId: string
  deviceId: string
  status: string
  createdAt: string
}

export const assignmentSchema: RxJsonSchema<AssignmentDocType> = {
  title: 'assignments schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 128 },
    matchKey: { type: 'string' },
    position: { type: 'string' },
    teamNumber: { type: 'string' },
    scoutId: { type: 'string' },
    deviceId: { type: 'string' },
    status: { type: 'string' },
    createdAt: { type: 'string' },
  },
  required: ['id', 'matchKey', 'position', 'teamNumber', 'scoutId', 'deviceId', 'status', 'createdAt'],
  indexes: ['matchKey', 'teamNumber', ['matchKey', 'position']],
}
