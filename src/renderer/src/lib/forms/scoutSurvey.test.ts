import { describe, expect, it } from 'vitest'
import { calculatePhaseScores } from '../utils/scoring'
import { EXAMPLE_FORM } from './ai/prompt'
import { createScoutSurvey, setScoutContext, withMatchbookContext } from './scoutSurvey'

describe('the shared scouting context', () => {
  it('preserves root elements, logic and input immutability', () => {
    const form = { elements: [{ type: 'text', name: 'pieces', inputType: 'number', visibleIf: '{_matchNumber} > 0' }] }
    const before = JSON.stringify(form)
    const model = createScoutSurvey(form)
    setScoutContext(model, 12, 254)
    expect(model.jsonErrors).toBeNull()
    expect(model.validateExpressions()).toEqual([])
    expect(model.getQuestionByName('pieces').isVisible).toBe(true)
    expect(JSON.stringify(form)).toBe(before)
    expect(withMatchbookContext(form)).not.toHaveProperty('elements')
    model.dispose()
  })

  it('retains hidden context at completion even when invisible answers are cleared', () => {
    const model = createScoutSurvey({ clearInvisibleValues: 'onHidden', elements: [{ type: 'comment', name: 'notes' }] })
    setScoutContext(model, 7, 111)
    model.setValue('notes', 'Reliable')
    model.doComplete()
    expect(model.data).toEqual({ _matchNumber: '7', _teamNumber: '111', notes: 'Reliable' })
    model.dispose()
  })

  it('keeps imported context questions from overriding the app context on later pages', () => {
    const model = createScoutSurvey({ pages: [
      { elements: [{ type: 'comment', name: 'notes' }] },
      { elements: [{ type: 'panel', name: 'details', elements: [{ type: 'text', name: '_teamNumber', defaultValue: '999' }] }] },
    ] })
    setScoutContext(model, 5, 254)
    expect(model.getAllQuestions().filter((question) => question.name === '_teamNumber')).toHaveLength(1)
    expect(model.getQuestionByName('_teamNumber').isVisible).toBe(false)
    expect(model.data._teamNumber).toBe('254')
    model.dispose()
  })

  it('saves example calculations and scores only the intended answers', () => {
    const model = createScoutSurvey(EXAMPLE_FORM)
    setScoutContext(model, 9, 254)
    model.setValue('autoLeftStartingZone', true)
    model.setValue('autoScored', '3')
    model.setValue('teleopScored', '8')
    model.setValue('attemptedClimb', true)
    model.setValue('endgameClimbed', true)
    model.setValue('driverSkill', 5)
    model.setValue('foulsCommitted', '2')
    model.doComplete()
    expect(model.data.piecesTotal).toBe(11)
    expect(calculatePhaseScores(model.data)).toEqual({ auto: 4, teleop: 8, endgame: 1, scoredFieldCount: 4 })
    model.dispose()
  })

  it('clears a conditional answer when its controlling answer changes', () => {
    const model = createScoutSurvey(EXAMPLE_FORM)
    model.setValue('attemptedClimb', true)
    model.setValue('endgameClimbed', true)
    model.setValue('attemptedClimb', false)
    expect(model.getQuestionByName('endgameClimbed').isVisible).toBe(false)
    expect(model.data).not.toHaveProperty('endgameClimbed')
    model.dispose()
  })
})
