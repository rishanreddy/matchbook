import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { Button, Group, Modal, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'

export type CommandItem = {
  id: string
  label: string
  keywords: string
  category: string
  action: () => void
}

type CommandPaletteProps = {
  opened: boolean
  onClose: () => void
  commands: CommandItem[]
}

export function CommandPalette({ opened, onClose, commands }: CommandPaletteProps): ReactElement {
  const [query, setQuery] = useState<string>('')

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase()
    if (!lowered) {
      return commands
    }

    return commands.filter((command) => {
      return (
        command.label.toLowerCase().includes(lowered) ||
        command.keywords.toLowerCase().includes(lowered) ||
        command.category.toLowerCase().includes(lowered)
      )
    })
  }, [commands, query])

  return (
    <Modal opened={opened} onClose={onClose} title="Command palette" centered>
      <Stack>
        <TextInput
          placeholder="Search commands, teams, or matches"
          leftSection={<IconSearch size={16} />}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          autoFocus
          aria-label="Search commands"
        />

        <Stack gap="xs" mah={360} style={{ overflowY: 'auto' }}>
          {filtered.length > 0 ? (
            filtered.map((command) => (
              <UnstyledButton
                key={command.id}
                onClick={() => {
                  command.action()
                  onClose()
                }}
                style={{ borderRadius: 8, border: '1px solid var(--mantine-color-dark-4)', padding: 10 }}
                aria-label={`Run command: ${command.label}`}
              >
                <Group justify="space-between">
                  <Text fw={500}>{command.label}</Text>
                  <Text size="xs" c="dimmed">
                    {command.category}
                  </Text>
                </Group>
              </UnstyledButton>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              No commands found.
            </Text>
          )}
        </Stack>

        <Button variant="subtle" onClick={onClose}>
          Close
        </Button>
      </Stack>
    </Modal>
  )
}
