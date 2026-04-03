declare module 'survey-core/themes' {
  export const LayeredDark: Record<string, unknown>
  export const DefaultDark: Record<string, unknown>

  const themes: Record<string, Record<string, unknown>>
  export default themes
}
