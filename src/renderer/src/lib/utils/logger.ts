import {
  normalizeApplicationLogEntry,
  type ApplicationLogEntry,
  type ApplicationLogLevel,
} from '../../../../shared/logging'

export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const

export type LogLevel = ApplicationLogLevel
export type LogEntry = ApplicationLogEntry

class Logger {
  private logs: LogEntry[] = []

  private add(level: LogLevel, message: string, data?: unknown, context?: string): void {
    const entry = normalizeApplicationLogEntry({
      timestamp: new Date().toISOString(),
      level,
      message,
      context: context ?? 'renderer',
      data,
    })
    if (!entry) return

    this.logs.push(entry)
    if (this.logs.length > 1_000) {
      this.logs.splice(0, this.logs.length - 1_000)
    }

    if (typeof window === 'undefined' || !window.electronAPI) {
      const prefix = `[${entry.context}] ${entry.message}`
      switch (entry.level) {
        case LogLevel.ERROR:
          console.error(prefix, entry.data)
          break
        case LogLevel.WARN:
          console.warn(prefix, entry.data)
          break
        case LogLevel.INFO:
          console.info(prefix, entry.data)
          break
        case LogLevel.DEBUG:
          if (import.meta.env.DEV) console.debug(prefix, entry.data)
          break
      }
    }

    try {
      if (typeof window !== 'undefined') window.electronAPI?.writeLog(entry)
    } catch (error: unknown) {
      // Keep the in-memory diagnostics usable while the app is shutting down or
      // the main process is unavailable. Main-process logs cover startup failures.
      if (import.meta.env.DEV) console.warn('[logger] Could not forward entry to electron-log', error)
    }
  }

  debug(message: string, data?: unknown, context?: string): void {
    this.add(LogLevel.DEBUG, message, data, context)
  }

  info(message: string, data?: unknown, context?: string): void {
    this.add(LogLevel.INFO, message, data, context)
  }

  warn(message: string, data?: unknown, context?: string): void {
    this.add(LogLevel.WARN, message, data, context)
  }

  error(message: string, error?: unknown, context?: string): void {
    this.add(LogLevel.ERROR, message, error, context)
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2)
  }

  clearLogs(): void {
    this.logs = []
  }
}

export const logger = new Logger()
