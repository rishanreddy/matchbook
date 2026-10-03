import type { ReactElement } from 'react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Accordion, Alert, Badge, Box, Button, Checkbox, Group, List, Modal, NumberInput, Stack, Stepper, Text, Textarea } from '@mantine/core'
import { IconAlertTriangle, IconArrowLeft, IconArrowRight, IconCheck, IconInfoCircle } from '@tabler/icons-react'
import { Survey } from 'survey-react-ui'
import { CopyTextButton } from '../../components/CopyTextButton'
import { StepList } from '../../components/StepList'
import { buildFixRequest, checkAiForm, type CheckResult, type Issue } from '../../lib/forms/ai/check'
import { extractFormJson } from '../../lib/forms/ai/extract'
import { buildAiFormPrompt } from '../../lib/forms/ai/prompt'
import { createScoutSurvey, setScoutContext } from '../../lib/forms/scoutSurvey'
import { applyMatchbookSurveyTheme } from '../../lib/utils/surveyTheme'
import { logger } from '../../lib/utils/logger'
import './aiForm.css'

type AiFormDialogProps = {
  opened: boolean
  onClose: () => void
  /** The form in the builder now, or null when it is empty. */
  currentForm: Record<string, unknown> | null
  season: number | null
  eventName: string | null
  /** Called with the checked form when the lead scout chooses to use it. */
  onUse: (form: Record<string, unknown>) => void
}

const LAST_STEP = 2

function IssueList({ issues }: { issues: Issue[] }): ReactElement {
  return (
    <List size="sm" spacing={4}>
      {issues.map((issue) => (
        <List.Item key={issue.message}>{issue.message}</List.Item>
      ))}
    </List>
  )
}

function describeScoring(check: CheckResult): string {
  const { auto, teleop, endgame } = check.stats.scored
  const counted = auto + teleop + endgame
  if (counted === 0) {
    return 'Numeric and boolean answers can be compared individually in Analysis. This form does not contribute to phase totals.'
  }

  return `Phase totals use ${auto} auto, ${teleop} teleop and ${endgame} endgame result fields. Other numeric and boolean answers are available as individual Analysis metrics.`
}

/**
 * Lets a lead scout have an AI chat assistant write the scouting form.
 *
 * Nothing is sent anywhere: Matchbook writes a prompt, the lead scout takes it to whichever AI
 * they use, and pastes the reply back. The reply is checked here before it can reach the form.
 */
export function AiFormDialog({ opened, onClose, currentForm, season, eventName, onUse }: AiFormDialogProps): ReactElement {
  const [step, setStep] = useState(0)
  const [includeCurrent, setIncludeCurrent] = useState(true)
  const [extraNotes, setExtraNotes] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [reply, setReply] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewMatch, setPreviewMatch] = useState<number | string>(1)
  const [previewTeam, setPreviewTeam] = useState<number | string>(254)
  const promptBox = useRef<HTMLTextAreaElement>(null)
  const [selectPromptRequests, setSelectPromptRequests] = useState(0)

  // Shown when copying fails: the prompt is opened and selected, so Ctrl+C is the only step left.
  useEffect(() => {
    if (selectPromptRequests > 0) {
      promptBox.current?.focus()
      promptBox.current?.select()
    }
  }, [selectPromptRequests])

  const revealPrompt = (): void => {
    setShowPrompt(true)
    setSelectPromptRequests((count) => count + 1)
  }

  const prompt = useMemo(
    () => buildAiFormPrompt({ season, eventName, currentForm: includeCurrent ? currentForm : null, extraNotes }),
    [currentForm, eventName, extraNotes, includeCurrent, season],
  )

  const deferredReply = useDeferredValue(reply)
  const hasReply = deferredReply.trim().length > 0
  const extraction = useMemo(() => extractFormJson(deferredReply), [deferredReply])
  const check = useMemo<CheckResult | null>(() => (extraction.ok ? checkAiForm(extraction.value) : null), [extraction])
  const fixRequest = useMemo(() => (check ? buildFixRequest(check) : ''), [check])
  const validationPending = reply !== deferredReply
  const canUse = !validationPending && Boolean(check?.form)
  const match = Number(previewMatch)
  const team = Number(previewTeam)
  const previewMatchNumber = Number.isInteger(match) && match > 0 ? match : 1
  const previewTeamNumber = Number.isInteger(team) && team > 0 ? team : 254

  const previewModel = useMemo(() => {
    if (!opened || !previewOpen || !canUse || !check?.form) {
      return null
    }

    const model = createScoutSurvey(check.form)
    applyMatchbookSurveyTheme(model)
    model.textUpdateMode = 'onTyping'
    model.checkErrorsMode = 'onValueChanged'
    model.completedHtml = '<p>Preview complete. These answers were not saved.</p>'
    model.showTitle = false
    if (model.pageCount > 1) model.showProgressBar = 'top'
    model.onComplete.add(() => logger.debug('AI form preview completed without saving answers', { pages: model.pageCount }, 'forms.ai'))
    return model
  }, [canUse, check, opened, previewOpen])

  useEffect(() => {
    if (previewModel) {
      setScoutContext(previewModel, previewMatchNumber, previewTeamNumber)
    }
  }, [previewMatchNumber, previewModel, previewTeamNumber])

  useEffect(() => () => previewModel?.dispose(), [previewModel])

  const resetPreview = (): void => {
    if (!previewModel) return
    previewModel.clear()
    previewModel.pages.forEach((page) => page.clearErrors())
    setScoutContext(previewModel, previewMatchNumber, previewTeamNumber)
    logger.debug('AI form preview reset', { pages: previewModel.pageCount }, 'forms.ai')
  }

  const applyForm = (): void => {
    // Recheck the actual textarea value; a deferred result must never apply an older reply.
    const currentExtraction = extractFormJson(reply)
    if (!currentExtraction.ok) return
    const currentCheck = checkAiForm(currentExtraction.value)
    if (!currentCheck.form) {
      logger.warn('AI form application refused after revalidation', { errors: currentCheck.errors.length }, 'forms.ai')
      return
    }

    logger.info('Checked AI form applied to builder', { ...currentCheck.stats, warnings: currentCheck.warnings.length }, 'forms.ai')
    onUse(currentCheck.form)
    setReply('')
    setStep(0)
    setPreviewOpen(false)
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Build the form with AI"
      size="xl"
      zIndex={4000}
      centered
      styles={{ header: { backgroundColor: 'var(--surface-raised)', zIndex: 3 } }}
    >
      <Stepper active={step} onStepClick={setStep} allowNextStepsSelect size="sm" iconSize={28} mb="md">
        <Stepper.Step label="Copy the prompt" description="Matchbook writes it">
          <Stack gap="md" mt="md">
            <Text size="sm">
              An AI chat assistant can write your scouting form, if it knows how Matchbook forms work. This prompt teaches it, then makes it interview you
              about your game. Paste it into ChatGPT, Claude, Gemini, Copilot or any AI chat you like.
            </Text>

            {currentForm ? (
              <Checkbox
                checked={includeCurrent}
                onChange={(event) => setIncludeCurrent(event.currentTarget.checked)}
                label="Include the form I have now, so the AI improves it instead of starting over"
              />
            ) : null}

            <Textarea
              label="Anything else the AI should know?"
              description="Optional. For example: “We only care about climbing and cycle speed.”"
              value={extraNotes}
              onChange={(event) => setExtraNotes(event.currentTarget.value)}
              maxLength={600}
              autosize
              minRows={2}
              maxRows={4}
            />

            <Group gap="sm">
              <CopyTextButton
                value={prompt}
                label="Copy the prompt"
                subject="Prompt"
                next="Now open your AI chat and paste it (Ctrl+V, or Cmd+V on a Mac)."
                failedMessage="The prompt is selected below. Press Ctrl+C (Cmd+C on a Mac) to copy it."
                onFailed={revealPrompt}
              />
              <Button variant="subtle" onClick={() => setShowPrompt((value) => !value)}>
                {showPrompt ? 'Hide the prompt' : 'Read the prompt'}
              </Button>
            </Group>

            {showPrompt ? (
              <Textarea ref={promptBox} aria-label="The prompt" className="ai-form-mono" readOnly value={prompt} autosize minRows={8} maxRows={14} />
            ) : null}
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Chat with the AI" description="Tell it about your game">
          <Stack gap="md" mt="md">
            <StepList
              steps={[
                {
                  title: 'Open an AI chat and start a new conversation',
                  detail: 'ChatGPT, Claude, Gemini, Microsoft Copilot or any assistant you already use. The free versions are fine.',
                },
                { title: 'Paste the prompt and send it', detail: 'The AI will ask about your game, one question at a time.' },
                {
                  title: 'Answer its questions',
                  detail: 'If it does not know this season’s game, paste the scoring summary from the game manual.',
                },
                {
                  title: 'When the list of questions looks right, say “Give me the final JSON”',
                  detail: 'It replies with the form inside a box of code.',
                },
                { title: 'Copy the AI’s whole reply', detail: 'You do not need to cut anything out. Matchbook finds the form for you.' },
              ]}
            />

            <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />}>
              The AI chat needs the internet, but Matchbook does not, so do this before you leave for the event. Matchbook never sends anything to the AI.
              Only what you paste does.
            </Alert>

            <Group>
              <CopyTextButton
                value={prompt}
                label="Copy the prompt again"
                subject="Prompt"
                next="Now open your AI chat and paste it (Ctrl+V, or Cmd+V on a Mac)."
                failedMessage="The prompt is selected on the first step. Press Ctrl+C (Cmd+C on a Mac) to copy it."
                onFailed={() => {
                  setStep(0)
                  revealPrompt()
                }}
                variant="default"
                size="compact-md"
                iconSize={14}
              />
            </Group>
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Paste the form" description="Check it, then use it">
          <Stack gap="md" mt="md">
            <Textarea
              label="The AI’s reply"
              description="Click in the box and paste (Ctrl+V, or Cmd+V on a Mac). Extra text around the form is fine."
              placeholder="Paste the AI’s reply here"
              className="ai-form-mono"
              value={reply}
              onChange={(event) => setReply(event.currentTarget.value)}
              autosize
              minRows={6}
              maxRows={12}
              data-autofocus
            />

            {validationPending ? (
              <Text size="sm" c="dimmed" role="status">Checking the updated reply…</Text>
            ) : !hasReply ? (
              <Text size="sm" c="dimmed">
                Matchbook checks the form as soon as you paste it.
              </Text>
            ) : extraction.ok && check ? (
              <Stack gap="sm">
                <Group gap="sm" wrap="wrap">
                  <Badge color={canUse ? 'green' : 'red'} variant="light" size="lg">
                    {canUse ? 'Ready to use' : 'Needs fixes'}
                  </Badge>
                  {canUse ? (
                    <Text size="sm">
                      {check.stats.pages} {check.stats.pages === 1 ? 'page' : 'pages'}, {check.stats.questions} {check.stats.questions === 1 ? 'question' : 'questions'}
                    </Text>
                  ) : null}
                </Group>

                {canUse ? (
                  <Text size="sm" c="dimmed">
                    {describeScoring(check)}
                    {extraction.repaired ? ' Matchbook fixed small formatting mistakes in the reply (comments, extra commas or curly quotes).' : ''}
                  </Text>
                ) : null}

                {check.errors.length > 0 ? (
                  <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} title="Fix these before you can use it">
                    <IssueList issues={check.errors} />
                  </Alert>
                ) : null}

                {check.warnings.length > 0 ? (
                  <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} title="Worth a look">
                    <IssueList issues={check.warnings} />
                  </Alert>
                ) : null}

                {fixRequest ? (
                  <Group gap="sm">
                    <CopyTextButton
                      value={fixRequest}
                      label="Copy a message for the AI"
                      subject="Message"
                      next="Paste it into the chat and the AI will send a corrected form."
                      failedMessage="Copy the problems listed above by hand and paste them into the chat."
                      variant="default"
                      size="compact-md"
                      iconSize={14}
                    />
                    <Text size="xs" c="dimmed">
                      Paste it into the chat and the AI will send a corrected form.
                    </Text>
                  </Group>
                ) : null}

                {canUse ? (
                  <>
                    <Accordion variant="separated" value={previewOpen ? 'preview' : null} onChange={(value) => setPreviewOpen(value === 'preview')}>
                      <Accordion.Item value="preview">
                        <Accordion.Control>Preview what scouts will see</Accordion.Control>
                        <Accordion.Panel>
                          <Stack gap="sm" mb="sm">
                            <Text size="sm" c="dimmed">Try the questions, page navigation and logic. Preview answers are never saved.</Text>
                            <Group align="end">
                              <NumberInput label="Preview match number" value={previewMatch} onChange={setPreviewMatch} min={1} allowDecimal={false} allowNegative={false} w={170} />
                              <NumberInput label="Preview team number" value={previewTeam} onChange={setPreviewTeam} min={1} allowDecimal={false} allowNegative={false} w={170} />
                              <Button variant="default" onClick={resetPreview}>Reset preview</Button>
                            </Group>
                          </Stack>
                          <Box className="ai-form-preview">{previewModel ? <Survey model={previewModel} /> : null}</Box>
                        </Accordion.Panel>
                      </Accordion.Item>
                    </Accordion>

                    <Alert color="gray" variant="light" icon={<IconInfoCircle size={16} />}>
                      Using this form replaces what is in the builder now. Your saved form does not change until you press Save Form.
                    </Alert>
                  </>
                ) : null}
              </Stack>
            ) : (
              <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} title="Matchbook could not use that">
                {extraction.ok ? '' : extraction.reason}
              </Alert>
            )}
          </Stack>
        </Stepper.Step>
      </Stepper>

      <Group justify="space-between" className="ai-form-footer">
        <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>
          Back
        </Button>
        {step < LAST_STEP ? (
          <Button rightSection={<IconArrowRight size={16} />} onClick={() => setStep((value) => Math.min(LAST_STEP, value + 1))}>
            {step === 0 ? 'Next: chat with the AI' : 'Next: paste the form'}
          </Button>
        ) : (
          <Button leftSection={<IconCheck size={16} />} onClick={applyForm} disabled={!canUse}>
            Use this form
          </Button>
        )}
      </Group>
    </Modal>
  )
}
