import { createStoreHook } from './createStoreHook'

const ASSIGNMENTS_BETA_KEY = 'matchbook-assignments-beta'

type BetaFeaturesState = {
  assignmentsEnabled: boolean
  setAssignmentsEnabled: (enabled: boolean) => void
}

export const useBetaFeaturesStore = createStoreHook<BetaFeaturesState>((set) => ({
  assignmentsEnabled: localStorage.getItem(ASSIGNMENTS_BETA_KEY) === 'true',
  setAssignmentsEnabled: (enabled) => {
    localStorage.setItem(ASSIGNMENTS_BETA_KEY, String(enabled))
    set({ assignmentsEnabled: enabled })
  },
}))
