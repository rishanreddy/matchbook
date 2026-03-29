import type { RxJsonSchema } from 'rxdb'

export interface DeviceDocType {
  id: string
  name: string
  isPrimary: boolean
  lastSeenAt: string
  createdAt: string
}

export const deviceSchema: RxJsonSchema<DeviceDocType> = {
  title: 'devices schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 128 },
    name: { type: 'string' },
    isPrimary: { type: 'boolean' },
    lastSeenAt: { type: 'string' },
    createdAt: { type: 'string' },
  },
  required: ['id', 'name', 'isPrimary', 'lastSeenAt', 'createdAt'],
  indexes: ['lastSeenAt'],
}
