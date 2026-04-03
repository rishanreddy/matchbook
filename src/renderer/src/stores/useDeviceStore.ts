import { create } from 'zustand'

interface DeviceState {
  deviceId: string | null
  deviceName: string | null
  isPrimary: boolean
  isLoaded: boolean
  setDevice: (payload: { deviceId: string; deviceName: string; isPrimary: boolean }) => void
  loadFromStorage: () => void
}

export const useDeviceStore = create<DeviceState>((set) => ({
  deviceId: null,
  deviceName: null,
  isPrimary: false,
  isLoaded: false,
  setDevice: ({ deviceId, deviceName, isPrimary }) => {
    // Persist to localStorage
    localStorage.setItem('matchbook-device-id', deviceId)
    localStorage.setItem('device_name', deviceName)
    localStorage.setItem('device_primary', String(isPrimary))
    set({ deviceId, deviceName, isPrimary, isLoaded: true })
  },
  loadFromStorage: () => {
    const deviceId = localStorage.getItem('matchbook-device-id')
    const deviceName = localStorage.getItem('device_name')
    const isPrimary = localStorage.getItem('device_primary') === 'true'
    set({ 
      deviceId, 
      deviceName, 
      isPrimary, 
      isLoaded: true 
    })
  },
}))

/**
 * Hook to check if the current device is a Hub (lead scout device)
 * Hub devices see the full UI, Scout devices see simplified UI
 */
export function useIsHub(): boolean {
  const isPrimary = useDeviceStore((state) => state.isPrimary)
  return isPrimary
}
