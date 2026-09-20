import { describe, expect, it } from 'vitest'
import { calculateAutoScore, calculateEndgameScore, calculatePhaseScores, calculateTeleopScore } from './scoring'

describe('phase scoring', () => {
  it('scores a form built with the auto/teleop/endgame naming convention', () => {
    const formData = {
      autoLeave: true,
      autoSpeakerNotes: 3,
      teleopSpeakerNotes: 6,
      teleopAmpNotes: 2,
      endgameClimb: true,
      endgameTrap: 1,
      scoutName: 'Priya',
      notes: 'played defense late',
    }

    expect(calculateAutoScore(formData)).toBe(4)
    expect(calculateTeleopScore(formData)).toBe(8)
    expect(calculateEndgameScore(formData)).toBe(2)
  })

  it('treats climb-prefixed fields as endgame', () => {
    expect(calculateEndgameScore({ climbSuccessful: true, climbLevel: 2 })).toBe(3)
  })

  it('is case-insensitive about the phase prefix', () => {
    expect(calculateAutoScore({ AutoNotes: 4 })).toBe(4)
    expect(calculateTeleopScore({ TeleOpNotes: 5 })).toBe(5)
  })

  it('ignores unscorable values instead of counting them', () => {
    const formData = {
      autoNotes: 'three',
      autoComment: 'good start',
      autoMissed: null,
      autoFouls: undefined,
    }

    expect(calculateAutoScore(formData)).toBe(0)
  })

  it('ignores negative numbers rather than subtracting from a phase', () => {
    expect(calculateTeleopScore({ teleopNotes: -5 })).toBe(0)
  })

  it('counts a false boolean as zero, not one', () => {
    expect(calculateAutoScore({ autoLeave: false })).toBe(0)
  })

  it('returns zero for a form with no phase-prefixed fields', () => {
    // A form whose questions are all named without a phase prefix cannot be scored.
    // Zero is correct here, but the Analysis screen warns rather than ranking on it.
    expect(calculatePhaseScores({ q1: 5, q2: true })).toEqual({
      auto: 0,
      teleop: 0,
      endgame: 0,
      scoredFieldCount: 0,
    })
  })

  it('reports how many fields contributed so callers can detect an unscorable form', () => {
    expect(calculatePhaseScores({ autoNotes: 2, teleopNotes: 3, other: 9 })).toEqual({
      auto: 2,
      teleop: 3,
      endgame: 0,
      scoredFieldCount: 2,
    })
  })

  it('rounds fractional ratings to whole points, since the schema stores integers', () => {
    expect(calculateTeleopScore({ teleopRating: 3.6 })).toBe(4)
  })
})

describe('numeric answers arriving as strings', () => {
  // SurveyJS returns a string from a text question with inputType "number".
  it('counts a numeric string', () => {
    expect(calculateTeleopScore({ teleopScored: '6' })).toBe(6)
  })

  it('counts numeric strings with surrounding whitespace', () => {
    expect(calculateAutoScore({ autoScored: ' 3 ' })).toBe(3)
  })

  it('still ignores free text and blank answers', () => {
    expect(calculateAutoScore({ autoComment: 'three pieces' })).toBe(0)
    expect(calculateAutoScore({ autoScored: '' })).toBe(0)
    expect(calculateAutoScore({ autoScored: '   ' })).toBe(0)
  })

  it('ignores a negative numeric string', () => {
    expect(calculateTeleopScore({ teleopScored: '-4' })).toBe(0)
  })
})
