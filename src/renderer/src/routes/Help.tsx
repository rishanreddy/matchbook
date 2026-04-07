import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Accordion,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Group,
  List,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { formatForDisplay } from '@tanstack/react-hotkeys'
import {
  IconHelp,
  IconRocket,
  IconKeyboard,
  IconQuestionMark,
  IconBook,
  IconBug,
  IconTarget,
  IconRefresh,
  IconForms,
} from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { RouteHelpModal } from '../components/RouteHelpModal'
import { brand } from '../config/brand'
import { appShortcuts, getShortcutHotkey, loadShortcutBindings, type ShortcutBindings } from '../config/shortcuts'

const docsBaseUrl = brand.repoUrl
const issuesUrl = brand.supportIssuesUrl

export function Help(): ReactElement {
  const [shortcutBindings, setShortcutBindings] = useState<ShortcutBindings>(() => loadShortcutBindings())

  useEffect(() => {
    const handleShortcutBindingsChanged = (event: Event): void => {
      const customEvent = event as CustomEvent<ShortcutBindings>
      if (customEvent.detail) {
        setShortcutBindings(customEvent.detail)
        return
      }

      setShortcutBindings(loadShortcutBindings())
    }

    window.addEventListener('shortcuts:bindings-changed', handleShortcutBindingsChanged)
    return () => window.removeEventListener('shortcuts:bindings-changed', handleShortcutBindingsChanged)
  }, [])

  const shortcutRows = useMemo(
    () =>
      appShortcuts.map((shortcut) => ({
        keys: formatForDisplay(getShortcutHotkey(shortcut.id, shortcutBindings), { useSymbols: false }),
        action: shortcut.description,
      })),
    [shortcutBindings],
  )

  const openExternal = (url: string): void => {
    if (window.electronAPI) {
      void window.electronAPI.openExternal(url)
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <Box className="container-wide" py="xl">
      <Stack gap={32}>
        {/* Header */}
        <Box className="animate-fadeInUp">
          <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
            <Group gap="md">
              <ThemeIcon size={48} radius="xl" variant="gradient" gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}>
                <IconHelp size={26} stroke={1.5} />
              </ThemeIcon>
              <Box>
                <Title order={1} c="slate.0" style={{ fontSize: 28, fontWeight: 700 }}>
                  Help & Support
                </Title>
                <Text size="sm" c="slate.4">Guides, shortcuts, and troubleshooting</Text>
              </Box>
            </Group>

            <RouteHelpModal
              title="Help Center"
              description="Use this page for quick onboarding, shortcuts, and troubleshooting references."
              steps={[
                { title: 'Start with Quick Start', description: 'Follow role setup and sync flow before event kickoff.' },
                { title: 'Learn Shortcuts', description: 'Use keyboard commands to move faster between pages.' },
                { title: 'Report Issues', description: 'Send reproducible bug details with steps and screenshots.' },
              ]}
              tips={[
                { text: 'Hub laptops should manage forms, events, and analytics.' },
                { text: 'Scout laptops should focus on rapid match entry and sync.' },
              ]}
              tooltipLabel="How to use this page"
              color="frc-blue"
            />
          </Group>
        </Box>

        {/* Quick Start */}
        <Card 
          p="lg" 
          radius="lg" 
          style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}
        >
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="lg" variant="light" color="frc-blue">
                <IconRocket size={16} />
              </ThemeIcon>
              <Text fw={600} c="slate.0" size="lg">Quick Start</Text>
            </Group>

            <List 
              spacing="sm" 
              size="sm"
              styles={{
                item: { color: 'var(--mantine-color-slate-2)' },
              }}
            >
              <List.Item>Open Device Setup and choose Hub or Scout mode for this laptop.</List.Item>
              <List.Item>You can change device role later in Settings → Device Role.</List.Item>
              <List.Item>If you are the hub, customize the scouting form in Form Builder.</List.Item>
              <List.Item>Scouts open Scout, enter match and team numbers, then save observations.</List.Item>
              <List.Item>Use Sync to transfer either scoutingData or formSchemas between devices with QR codes.</List.Item>
              <List.Item>Open Analysis on the hub to review team averages and trends.</List.Item>
            </List>

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <Button 
                component={Link} 
                to="/form-builder" 
                variant="light" 
                color="frc-blue"
                leftSection={<IconForms size={16} />}
                radius="md"
                fullWidth
              >
                Form Builder
              </Button>
              <Button 
                component={Link} 
                to="/sync" 
                variant="light" 
                color="frc-blue"
                leftSection={<IconRefresh size={16} />}
                radius="md"
                fullWidth
              >
                Sync
              </Button>
              <Button 
                component={Link} 
                to="/scout" 
                variant="light" 
                color="frc-blue"
                leftSection={<IconTarget size={16} />}
                radius="md"
                fullWidth
              >
                Scout
              </Button>
            </SimpleGrid>
          </Stack>
        </Card>

        {/* Keyboard Shortcuts */}
        <Card 
          p="lg" 
          radius="lg" 
          style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}
        >
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="lg" variant="light" color="frc-orange">
                <IconKeyboard size={16} />
              </ThemeIcon>
              <Text fw={600} c="slate.0" size="lg">Keyboard Shortcuts</Text>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              {shortcutRows.map((shortcut) => (
                <Paper 
                  key={`${shortcut.action}-${shortcut.keys}`}
                  p="sm" 
                  radius="md" 
                  style={{ backgroundColor: 'var(--surface-base)' }}
                >
                  <Group justify="space-between">
                    <Text size="sm" c="slate.3">{shortcut.action}</Text>
                    <Badge variant="light" color="frc-blue" radius="md" className="mono-number">
                      {shortcut.keys}
                    </Badge>
                  </Group>
                </Paper>
              ))}
            </SimpleGrid>
          </Stack>
        </Card>

        {/* FAQ */}
        <Card 
          p="lg" 
          radius="lg" 
          style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}
        >
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="lg" variant="light" color="success">
                <IconQuestionMark size={16} />
              </ThemeIcon>
              <Text fw={600} c="slate.0" size="lg">Frequently Asked Questions</Text>
            </Group>

            <Accordion 
              variant="separated" 
              radius="md"
              styles={{
                item: {
                  backgroundColor: 'var(--surface-base)',
                  border: '1px solid var(--border-default)',
                },
                control: {
                  padding: 'var(--mantine-spacing-md)',
                },
                panel: {
                  padding: 'var(--mantine-spacing-md)',
                  paddingTop: 0,
                },
              }}
            >
              <Accordion.Item value="no-events">
                <Accordion.Control>
                  <Text fw={500} c="slate.1">Why do I not see the form I expected?</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Text size="sm" c="slate.4">
                    The app now uses one active scouting form. Open Form Builder on the hub and save the form you want scouts to use.
                  </Text>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="offline-sync">
                <Accordion.Control>
                  <Text fw={500} c="slate.1">How do I sync without internet?</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Text size="sm" c="slate.4">
                    Use QR export/import from the Sync page. Select scoutingData for match entries or formSchemas for form distribution.
                  </Text>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="form-builder">
                <Accordion.Control>
                  <Text fw={500} c="slate.1">Where do I create scouting questions?</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Text size="sm" c="slate.4">
                    Use Form Builder to build and save the active scouting form. That saved form is used for all new scouting entries.
                  </Text>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Stack>
        </Card>

        {/* Documentation */}
        <Card 
          p="lg" 
          radius="lg" 
          style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}
        >
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="lg" variant="light" color="frc-blue">
                <IconBook size={16} />
              </ThemeIcon>
              <Text fw={600} c="slate.0" size="lg">Documentation & Tutorials</Text>
            </Group>

            <Text size="sm" c="slate.3">
              Project docs and issue tracking live in the GitHub repository. Open the repository for the latest setup notes and development details.
            </Text>

            <Anchor
              href={docsBaseUrl}
              c="frc-blue.4"
              onClick={(event) => {
                event.preventDefault()
                openExternal(docsBaseUrl)
              }}
            >
              Open project repository
            </Anchor>

            <Paper p="md" radius="md" style={{ backgroundColor: 'rgba(26, 140, 255, 0.08)', border: '1px solid rgba(26, 140, 255, 0.2)' }}>
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <ThemeIcon size={28} radius="md" variant="light" color="frc-blue">
                  <IconBook size={14} />
                </ThemeIcon>
                <Stack gap={2}>
                  <Text size="sm" fw={600} c="slate.1">
                    Video tutorials coming soon
                  </Text>
                  <Text size="xs" c="slate.4">
                    Official training videos will be added before production release.
                  </Text>
                </Stack>
              </Group>
            </Paper>
          </Stack>
        </Card>

        {/* Report Issue */}
        <Card 
          p="lg" 
          radius="lg" 
          style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}
        >
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="lg" variant="light" color="danger">
                <IconBug size={16} />
              </ThemeIcon>
              <Text fw={600} c="slate.0" size="lg">Report an Issue</Text>
            </Group>

            <Text size="sm" c="slate.4">
              Include steps to reproduce, screenshots, device role, and match or team numbers when possible.
            </Text>

            <Button 
              color="danger" 
              variant="light"
              onClick={() => openExternal(issuesUrl)}
              leftSection={<IconBug size={16} />}
              radius="md"
            >
              Report Issue on GitHub
            </Button>
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
}
