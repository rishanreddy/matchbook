import { useEffect, useState } from 'react'
import type { ScoutingDatabase } from '../../lib/db/collections'
import type { RosterScoutDocType } from '../../lib/db/schemas/roster.schema'
import { handleError } from '../../lib/utils/errorHandler'

/** The roster, kept current as scouts join, are renamed or go away. */
export function useRoster(db: ScoutingDatabase | null): { roster: RosterScoutDocType[]; loaded: boolean } {
  const [roster, setRoster] = useState<RosterScoutDocType[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!db) {
      return
    }

    const subscription = db.collections.roster.find().$.subscribe({
      next: (docs) => {
        setRoster(docs.map((doc) => doc.toJSON() as RosterScoutDocType))
        setLoaded(true)
      },
      error: (error: unknown) => handleError(error, 'Watch the scout roster'),
    })

    return () => subscription.unsubscribe()
  }, [db])

  return db ? { roster, loaded } : { roster: [], loaded: false }
}
