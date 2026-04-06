import type { RxJsonSchema } from 'rxdb'

export interface FormSchemaDocType {
  id: string
  name: string
  surveyJson: Record<string, unknown>
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
    name: { type: 'string' },
    surveyJson: { type: 'object', additionalProperties: true },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['id', 'name', 'surveyJson', 'isActive', 'createdAt', 'updatedAt'],
  indexes: ['isActive'],
}
