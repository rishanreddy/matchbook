import type { ErrorInfo, ReactNode } from 'react'
import { Component } from 'react'
import { Alert, Button, Group, Stack, Text, Title } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { logger } from '../lib/utils/logger'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  public constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    logger.error('React error boundary caught component error', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })
  }

  private readonly reloadApp = (): void => {
    window.location.reload()
  }

  private readonly reportIssue = async (): Promise<void> => {
    const { error, errorInfo } = this.state
    const payload = {
      message: error?.message ?? 'Unknown error',
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    }
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
  }

  public render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <Stack p="xl" maw={700} mx="auto">
        <Alert icon={<IconAlertTriangle size={18} />} color="red" title="Something went wrong" variant="light">
          <Stack gap="xs">
            <Title order={4}>Something went wrong</Title>
            <Text size="sm" c="dimmed">
              The app hit an unexpected issue. You can reload now or copy an error report.
            </Text>
            {import.meta.env.DEV && this.state.error && (
              <Text size="xs" ff="monospace" c="red.2">
                {this.state.error.message}
              </Text>
            )}
            {import.meta.env.DEV && this.state.errorInfo && (
              <Text size="xs" ff="monospace" c="red.2" lineClamp={6}>
                {this.state.errorInfo.componentStack}
              </Text>
            )}
            <Group mt="xs">
              <Button onClick={this.reloadApp}>Reload App</Button>
              <Button variant="light" onClick={() => void this.reportIssue()}>
                Report Issue
              </Button>
            </Group>
          </Stack>
        </Alert>
      </Stack>
    )
  }
}
