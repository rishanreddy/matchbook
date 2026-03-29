import { useEffect, useState } from 'react'
import type { ScoutingCollections } from '../collections'
import { useDatabaseStore } from '../../../stores/useDatabase'

export function useRxCollection<K extends keyof ScoutingCollections>(
  collectionName: K,
  query: Record<string, unknown> = {},
) {
  const db = useDatabaseStore((state) => state.db)
  const [data, setData] = useState<Record<string, unknown>[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!db) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const rxQuery = db.collections[collectionName].find(query as never)
    const subscription = (rxQuery.$ as any).subscribe({
        next: (docs: Array<{ toJSON: () => Record<string, unknown> }>) => {
          setData(docs.map((doc: { toJSON: () => Record<string, unknown> }) => doc.toJSON()))
          setIsLoading(false)
          setError(null)
        },
        error: (subscriptionError: unknown) => {
          setError(
            subscriptionError instanceof Error
              ? subscriptionError.message
              : `Failed to query ${String(collectionName)} collection`,
          )
          setIsLoading(false)
        },
      })

    return () => subscription.unsubscribe()
  }, [collectionName, db, query])

  return { data, isLoading, error }
}
