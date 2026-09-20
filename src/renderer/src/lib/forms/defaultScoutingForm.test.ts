import { describe, expect, it } from 'vitest'
import { DEFAULT_SCOUTING_FORM } from './defaultScoutingForm'
import { calculateAutoScore, calculateEndgameScore, calculatePhaseScores, calculateTeleopScore } from '../utils/scoring'

type Element = { type: string; name: string }

const elements: Element[] = (DEFAULT_SCOUTING_FORM.pages as Array<{ elements: Element[] }>).flatMap(
  (page) => page.elements,
)

describe('the default scouting form', () => {
  it('uses unique question names', () => {
    const names = elements.map((e) => e.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('actually produces a score, which is the whole point of shipping a default', () => {
    // A filled-in form the way SurveyJS would hand it back, numbers as strings.
    const answers = {
      autoMoved: true,
      autoScored: '2',
      autoReachedScoringArea: true,
      teleopScored: '7',
      teleopCycles: '4',
      driverSkill: 4,
      endgameClimbed: true,
      endgameParked: false,
      endgameScored: '1',
      playedDefense: true,
      brokeDown: false,
      tipped: false,
      droppedPieces: '3',
      notes: 'solid cycles',
    }

    expect(calculateAutoScore(answers)).toBe(4)
    expect(calculateTeleopScore(answers)).toBe(11)
    expect(calculateEndgameScore(answers)).toBe(2)
    expect(calculatePhaseScores(answers).scoredFieldCount).toBeGreaterThan(0)
  })

  it('never lets a negative trait raise a score', () => {
    // droppedPieces, brokeDown, tipped and playedDefense must not carry a phase
    // prefix, or a worse robot would outrank a better one.
    const penalties = ['droppedPieces', 'brokeDown', 'tipped', 'playedDefense', 'notes', 'driverSkill']

    for (const name of penalties) {
      expect(calculatePhaseScores({ [name]: 5 })).toEqual({
        auto: 0,
        teleop: 0,
        endgame: 0,
        scoredFieldCount: 0,
      })
    }
  })

  it('scores nothing when the form is untouched', () => {
    const untouched = { autoMoved: false, autoScored: 0, teleopScored: 0, endgameClimbed: false }
    expect(calculatePhaseScores(untouched).auto).toBe(0)
    expect(calculatePhaseScores(untouched).teleop).toBe(0)
  })
})
