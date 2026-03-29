export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel]

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: string
  data?: unknown
}

class Logger {
  private logs: LogEntry[] = []

  private add(level: LogLevel, message: string, data?: unknown, context?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      data,
    }

    this.logs.push(entry)

    if (this.logs.length > 1000) {
      this.logs.shift()
    }

    const prefix = context ? `[${context}] ${message}` : message
    if (level === LogLevel.ERROR) {
      console.error(prefix, data)
      return
    }
    if (level === LogLevel.WARN) {
      console.warn(prefix, data)
      return
    }
    if (level === LogLevel.INFO) {
      console.info(prefix, data)
      return
    }
    if (import.meta.env.DEV) {
      console.debug(prefix, data)
    }
  }

  debug(message: string, data?: unknown): void {
    this.add(LogLevel.DEBUG, message, data)
  }

  info(message: string, data?: unknown): void {
    this.add(LogLevel.INFO, message, data)
  }

  warn(message: string, data?: unknown): void {
    this.add(LogLevel.WARN, message, data)
  }

  error(message: string, error?: unknown): void {
    this.add(LogLevel.ERROR, message, error)
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
