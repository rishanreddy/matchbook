// The Shape Detection API is not in TypeScript's DOM lib. Only what the QR scanner uses.
interface DetectedBarcode {
  rawValue: string
  format: string
}

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] })
  static getSupportedFormats(): Promise<string[]>
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
