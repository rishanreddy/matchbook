import type { ReactElement } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Container,
  Group,
  Paper,
  Progress,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconDatabase,
  IconRefresh,
  IconRotateClockwise,
  IconTrash,
} from '@tabler/icons-react'
import { RouteHelpModal } from './RouteHelpModal'

type DatabaseInitScreenProps = {
  loading: boolean
  error: string | null
  appVersion: string
  onRetry: () => void
  onReset: () => void
  isResetting: boolean
}

export function DatabaseInitScreen({
  loading,
  error,
  appVersion,
  onRetry,
  onReset,
  isResetting,
}: DatabaseInitScreenProps): ReactElement {
  const hasError = Boolean(error)

  return (
    <Box className="db-init-root">
      <Container size="sm" py="xl">
        <Paper className="db-init-panel" p="xl" radius="lg" withBorder>
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
              <Group gap="md" align="center" wrap="nowrap">
                <ThemeIcon size={48} radius="md" variant="light" color={hasError ? 'red' : 'frc-blue.4'}>
                  <IconDatabase size={26} />
                </ThemeIcon>
                <Box>
                  <Title order={2} className="db-init-title">
                    {hasError ? 'Database setup needs attention' : 'Initializing local database'}
                  </Title>
                  <Text size="sm" c="slate.3">
                    {hasError
                      ? 'We could not finish startup using the current local cache.'
                      : 'Preparing offline database storage, indexes, and local cache state.'}
                  </Text>
                </Box>
              </Group>
              <Group gap="xs" wrap="nowrap">
                <RouteHelpModal
                  title="Database Startup"
                  description="Matchbook initializes local storage before routes become available."
                  steps={[
                    { title: 'Retry First', description: 'Transient startup issues often clear on retry.' },
                    { title: 'Reset If Needed', description: 'Use reset only if initialization repeatedly fails.' },
                    { title: 'Re-open App', description: 'After reset, startup recreates local collections.' },
                  ]}
                  tips={[
                    { text: 'Reset cache removes unsynced local data.' },
                    { text: 'Schema upgrades may increase startup time.' },
                  ]}
                  tooltipLabel="Database startup help"
                  color="frc-blue"
                  iconSize={16}
                />
                <Badge variant="light" color="frc-orange.4" className="mono-number">
                  v{appVersion}
                </Badge>
              </Group>
            </Group>

            <Progress
              value={100}
              size="sm"
              animated={loading}
              color={hasError ? 'red.6' : 'frc-blue.4'}
              className="db-init-progress"
            />

            {!hasError && (
              <Paper p="md" radius="md" className="db-init-callout" withBorder>
                <Group gap="xs" wrap="nowrap">
                  <IconRotateClockwise size={16} />
                  <Text size="sm" c="slate.2">
                    Startup can take a few seconds after schema upgrades.
                  </Text>
                </Group>
              </Paper>
            )}

            {hasError && (
              <Alert
                icon={<IconAlertTriangle size={16} />}
                color="red"
                variant="light"
                title="Unable to initialize local database"
              >
                <Text size="sm" mb="xs">
                  {error}
                </Text>
                <Text size="xs" c="red.2">
                  Try retry first. If the issue persists, reset local database cache and reinitialize.
                </Text>
              </Alert>
            )}

            <Group justify="flex-end" gap="sm">
              <Button
                variant="default"
                leftSection={<IconRefresh size={16} />}
                onClick={onRetry}
                loading={loading && !isResetting}
                disabled={isResetting}
              >
                Retry initialization
              </Button>
              <Button
                color="red"
                variant="light"
                leftSection={<IconTrash size={16} />}
                onClick={onReset}
                loading={isResetting}
                disabled={loading && !hasError}
              >
                Reset local cache
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Container>
    </Box>
  )
}
