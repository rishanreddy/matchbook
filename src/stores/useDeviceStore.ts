import { create } from 'zustand'

interface DeviceState {
  deviceId: string | null
  deviceName: string | null
  isPrimary: boolean
  setDevice: (payload: { deviceId: string; deviceName: string; isPrimary: boolean }) => void
}

export const useDeviceStore = create<DeviceState>((set) => ({
  deviceId: null,
  deviceName: null,
  isPrimary: false,
  setDevice: ({ deviceId, deviceName, isPrimary }) => set({ deviceId, deviceName, isPrimary }),
}))
