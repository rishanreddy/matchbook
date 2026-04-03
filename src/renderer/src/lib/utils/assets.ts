export function getPublicAssetPath(fileName: string): string {
  if (typeof window === 'undefined') {
    return `./${fileName}`
  }

  return new URL(fileName, window.location.href).toString()
}
