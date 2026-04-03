import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import {
  Box,
  Group,
  Kbd,
  Modal,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import { IconCommand, IconSearch, IconArrowRight } from '@tabler/icons-react'
import type { CommandItem } from './types'

type CommandPaletteProps = {
  opened: boolean
  onClose: () => void
  commands: CommandItem[]
}

export function CommandPalette({ opened, onClose, commands }: CommandPaletteProps): ReactElement {
  const [query, setQuery] = useState<string>('')
  const [selectedIndex, setSelectedIndex] = useState<number>(0)

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

  const handleQueryChange = (value: string): void => {
    setQuery(value)
    setSelectedIndex(0)
  }

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (event.key === 'Enter' && filtered[selectedIndex]) {
      event.preventDefault()
      filtered[selectedIndex].action()
      onClose()
    }
  }

  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {}
    filtered.forEach((cmd) => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = []
      }
      groups[cmd.category].push(cmd)
    })
    return groups
  }, [filtered])

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      centered
      size="lg"
      padding={0}
      radius="lg"
      overlayProps={{
        opacity: 0.7,
        blur: 8,
      }}
      styles={{
        content: {
          background: 'linear-gradient(165deg, rgba(22, 27, 34, 0.98) 0%, rgba(13, 17, 23, 0.99) 100%)',
          border: '1px solid rgba(29, 161, 242, 0.2)',
          boxShadow: '0 25px 80px rgba(0, 0, 0, 0.6), 0 0 40px rgba(29, 161, 242, 0.1)',
          overflow: 'hidden',
        },
      }}
    >
      <Box
        p="md"
        style={{
          borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
          background: 'rgba(29, 161, 242, 0.05)',
        }}
      >
        <TextInput
          placeholder="Search commands, teams, or matches..."
          leftSection={<IconSearch size={18} style={{ color: 'var(--mantine-color-slate-4)' }} />}
          rightSection={
            <Kbd size="xs" style={{ background: 'rgba(148, 163, 184, 0.1)', border: '1px solid rgba(148, 163, 184, 0.2)' }}>
              ESC
            </Kbd>
          }
          value={query}
          onChange={(event) => handleQueryChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          aria-label="Search commands"
          variant="unstyled"
          size="lg"
          styles={{
            input: {
              fontSize: '1rem',
              color: 'var(--mantine-color-slate-1)',
              '&::placeholder': {
                color: 'var(--mantine-color-slate-4)',
              },
            },
          }}
        />
      </Box>

      <Box mah={400} style={{ overflowY: 'auto' }} p="sm">
        {filtered.length > 0 ? (
          <Stack gap="lg">
            {Object.entries(groupedCommands).map(([category, items]) => (
              <Box key={category}>
                <Group gap="xs" mb="xs" px="xs">
                  <IconCommand size={12} style={{ color: 'var(--mantine-color-slate-5)' }} />
                  <Text size="xs" fw={600} c="slate.5" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                    {category}
                  </Text>
                </Group>
                <Stack gap={4}>
                  {items.map((command) => {
                    const globalIndex = filtered.indexOf(command)
                    const isSelected = globalIndex === selectedIndex

                    return (
                      <UnstyledButton
                        key={command.id}
                        onClick={() => {
                          command.action()
                          onClose()
                        }}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        aria-label={`Run command: ${command.label}`}
                        style={{
                          borderRadius: 10,
                          padding: '12px 14px',
                          background: isSelected
                            ? 'linear-gradient(135deg, rgba(29, 161, 242, 0.15) 0%, rgba(29, 161, 242, 0.08) 100%)'
                            : 'transparent',
                          border: isSelected ? '1px solid rgba(29, 161, 242, 0.3)' : '1px solid transparent',
                          transition: 'all 150ms ease',
                        }}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Group gap="sm" wrap="nowrap">
                            {command.icon && (
                              <Box
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 8,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: isSelected ? 'rgba(29, 161, 242, 0.2)' : 'rgba(148, 163, 184, 0.1)',
                                  color: isSelected ? 'var(--mantine-color-frc-blue-4)' : 'var(--mantine-color-slate-3)',
                                }}
                              >
                                {command.icon}
                              </Box>
                            )}
                            <Text fw={500} size="sm" c={isSelected ? 'slate.0' : 'slate.2'}>
                              {command.label}
                            </Text>
                          </Group>
                          <Group gap="sm">
                            {command.shortcut && (
                              <Kbd
                                size="xs"
                                style={{
                                  background: 'rgba(148, 163, 184, 0.08)',
                                  border: '1px solid rgba(148, 163, 184, 0.15)',
                                  color: 'var(--mantine-color-slate-4)',
                                }}
                              >
                                {command.shortcut}
                              </Kbd>
                            )}
                            {isSelected && <IconArrowRight size={14} style={{ color: 'var(--mantine-color-frc-blue-4)' }} />}
                          </Group>
                        </Group>
                      </UnstyledButton>
                    )
                  })}
                </Stack>
              </Box>
            ))}
          </Stack>
        ) : (
          <Box py="xl" ta="center">
            <Box
              mx="auto"
              mb="md"
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'rgba(148, 163, 184, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconSearch size={24} style={{ color: 'var(--mantine-color-slate-5)' }} />
            </Box>
            <Text size="sm" c="slate.4" fw={500}>
              No commands found
            </Text>
            <Text size="xs" c="slate.5" mt={4}>
              Try searching for something else
            </Text>
          </Box>
        )}
      </Box>

      <Box
        p="sm"
        style={{
          borderTop: '1px solid rgba(148, 163, 184, 0.1)',
          background: 'rgba(13, 17, 23, 0.5)',
        }}
      >
        <Group justify="center" gap="lg">
          <Group gap="xs">
            <Kbd size="xs" style={{ background: 'rgba(148, 163, 184, 0.08)', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
              <Text size="xs" component="span">&uarr;</Text>
            </Kbd>
            <Kbd size="xs" style={{ background: 'rgba(148, 163, 184, 0.08)', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
              <Text size="xs" component="span">&darr;</Text>
            </Kbd>
            <Text size="xs" c="slate.5">Navigate</Text>
          </Group>
          <Group gap="xs">
            <Kbd size="xs" style={{ background: 'rgba(148, 163, 184, 0.08)', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
              Enter
            </Kbd>
            <Text size="xs" c="slate.5">Select</Text>
          </Group>
          <Group gap="xs">
            <Kbd size="xs" style={{ background: 'rgba(148, 163, 184, 0.08)', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
              ESC
            </Kbd>
            <Text size="xs" c="slate.5">Close</Text>
          </Group>
        </Group>
      </Box>
    </Modal>
  )
}
