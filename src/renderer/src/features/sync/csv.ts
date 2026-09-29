import Papa from 'papaparse'

export type CsvRow = Record<string, string>

export const MAX_CSV_ROWS = 10_000

/** Turns one scouting entry into flat columns, with each form answer as `formData.<question>`. */
export function flattenScoutingRow(row: Record<string, unknown>): CsvRow {
  const flat: CsvRow = {}
  Object.entries(row).forEach(([key, value]) => {
    if (key === 'formData' && value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([formKey, formValue]) => {
        flat[`formData.${formKey}`] = String(formValue ?? '')
      })
    } else {
      flat[key] = String(value ?? '')
    }
  })
  return flat
}

/**
 * Writes entries as CSV for a spreadsheet.
 *
 * Columns are the union across every row: entries scouted before the form changed have
 * different questions, and taking only the first row's columns dropped the rest.
 * Formula-looking cells are escaped so a note like `=HYPERLINK(...)` cannot run in Excel.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  const flat = rows.map(flattenScoutingRow)
  const fields = Array.from(new Set(flat.flatMap((row) => Object.keys(row))))
  return Papa.unparse({ fields, data: flat.map((row) => fields.map((field) => row[field] ?? '')) }, { escapeFormulae: true })
}

export type ParsedCsv = {
  rows: CsvRow[]
  error: string | null
}

export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<CsvRow>(text, { header: true, skipEmptyLines: true })

  if (!result.meta.fields?.includes('matchNumber') || !result.meta.fields?.includes('teamNumber')) {
    return { rows: [], error: 'The spreadsheet needs matchNumber and teamNumber columns.' }
  }

  if (result.data.length > MAX_CSV_ROWS) {
    return { rows: [], error: `Spreadsheets are limited to ${MAX_CSV_ROWS.toLocaleString()} rows. Split it and add the parts one at a time.` }
  }

  const first = result.errors[0]
  return { rows: result.data, error: first ? `Problem on row ${first.row ?? '?'}: ${first.message}` : null }
}

function toNonNegativeInteger(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}

/** Rebuilds a scouting entry from a spreadsheet row, or null when it has no valid match and team. */
export function csvRowToScoutingDoc(row: CsvRow): Record<string, unknown> | null {
  const matchNumber = Number(row.matchNumber)
  const teamNumber = Number(row.teamNumber)
  if (!Number.isInteger(matchNumber) || !Number.isInteger(teamNumber) || matchNumber < 1 || teamNumber < 1) {
    return null
  }

  const now = new Date().toISOString()
  const formData = Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => key.startsWith('formData.'))
      .map(([key, value]) => [key.replace('formData.', ''), value]),
  )

  return {
    id: row.id || crypto.randomUUID(),
    eventId: row.eventId && row.eventId !== 'unknown' && row.eventId !== 'null' ? row.eventId : 'none',
    deviceId: row.deviceId || 'unknown',
    matchNumber,
    teamNumber,
    timestamp: row.timestamp || now,
    autoScore: toNonNegativeInteger(row.autoScore),
    teleopScore: toNonNegativeInteger(row.teleopScore),
    endgameScore: toNonNegativeInteger(row.endgameScore),
    notes: row.notes ?? '',
    createdAt: row.createdAt || now,
    formData,
  }
}
