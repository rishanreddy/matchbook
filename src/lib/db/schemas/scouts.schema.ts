import type { RxJsonSchema } from 'rxdb'

export interface ScoutDocType {
  id: string
  name: string
  deviceId: string
  createdAt: string
}

export const scoutSchema: RxJsonSchema<ScoutDocType> = {
  title: 'scouts schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 128 },
    name: { type: 'string' },
    deviceId: { type: 'string' },
    createdAt: { type: 'string' },
  },
  required: ['id', 'name', 'deviceId', 'createdAt'],
  indexes: ['deviceId'],
}
