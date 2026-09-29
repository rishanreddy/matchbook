import { useStore as useReactStore } from '@tanstack/react-store'
import { Store } from '@tanstack/store'

type StateUpdater<T> = Partial<T> | T | ((state: T) => Partial<T> | T)
type StateSetter<T> = (update: StateUpdater<T>, replace?: boolean) => void
type StateSelector<T, Selected> = (state: T) => Selected

export type StoreHook<T> = {
  <Selected = T>(selector?: StateSelector<T, Selected>): Selected
  getState: () => T
  setState: StateSetter<T>
  subscribe: (listener: (state: T) => void) => () => void
}

/** TanStack Store hook with selector reads and imperative access for async services. */
export function createStoreHook<T>(initializer: (set: StateSetter<T>, get: () => T) => T): StoreHook<T> {
  const get = (): T => store.get()
  const set: StateSetter<T> = (update, replace = false) => {
    store.setState((state) => {
      const next = typeof update === 'function'
        ? (update as (state: T) => Partial<T> | T)(state)
        : update
      return replace ? next as T : { ...state, ...next }
    })
  }

  const store = new Store(initializer(set, get))

  const useAppStore = <Selected = T>(selector?: StateSelector<T, Selected>): Selected => {
    const select = selector ?? ((state: T) => state as unknown as Selected)
    return useReactStore(store, select)
  }

  useAppStore.getState = get
  useAppStore.setState = set
  useAppStore.subscribe = (listener: (state: T) => void) => {
    const subscription = store.subscribe((state) => listener(state))
    return () => subscription.unsubscribe()
  }

  return useAppStore as StoreHook<T>
}
