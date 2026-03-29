import type { RxJsonSchema } from 'rxdb'

export interface FormSchemaDocType {
  id: string
  eventId: string
  version: number
  schema: Record<string, unknown>
  isActive: boolean
  createdAt: string
}

export const formSchemaSchema: RxJsonSchema<FormSchemaDocType> = {
  title: 'formSchemas schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 128 },
    eventId: { type: 'string' },
    version: { type: 'number', minimum: 0 },
    schema: { type: 'object', additionalProperties: true },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string' },
  },
  required: ['id', 'eventId', 'version', 'schema', 'isActive', 'createdAt'],
  indexes: ['eventId', ['eventId', 'version']],
}
