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
    name: { type: 'string', maxLength: 128 },
    isPrimary: { type: 'boolean' },
    lastSeenAt: { type: 'string', maxLength: 64 },
    createdAt: { type: 'string', maxLength: 64 },
  },
  required: ['id', 'name', 'isPrimary', 'lastSeenAt', 'createdAt'],
  indexes: ['lastSeenAt'],
}
