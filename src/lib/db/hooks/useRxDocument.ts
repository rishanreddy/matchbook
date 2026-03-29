import { useEffect, useState } from 'react'
import type { ScoutingCollections } from '../collections'
import { useDatabaseStore } from '../../../stores/useDatabase'

export function useRxDocument<K extends keyof ScoutingCollections>(collectionName: K, id: string | null) {
  const db = useDatabaseStore((state) => state.db)
  const [document, setDocument] = useState<Record<string, unknown> | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!db || !id) {
      setDocument(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const rxQuery = db.collections[collectionName].findOne(id)
    const subscription = (rxQuery.$ as any).subscribe({
        next: (doc: { toJSON: () => Record<string, unknown> } | null) => {
          setDocument(doc ? doc.toJSON() : null)
          setIsLoading(false)
          setError(null)
        },
        error: (subscriptionError: unknown) => {
          setError(subscriptionError instanceof Error ? subscriptionError.message : 'Failed to load document')
          setIsLoading(false)
        },
      })

    return () => subscription.unsubscribe()
  }, [collectionName, db, id])

  return { document, isLoading, error }
}
