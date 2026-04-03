import type { ReactElement } from 'react'
import { Anchor, Button, Group, Modal, Stack, Text, Title } from '@mantine/core'
import { brand } from '../config/brand'

type AboutDialogProps = {
  opened: boolean
  onClose: () => void
  version: string
  onCheckForUpdates: () => void
}

export function AboutDialog({ opened, onClose, version, onCheckForUpdates }: AboutDialogProps): ReactElement {
  return (
    <Modal opened={opened} onClose={onClose} title={`About ${brand.name}`} size="lg">
      <Stack>
        <Title order={4}>{brand.name}</Title>
        <Text size="sm">Version {version}</Text>
        <Text size="sm">Copyright © 2024</Text>
        <Text size="sm">License: MIT</Text>
        <Text size="sm">Built with Electron, React, TypeScript, Mantine, Vite, and RxDB.</Text>
        <Text size="sm">A grounded scouting workspace for fast event-day decisions.</Text>
        <Anchor href={brand.repoUrl} target="_blank" rel="noreferrer">
          GitHub Repository
        </Anchor>
        <Group justify="space-between">
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onCheckForUpdates}>Check for Updates</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
