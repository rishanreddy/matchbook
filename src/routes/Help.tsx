import type { ReactElement } from 'react'
import { Alert, Anchor, Button, Card, Group, List, Stack, Text, Title } from '@mantine/core'
import { IconAlertCircle, IconExternalLink } from '@tabler/icons-react'
import { Link } from 'react-router-dom'

const docsBaseUrl = 'https://github.com/your-org/offline-scouting-manager'
const tutorialsPlaylistUrl = 'https://www.youtube.com/playlist?list=REPLACE_WITH_PLAYLIST_ID'
const issuesUrl = `${docsBaseUrl}/issues/new/choose`

export function Help(): ReactElement {
  const openExternal = (url: string): void => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <Stack>
      <Title order={2}>Help & Support</Title>

      <Card withBorder radius="md" p="lg">
        <Stack>
          <Title order={4}>Quick Start</Title>
          <List>
            <List.Item>Run the first-time setup wizard and register your device.</List.Item>
            <List.Item>Set your TBA API key in Settings.</List.Item>
            <List.Item>Import an event from the Events page.</List.Item>
            <List.Item>Create assignments from the Assignments page.</List.Item>
            <List.Item>Scouts open Scout page and submit observations.</List.Item>
          </List>
          <Group>
            <Button component={Link} to="/events" variant="light">
              Go to Events
            </Button>
            <Button component={Link} to="/assignments" variant="light">
              Go to Assignments
            </Button>
            <Button component={Link} to="/scout" variant="light">
              Go to Scout
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <Stack>
          <Title order={4}>Keyboard Shortcuts</Title>
          <List size="sm">
            <List.Item>Ctrl/Cmd + K: Open command palette</List.Item>
            <List.Item>Ctrl/Cmd + ,: Open settings</List.Item>
            <List.Item>Ctrl/Cmd + S: Save scouting form</List.Item>
            <List.Item>Ctrl/Cmd + H: Go home</List.Item>
            <List.Item>Ctrl/Cmd + Shift + S: Go to scout page</List.Item>
            <List.Item>Ctrl/Cmd + Shift + A: Go to analysis</List.Item>
            <List.Item>Ctrl/Cmd + Shift + Y: Go to sync</List.Item>
            <List.Item>?: Open shortcut help</List.Item>
          </List>
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <Stack>
          <Title order={4}>FAQ</Title>
          <Text fw={600}>Why do I not see events?</Text>
          <Text size="sm" c="dimmed">Add a valid TBA API key in Settings, then fetch events by season year.</Text>
          <Text fw={600}>How do I sync without internet?</Text>
          <Text size="sm" c="dimmed">Use QR export/import, CSV export/import, or full database snapshot transfer.</Text>
          <Text fw={600}>Where do I create scouting questions?</Text>
          <Text size="sm" c="dimmed">Use Form Builder to build and save an active form per event.</Text>
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <Stack>
          <Title order={4}>Documentation & Tutorials</Title>
          <Text size="sm">
            Full docs are available in <Anchor href={`${docsBaseUrl}/blob/main/USER_GUIDE.md`} target="_blank">USER_GUIDE.md</Anchor>{' '}
            and <Anchor href={`${docsBaseUrl}/blob/main/DEVELOPER.md`} target="_blank">DEVELOPER.md</Anchor>.
          </Text>
          <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light" title="Video tutorials placeholder">
            Add your official training playlist here before production release.
          </Alert>
          <Button leftSection={<IconExternalLink size={16} />} variant="light" onClick={() => openExternal(tutorialsPlaylistUrl)}>
            Open YouTube Tutorial Playlist
          </Button>
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <Stack>
          <Title order={4}>Report an Issue</Title>
          <Text size="sm" c="dimmed">
            Include steps to reproduce, screenshots, event key, and device ID when possible.
          </Text>
          <Button color="red" onClick={() => openExternal(issuesUrl)}>
            Report Issue
          </Button>
        </Stack>
      </Card>
    </Stack>
  )
}
