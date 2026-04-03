import { lazy } from 'react'

export const AnalysisRoute = lazy(async () => {
  const module = await import('../routes/Analysis')
  return { default: module.Analysis }
})

export const AssignmentsRoute = lazy(async () => {
  const module = await import('../routes/Assignments')
  return { default: module.Assignments }
})

export const DeviceSetupRoute = lazy(async () => {
  const module = await import('../routes/DeviceSetup')
  return { default: module.DeviceSetup }
})

export const EventManagementRoute = lazy(async () => {
  const module = await import('../routes/EventManagement')
  return { default: module.EventManagement }
})

export const FormBuilderRoute = lazy(async () => {
  const module = await import('../routes/FormBuilder')
  return { default: module.FormBuilder }
})

export const HelpRoute = lazy(async () => {
  const module = await import('../routes/Help')
  return { default: module.Help }
})

export const HomeRoute = lazy(async () => {
  const module = await import('../routes/Home')
  return { default: module.Home }
})

export const ScoutRoute = lazy(async () => {
  const module = await import('../routes/Scout')
  return { default: module.Scout }
})

export const SettingsRoute = lazy(async () => {
  const module = await import('../routes/Settings')
  return { default: module.Settings }
})

export const SyncRoute = lazy(async () => {
  const module = await import('../routes/Sync')
  return { default: module.Sync }
})
