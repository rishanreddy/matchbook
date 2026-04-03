import type { RxJsonSchema } from 'rxdb'

export interface ScoutDocType {
  id: string
  name: string
  deviceId: string
  createdAt: string
}

export const scoutSchema: RxJsonSchema<ScoutDocType> = {
  title: 'scouts schema',
  version: 1,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 128 },
    name: { type: 'string', maxLength: 128 },
    deviceId: { type: 'string', maxLength: 128 },
    createdAt: { type: 'string', maxLength: 64 },
  },
  required: ['id', 'name', 'deviceId', 'createdAt'],
  indexes: ['deviceId'],
}
