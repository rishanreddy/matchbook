import type { ReactElement } from 'react'
import { useState } from 'react'
import { ActionIcon, Badge, Box, Button, Card, Group, Menu, Modal, Stack, Switch, Text, TextInput, ThemeIcon, Title } from '@mantine/core'
import { IconDeviceLaptop, IconDotsVertical, IconPencil, IconPlus, IconTrash, IconUsers } from '@tabler/icons-react'
import type { RosterScoutDocType, RosterStatus } from '../../lib/db/schemas/roster.schema'
import { MAX_SCOUT_NAME_LENGTH, isAvailable, isListed, sortRoster, validateScoutName } from '../roster/rosterService'

type RosterPanelProps = {
  roster: readonly RosterScoutDocType[]
  /** How many stations each scout holds in the event being planned. */
  loads: ReadonlyMap<string, number>
  onAdd: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onSetStatus: (id: string, status: RosterStatus) => Promise<void>
}

export function RosterPanel({ roster, loads, onAdd, onRename, onSetStatus }: RosterPanelProps): ReactElement {
  const [name, setName] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [renaming, setRenaming] = useState<{ scout: RosterScoutDocType; name: string } | null>(null)
  const [renameProblem, setRenameProblem] = useState<string | null>(null)
  const [removing, setRemoving] = useState<RosterScoutDocType | null>(null)
  // A switch answers the moment it is pressed; the roster catches up when the change is saved.
  const [pending, setPending] = useState<Record<string, boolean>>({})

  const listed = sortRoster(roster.filter(isListed))
  const available = listed.filter(isAvailable).length
  const away = listed.length - available

  const add = async (): Promise<void> => {
    const invalid = validateScoutName(name, roster)
    if (invalid) {
      setProblem(invalid)
      return
    }

    setIsAdding(true)
    try {
      await onAdd(name)
      setName('')
      setProblem(null)
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : 'That scout could not be added.')
    } finally {
      setIsAdding(false)
    }
  }

  const saveRename = async (): Promise<void> => {
    if (!renaming) {
      return
    }

    const invalid = validateScoutName(renaming.name, roster, renaming.scout.id)
    if (invalid) {
      setRenameProblem(invalid)
      return
    }

    try {
      await onRename(renaming.scout.id, renaming.name)
      setRenaming(null)
      setRenameProblem(null)
    } catch (error: unknown) {
      setRenameProblem(error instanceof Error ? error.message : 'That name could not be saved.')
    }
  }

  return (
    <Card p="lg" radius="lg" className="surface-card" data-tour="assignments-roster">
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon size={36} radius="md" variant="light">
              <IconUsers size={18} />
            </ThemeIcon>
            <Box>
              <Title order={3} size="h4" c="slate.0">
                Scouts
              </Title>
              <Text size="xs" c="slate.4">
                {listed.length === 0 ? 'Nobody yet' : `${available} available${away > 0 ? `, ${away} away` : ''}`}
              </Text>
            </Box>
          </Group>
        </Group>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}
        >
          <Group align="flex-start" gap="sm" wrap="wrap">
            <TextInput
              aria-label="Scout name"
              placeholder="Type a name and press Enter"
              value={name}
              onChange={(event) => {
                setName(event.currentTarget.value)
                setProblem(null)
              }}
              error={problem}
              maxLength={MAX_SCOUT_NAME_LENGTH}
              style={{ flex: '1 1 240px' }}
            />
            <Button type="submit" leftSection={<IconPlus size={16} />} loading={isAdding} disabled={name.trim() === ''}>
              Add scout
            </Button>
          </Group>
        </form>

        {listed.length === 0 ? (
          <Text size="sm" c="slate.3">
            Add the scouts who will watch matches. Scouts who type their name in Device Setup show up here on their own once they connect to this laptop.
          </Text>
        ) : (
          <Stack gap="xs" component="ul" className="roster-list">
            {listed.map((scout) => {
              const stations = loads.get(scout.id) ?? 0
              const here = isAvailable(scout)
              const switchedOn = pending[scout.id] ?? here
              return (
                <Group key={scout.id} component="li" justify="space-between" align="center" wrap="wrap" gap="sm" className="roster-row" data-away={here ? undefined : ''}>
                  <Group gap="xs" wrap="wrap" style={{ minWidth: 0, flex: '1 1 220px' }}>
                    <Text fw={600} c={here ? 'slate.0' : 'slate.4'} truncate>
                      {scout.name}
                    </Text>
                    {scout.deviceId !== '' ? (
                      <Badge variant="light" color="slate" size="sm" leftSection={<IconDeviceLaptop size={11} />}>
                        {scout.deviceName || 'Has a laptop'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" color="slate" size="sm">
                        Added by hand
                      </Badge>
                    )}
                    {!here ? (
                      <Badge variant="light" color="yellow" size="sm">
                        Away
                      </Badge>
                    ) : null}
                  </Group>

                  <Group gap="md" wrap="nowrap">
                    <Text size="xs" c="slate.4" miw={74} ta="right">
                      {stations === 0 ? 'No matches' : `${stations} ${stations === 1 ? 'match' : 'matches'}`}
                    </Text>
                    <Switch
                      checked={switchedOn}
                      onChange={(event) => {
                        const wantsAvailable = event.currentTarget.checked
                        setPending((current) => ({ ...current, [scout.id]: wantsAvailable }))
                        void onSetStatus(scout.id, wantsAvailable ? 'active' : 'away').finally(() =>
                          setPending((current) => {
                            const { [scout.id]: _settled, ...rest } = current
                            return rest
                          }),
                        )
                      }}
                      label="Available"
                      aria-label={`${scout.name} is available`}
                      size="sm"
                    />
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" aria-label={`More for ${scout.name}`}>
                          <IconDotsVertical size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconPencil size={14} />}
                          onClick={() => {
                            setRenaming({ scout, name: scout.name })
                            setRenameProblem(null)
                          }}
                        >
                          Rename
                        </Menu.Item>
                        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => setRemoving(scout)}>
                          Remove from roster
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Group>
              )
            })}
          </Stack>
        )}
      </Stack>

      <Modal opened={renaming !== null} onClose={() => setRenaming(null)} title="Rename scout" centered>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void saveRename()
          }}
        >
          <Stack gap="md">
            <TextInput
              label="Name"
              value={renaming?.name ?? ''}
              onChange={(event) => {
                const value = event.currentTarget.value
                setRenaming((current) => (current ? { ...current, name: value } : current))
                setRenameProblem(null)
              }}
              error={renameProblem}
              maxLength={MAX_SCOUT_NAME_LENGTH}
              data-autofocus
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={removing !== null} onClose={() => setRemoving(null)} title="Remove from the roster?" centered>
        <Stack gap="md">
          <Text size="sm">
            {removing?.name} will no longer be offered matches. Their matches that nobody has scouted yet go to other scouts the next time you fill the plan, and
            matches they already scouted stay as they are.
          </Text>
          <Text size="sm" c="slate.3">
            If you only need them off for a while, switch them to away instead.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRemoving(null)}>
              Keep them
            </Button>
            <Button
              color="red"
              onClick={() => {
                if (removing) {
                  void onSetStatus(removing.id, 'removed')
                }
                setRemoving(null)
              }}
            >
              Remove
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  )
}
