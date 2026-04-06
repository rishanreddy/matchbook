import type { RxJsonSchema } from 'rxdb'

export interface AnalysisConfigsDocType {
  id: string
  formSchemaId: string
  formSchemaUpdatedAt: string
  configs: Record<string, unknown>
  updatedAt: string
}

export const analysisConfigsSchema: RxJsonSchema<AnalysisConfigsDocType> = {
  title: 'analysisConfigs schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    formSchemaId: { type: 'string', maxLength: 128 },
    formSchemaUpdatedAt: { type: 'string', maxLength: 64 },
    configs: { type: 'object', additionalProperties: true },
    updatedAt: { type: 'string', maxLength: 64 },
  },
  required: ['id', 'formSchemaId', 'formSchemaUpdatedAt', 'configs', 'updatedAt'],
  indexes: ['formSchemaId', 'updatedAt'],
}
