import { useEffect, useState } from 'react'
import type { ScoutingCollections } from '../collections'
import { useDatabaseStore } from '../../../stores/useDatabase'

export function useRxDocument<K extends keyof ScoutingCollections>(collectionName: K, id: string | null) {
  const db = useDatabaseStore((state) => state.db)
  const canQuery = Boolean(db && id)
  const [document, setDocument] = useState<Record<string, unknown> | null>(null)
  const queryKey = `${String(collectionName)}:${id ?? ''}`
  const [settledQueryKey, setSettledQueryKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!db || !id) {
      return
    }

    const rxQuery = db.collections[collectionName].findOne(id)
    const rxQueryObservable = rxQuery.$ as unknown as {
      subscribe: (observer: {
        next: (doc: { toJSON: () => Record<string, unknown> } | null) => void
        error: (subscriptionError: unknown) => void
      }) => { unsubscribe: () => void }
    }
    const subscription = rxQueryObservable.subscribe({
        next: (doc: { toJSON: () => Record<string, unknown> } | null) => {
          setDocument(doc ? doc.toJSON() : null)
          setSettledQueryKey(queryKey)
          setError(null)
        },
        error: (subscriptionError: unknown) => {
          setError(subscriptionError instanceof Error ? subscriptionError.message : 'Failed to load document')
          setSettledQueryKey(queryKey)
        },
      })

    return () => subscription.unsubscribe()
  }, [collectionName, db, id, queryKey])

  const isLoading = canQuery && settledQueryKey !== queryKey

  return {
    document: canQuery ? document : null,
    isLoading,
    error: canQuery ? error : null,
  }
}
