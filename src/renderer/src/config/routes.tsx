import type { ReactElement } from 'react'
import {
  AnalysisRoute,
  DeveloperToolsRoute,
  DeviceSetupRoute,
  EventManagementRoute,
  FormBuilderRoute,
  HelpRoute,
  HomeRoute,
  ScoutRoute,
  SettingsRoute,
  SyncRoute,
} from './lazyRoutes'

export type AppRouteDefinition = {
  path: string
  element: ReactElement
  hubOnly?: boolean
  requiresDeveloperMode?: boolean
}

type CreateRoutesOptions = {
  appVersion: string
  onOpenAbout: () => void
}

export function createAppRoutes({ appVersion, onOpenAbout }: CreateRoutesOptions): AppRouteDefinition[] {
  return [
    { path: '/', element: <HomeRoute /> },
    { path: '/scout', element: <ScoutRoute /> },
    { path: '/events', element: <EventManagementRoute />, hubOnly: true },
    { path: '/analysis', element: <AnalysisRoute /> },
    { path: '/device-setup', element: <DeviceSetupRoute /> },
    { path: '/sync', element: <SyncRoute /> },
    { path: '/settings', element: <SettingsRoute appVersion={appVersion} onOpenAbout={onOpenAbout} /> },
    { path: '/developer-tools', element: <DeveloperToolsRoute appVersion={appVersion} />, requiresDeveloperMode: true },
    { path: '/form-builder', element: <FormBuilderRoute />, hubOnly: true },
    { path: '/help', element: <HelpRoute /> },
  ]
}
