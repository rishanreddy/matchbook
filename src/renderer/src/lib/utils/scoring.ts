/**
 * Phase scoring for a scouted match.
 *
 * Matchbook forms are built by each team in the Form Builder, so there is no fixed
 * set of questions to score against. This previously read a hardcoded list of 2024
 * CRESCENDO field names (`autoNotes`, `teleopAmp`, `trapScores`, ...) that no form in
 * the app has ever produced, so every observation stored auto/teleop/endgame = 0 and
 * every team tied at zero in Analysis.
 *
 * Scores are now derived from whatever the form actually collected, grouped into
 * phases by the question's name prefix:
 *
 *   auto*              -> autonomous
 *   teleop*            -> teleop
 *   endgame* | climb*  -> endgame
 *
 * A numeric answer contributes its value; a checked box contributes 1. Anything else
 * (free text, unanswered, negative) contributes nothing.
 *
 * This is an activity count, not official FRC point values - Matchbook cannot know
 * what a given game awards for a given action. It is a consistent relative measure,
 * which is what ranking teams for alliance selection needs. Teams wanting true game
 * points should name their questions so the counts line up with what they care about.
 */

export type PhaseScores = {
  auto: number
  teleop: number
  endgame: number
  /** How many questions contributed. Zero means the form has no scorable fields. */
  scoredFieldCount: number
}

type Phase = 'auto' | 'teleop' | 'endgame'

/**
 * `endgame` and `climb` are checked before `teleop` so a question named
 * `teleopEndgameClimb` is not double-claimed; prefix order here is the tie-break.
 */
function phaseForField(fieldName: string): Phase | null {
  const normalized = fieldName.toLowerCase()

  if (normalized.startsWith('auto')) {
    return 'auto'
  }

  if (normalized.startsWith('endgame') || normalized.startsWith('climb')) {
    return 'endgame'
  }

  if (normalized.startsWith('teleop')) {
    return 'teleop'
  }

  return null
}

/**
 * Points contributed by a single answer, or null when the answer is not scorable.
 *
 * Negative numbers return null rather than 0 so a penalty-style field cannot quietly
 * drag a phase below what the scout actually recorded; `scoutingData` stores these as
 * non-negative integers.
 */
function pointsForAnswer(value: unknown): number | null {
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      return null
    }

    return Math.round(value)
  }

  return null
}

export function calculatePhaseScores(formData: Record<string, unknown>): PhaseScores {
  const scores: PhaseScores = { auto: 0, teleop: 0, endgame: 0, scoredFieldCount: 0 }

  for (const [fieldName, value] of Object.entries(formData)) {
    const phase = phaseForField(fieldName)
    if (!phase) {
      continue
    }

    const points = pointsForAnswer(value)
    if (points === null) {
      continue
    }

    scores[phase] += points
    scores.scoredFieldCount += 1
  }

  return scores
}

export function calculateAutoScore(formData: Record<string, unknown>): number {
  return calculatePhaseScores(formData).auto
}

export function calculateTeleopScore(formData: Record<string, unknown>): number {
  return calculatePhaseScores(formData).teleop
}

export function calculateEndgameScore(formData: Record<string, unknown>): number {
  return calculatePhaseScores(formData).endgame
}

/**
 * True when a form produced no scorable answers at all, so the caller can warn that
 * rankings will be meaningless rather than presenting a table of zeroes as a picklist.
 */
export function hasScorableFields(formData: Record<string, unknown>): boolean {
  return calculatePhaseScores(formData).scoredFieldCount > 0
}
