import type { RxJsonSchema } from 'rxdb'

export interface FormSchemaDocType {
  id: string
  eventKey: string
  name: string
  surveyJson: Record<string, unknown>
  schemaVersion: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export const formSchemaSchema: RxJsonSchema<FormSchemaDocType> = {
  title: 'formSchemas schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 128 },
    eventKey: { type: 'string' },
    name: { type: 'string' },
    surveyJson: { type: 'object', additionalProperties: true },
    schemaVersion: { type: 'number', minimum: 0 },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['id', 'eventKey', 'name', 'surveyJson', 'schemaVersion', 'isActive', 'createdAt', 'updatedAt'],
  indexes: ['eventKey', ['eventKey', 'schemaVersion'], ['eventKey', 'isActive']],
}
