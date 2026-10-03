import type { RxJsonSchema } from 'rxdb'

/**
 * `active`: available to be assigned matches. `away`: on a break or not here today, so no new
 * matches go to them. `removed`: no longer on the roster. Removal is a status, not a deletion,
 * because syncing only ever adds and updates: a deleted row would come back the next time the
 * scout's laptop sent its name.
 */
export type RosterStatus = 'active' | 'away' | 'removed'

export const ROSTER_STATUSES: readonly RosterStatus[] = ['active', 'away', 'removed']

export interface RosterScoutDocType {
  id: string
  name: string
  /** The laptop this scout uses, or an empty string for a scout the lead scout added by hand. */
  deviceId: string
  /** What the scout's laptop is called, so the lead scout can tell which laptop is whose. */
  deviceName: string
  status: RosterStatus
  createdAt: string
  /** The newest change wins when two laptops disagree about a scout. */
  updatedAt: string
}

export const rosterSchema: RxJsonSchema<RosterScoutDocType> = {
  title: 'roster schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 128 },
    name: { type: 'string', maxLength: 128 },
    deviceId: { type: 'string', maxLength: 128 },
    deviceName: { type: 'string', maxLength: 128 },
    status: { type: 'string', maxLength: 16, enum: ['active', 'away', 'removed'] },
    createdAt: { type: 'string', maxLength: 64 },
    updatedAt: { type: 'string', maxLength: 64 },
  },
  required: ['id', 'name', 'deviceId', 'deviceName', 'status', 'createdAt', 'updatedAt'],
  indexes: ['deviceId', 'updatedAt'],
}
