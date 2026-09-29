import type { ReactElement, ReactNode } from 'react'
import { Text } from '@mantine/core'
import { renderInline } from '../content/inline'

export type Step = {
  /** `**bold**` marks the name of something on screen. */
  title: string
  detail?: ReactNode
}

/** Numbered instructions written for someone who has never used the app. */
export function StepList({ steps }: { steps: readonly Step[] }): ReactElement {
  return (
    <ol className="step-list">
      {steps.map((step, index) => (
        <li key={step.title} className="step-list__item">
          <span className="step-list__number" aria-hidden="true">
            {index + 1}
          </span>
          <div>
            <Text fw={400} c="slate.0" size="sm" className="step-list__title">
              {renderInline(step.title)}
            </Text>
            {step.detail ? (
              <Text size="sm" c="slate.3" mt={2}>
                {typeof step.detail === 'string' ? renderInline(step.detail) : step.detail}
              </Text>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
