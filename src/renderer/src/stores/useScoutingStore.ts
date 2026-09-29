import { createStoreHook } from './createStoreHook'

interface ScoutingState {
  activeMatchKey: string | null
  activeTeamNumber: string | null
  scoutingInProgress: boolean
  setActiveSession: (matchKey: string, teamNumber: string) => void
  clearActiveSession: () => void
}

export const useScoutingStore = createStoreHook<ScoutingState>((set) => ({
  activeMatchKey: null,
  activeTeamNumber: null,
  scoutingInProgress: false,
  setActiveSession: (matchKey, teamNumber) =>
    set({
      activeMatchKey: matchKey,
      activeTeamNumber: teamNumber,
      scoutingInProgress: true,
    }),
  clearActiveSession: () =>
    set({
      activeMatchKey: null,
      activeTeamNumber: null,
      scoutingInProgress: false,
    }),
}))
