import { useEffect, useState } from 'react'
import type { ScoutingCollections } from '../collections'
import { useDatabaseStore } from '../../../stores/useDatabase'

export function useRxCollection<K extends keyof ScoutingCollections>(
  collectionName: K,
  query: Record<string, unknown> = {},
) {
  const db = useDatabaseStore((state) => state.db)
  const canQuery = Boolean(db)
  const [data, setData] = useState<Record<string, unknown>[]>([])
  const queryKey = `${String(collectionName)}:${JSON.stringify(query)}`
  const [settledQueryKey, setSettledQueryKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!db) {
      return
    }

    const rxQuery = db.collections[collectionName].find(query as never)
    const rxQueryObservable = rxQuery.$ as unknown as {
      subscribe: (observer: {
        next: (docs: Array<{ toJSON: () => Record<string, unknown> }>) => void
        error: (subscriptionError: unknown) => void
      }) => { unsubscribe: () => void }
    }
    const subscription = rxQueryObservable.subscribe({
        next: (docs: Array<{ toJSON: () => Record<string, unknown> }>) => {
          setData(docs.map((doc: { toJSON: () => Record<string, unknown> }) => doc.toJSON()))
          setSettledQueryKey(queryKey)
          setError(null)
        },
        error: (subscriptionError: unknown) => {
          setError(
            subscriptionError instanceof Error
              ? subscriptionError.message
              : `Failed to query ${String(collectionName)} collection`,
          )
          setSettledQueryKey(queryKey)
        },
      })

    return () => subscription.unsubscribe()
  }, [collectionName, db, query, queryKey])

  const isLoading = canQuery && settledQueryKey !== queryKey

  return {
    data: canQuery ? data : [],
    isLoading,
    error: canQuery ? error : null,
  }
}
