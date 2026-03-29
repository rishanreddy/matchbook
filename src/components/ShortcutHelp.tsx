import type { ReactElement } from 'react'
import { Badge, Group, Modal, Stack, Text, Title } from '@mantine/core'

export type ShortcutHelpGroup = {
  category: string
  shortcuts: Array<{ keys: string; description: string }>
}

type ShortcutHelpProps = {
  opened: boolean
  onClose: () => void
  groups: ShortcutHelpGroup[]
}

export function ShortcutHelp({ opened, onClose, groups }: ShortcutHelpProps): ReactElement {
  return (
    <Modal opened={opened} onClose={onClose} title="Keyboard shortcuts" centered>
      <Stack>
        {groups.map((group) => (
          <Stack gap="xs" key={group.category}>
            <Title order={5}>{group.category}</Title>
            {group.shortcuts.map((shortcut) => (
              <Group key={`${group.category}-${shortcut.keys}`} justify="space-between" wrap="nowrap">
                <Text size="sm">{shortcut.description}</Text>
                <Badge variant="light" aria-label={`Shortcut ${shortcut.keys}`}>
                  {shortcut.keys}
                </Badge>
              </Group>
            ))}
          </Stack>
        ))}
      </Stack>
    </Modal>
  )
}
