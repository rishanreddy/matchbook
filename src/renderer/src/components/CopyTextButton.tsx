import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Button, type ButtonProps } from '@mantine/core'
import { IconAlertTriangle, IconCheck, IconCopy } from '@tabler/icons-react'
import { copyText } from '../lib/utils/clipboard'
import { notify } from '../lib/utils/notify'

type CopyState = 'idle' | 'copied' | 'failed'

const RESULT_VISIBLE_MS = 3_500

type CopyTextButtonProps = Omit<ButtonProps, 'children' | 'color' | 'leftSection' | 'onClick'> & {
  /** The text that goes on the clipboard. */
  value: string
  label: string
  /** What is being copied, in a word or two ("Prompt", "Code"), for the confirmation. */
  subject: string
  /** Said with the confirmation: what to do with the copied text. */
  next?: string
  /** Said when copying fails: how to copy it by hand. */
  failedMessage?: string
  /** Lets the caller show the text, so it can be selected and copied by hand. */
  onFailed?: () => void
  iconSize?: number
}

/**
 * A Copy button that always says what happened. The button itself turns green with a tick, and a
 * toast confirms it. If the clipboard cannot be written, it turns red and says how to copy by hand
 * instead of doing nothing.
 */
export function CopyTextButton({
  value,
  label,
  subject,
  next,
  failedMessage,
  onFailed,
  iconSize = 16,
  variant,
  ...buttonProps
}: CopyTextButtonProps): ReactElement {
  const [state, setState] = useState<CopyState>('idle')
  const resetTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current)
      }
    },
    [],
  )

  const handleClick = async (): Promise<void> => {
    const copied = await copyText(value)

    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current)
    }
    setState(copied ? 'copied' : 'failed')
    resetTimer.current = window.setTimeout(() => setState('idle'), RESULT_VISIBLE_MS)

    if (copied) {
      notify({ color: 'green', title: `${subject} copied`, message: next ?? 'It is on your clipboard.', autoClose: RESULT_VISIBLE_MS })
      return
    }

    notify({
      color: 'red',
      title: `Could not copy the ${subject.toLowerCase()}`,
      message: failedMessage ?? 'Select the text and press Ctrl+C (Cmd+C on a Mac) to copy it yourself.',
    })
    onFailed?.()
  }

  const icon =
    state === 'copied' ? <IconCheck size={iconSize} /> : state === 'failed' ? <IconAlertTriangle size={iconSize} /> : <IconCopy size={iconSize} />

  return (
    <Button
      {...buttonProps}
      variant={state === 'idle' ? variant : 'light'}
      color={state === 'copied' ? 'green' : state === 'failed' ? 'red' : undefined}
      leftSection={icon}
      onClick={() => void handleClick()}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : label}
    </Button>
  )
}
