function toWholeNumber(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.max(0, Math.trunc(parsed))
}

export function calculateAutoScore(formData: Record<string, unknown>): number {
  const autoNotes = toWholeNumber(formData.autoNotes)
  const autoLeave = Boolean(formData.autoLeave)
  return autoNotes * 5 + (autoLeave ? 2 : 0)
}

export function calculateTeleopScore(formData: Record<string, unknown>): number {
  const teleopNotes = toWholeNumber(formData.teleopNotes)
  const teleopAmp = toWholeNumber(formData.teleopAmp)
  return teleopNotes * 2 + teleopAmp
}

export function calculateEndgameScore(formData: Record<string, unknown>): number {
  const trapScores = toWholeNumber(formData.trapScores)
  const climbStatus = String(formData.climbStatus ?? 'None')

  const climbPoints: Record<string, number> = {
    None: 0,
    Parked: 1,
    Onstage: 3,
    Spotlit: 4,
  }

  return trapScores * 5 + (climbPoints[climbStatus] ?? 0)
}
