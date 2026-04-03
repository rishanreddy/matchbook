import type { ReactElement, ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useDeviceStore, useIsHub } from '../stores/useDeviceStore'

type HubOnlyRouteProps = {
  children: ReactNode
}

export function HubOnlyRoute({ children }: HubOnlyRouteProps): ReactElement {
  const isHub = useIsHub()
  const isDeviceLoaded = useDeviceStore((state) => state.isLoaded)
  const location = useLocation()

  if (!isDeviceLoaded) {
    return <></>
  }

  if (!isHub) {
    return <Navigate to="/" replace state={{ deniedFrom: location.pathname }} />
  }

  return <>{children}</>
}
