import { useDatabaseStore } from '../../../stores/useDatabase'

export function useRxDB() {
  return useDatabaseStore((state) => ({
    db: state.db,
    isLoading: state.isLoading,
    isInitialized: state.isInitialized,
    error: state.error,
  }))
}
