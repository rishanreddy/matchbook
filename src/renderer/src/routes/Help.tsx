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
  Modal,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { formatForDisplay } from '@tanstack/react-hotkeys'
import { IconBook, IconBug, IconBulb, IconHelp, IconKeyboard, IconLifebuoy, IconPlayerPlay } from '@tabler/icons-react'
import { StepList } from '../components/StepList'
import { brand } from '../config/brand'
import { appShortcuts, getShortcutHotkey, loadShortcutBindings, type ShortcutBindings } from '../config/shortcuts'
import { guide, type GuideImage, type GuideTask } from '../content/guide'
import { GUIDE_IMAGES } from '../content/guideImages'
import { GUIDE_VIDEOS } from '../content/guideVideos'
import { renderInline } from '../content/inline'
import { useIsHub } from '../stores/useDeviceStore'

const docsBaseUrl = brand.repoUrl
const issuesUrl = brand.supportIssuesUrl

type Audience = 'scout' | 'lead'

function GuideFigure({ image }: { image: GuideImage }): ReactElement {
  const [zoomed, setZoomed] = useState(false)
  const source = GUIDE_IMAGES[image.key]

  return (
    <>
      <figure className="guide-figure">
        <button type="button" className="guide-figure__button" onClick={() => setZoomed(true)} aria-label={`Enlarge picture: ${image.caption}`}>
          <img src={source} alt={image.alt} loading="lazy" />
        </button>
        <figcaption>{image.caption}</figcaption>
      </figure>

      <Modal opened={zoomed} onClose={() => setZoomed(false)} title={image.caption} size="min(1200px, 96vw)">
        <img src={source} alt={image.alt} style={{ display: 'block', width: '100%', borderRadius: 6 }} />
      </Modal>
    </>
  )
}

function TaskAccordion({ tasks }: { tasks: GuideTask[] }): ReactElement {
  return (
    <Accordion multiple variant="separated" radius="md" defaultValue={tasks.slice(0, 1).map((task) => task.id)} className="guide-accordion">
      {tasks.map((task, index) => (
        <Accordion.Item key={task.id} value={task.id}>
          <Accordion.Control>
            <Group gap="md" wrap="nowrap">
              <span className="guide-task-number" aria-hidden="true">
                {index + 1}
              </span>
              <Box style={{ minWidth: 0 }}>
                <Text fw={600} c="slate.0">
                  {task.title}
                </Text>
                <Text size="sm" c="slate.3">
                  {task.summary}
                </Text>
              </Box>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <div className="guide-task-body">
              <Stack gap="lg">
                <StepList steps={task.steps.map((step) => ({ title: step.text, detail: step.detail }))} />

                {task.tip ? (
                  <Group gap="sm" wrap="nowrap" align="flex-start" className="guide-tip">
                    <ThemeIcon variant="default" size={28} radius="md">
                      <IconBulb size={16} />
                    </ThemeIcon>
                    <Text size="sm" c="slate.1">
                      {renderInline(task.tip)}
                    </Text>
                  </Group>
                ) : null}
              </Stack>

              <Stack gap="md">
                {task.images.map((image) => (
                  <GuideFigure key={image.key} image={image} />
                ))}
              </Stack>
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  )
}

export function Help(): ReactElement {
  const isHub = useIsHub()
  const [audience, setAudience] = useState<Audience>(isHub ? 'lead' : 'scout')
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
    <Box className="container-wide">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start" wrap="nowrap" className="animate-fadeInUp">
          <Group gap="md" wrap="nowrap">
            <ThemeIcon size={48} radius="md" variant="default">
              <IconHelp size={26} stroke={1.5} />
            </ThemeIcon>
            <Box>
              <Title order={1} c="slate.0" data-tour="help-center" style={{ fontSize: 28, fontWeight: 700 }}>
                How to use Matchbook
              </Title>
              <Text size="sm" c="slate.3">
                Step-by-step guides with pictures. No experience needed.
              </Text>
            </Box>
          </Group>
        </Group>

        <Stack gap="md">
          <Group gap="sm">
            <ThemeIcon variant="default" size={32} radius="md">
              <IconPlayerPlay size={18} />
            </ThemeIcon>
            <Title order={2} c="slate.0" style={{ fontSize: 20 }}>
              Watch first
            </Title>
          </Group>
          <Text size="sm" c="slate.3">
            Two short videos with captions and no sound. They work with no internet.
          </Text>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            {GUIDE_VIDEOS.map((video) => (
              <Card key={video.id} p="md">
                <video
                  className="guide-video"
                  controls
                  preload="none"
                  poster={video.poster}
                  src={video.src}
                  aria-label={`${video.title}: ${video.summary}`}
                />
                <Group justify="space-between" align="flex-start" wrap="nowrap" mt="sm" gap="sm">
                  <Box style={{ minWidth: 0 }}>
                    <Text fw={600} c="slate.0">
                      {video.title}
                    </Text>
                    <Text size="sm" c="slate.3">
                      {video.summary}
                    </Text>
                  </Box>
                  <Badge variant="light" color="gray" radius="sm" style={{ flexShrink: 0 }}>
                    {video.length}
                  </Badge>
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        </Stack>

        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Text fw={600} c="slate.1">
              Which are you?
            </Text>
            <SegmentedControl
              value={audience}
              onChange={(value) => setAudience(value as Audience)}
              aria-label="Show the guide for"
              data={[
                { value: 'scout', label: 'I am a scout' },
                { value: 'lead', label: 'I am the lead scout' },
              ]}
            />
          </Group>

          <Text size="sm" c="slate.3">
            {audience === 'scout'
              ? 'You watch matches and record what the robots do. Open a step to see how.'
              : 'You set up the event and the form, collect everyone’s scouting, and compare teams. Open a step to see how.'}
          </Text>

          <TaskAccordion key={audience} tasks={audience === 'scout' ? guide.scoutTasks : guide.leadTasks} />
        </Stack>

        <Stack gap="md">
          <Group gap="sm">
            <ThemeIcon variant="default" size={32} radius="md">
              <IconLifebuoy size={18} />
            </ThemeIcon>
            <Title order={2} c="slate.0" style={{ fontSize: 20 }}>
              Something is not working
            </Title>
          </Group>

          <Accordion variant="separated" radius="md" className="guide-accordion">
            {guide.troubleshooting.map((item) => (
              <Accordion.Item key={item.id} value={item.id}>
                <Accordion.Control>
                  <Text fw={500} c="slate.1">
                    {item.question}
                  </Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    {item.answer.map((paragraph) => (
                      <Text key={paragraph} size="sm" c="slate.2">
                        {renderInline(paragraph)}
                      </Text>
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Stack>

        <Stack gap="md">
          <Group gap="sm">
            <ThemeIcon variant="default" size={32} radius="md">
              <IconBook size={18} />
            </ThemeIcon>
            <Title order={2} c="slate.0" style={{ fontSize: 20 }}>
              Words we use
            </Title>
          </Group>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
            {guide.glossary.map((item) => (
              <Paper key={item.term} p="md" radius="md" className="guide-word">
                <Text fw={600} c="slate.0" size="sm">
                  {item.term}
                </Text>
                <Text size="sm" c="slate.3" mt={2}>
                  {item.meaning}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Stack>

        <Accordion variant="separated" radius="md" className="guide-accordion">
          <Accordion.Item value="shortcuts">
            <Accordion.Control>
              <Group gap="sm">
                <IconKeyboard size={18} />
                <Text fw={500} c="slate.1">
                  Keyboard shortcuts
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                {shortcutRows.map((shortcut) => (
                  <Paper key={`${shortcut.action}-${shortcut.keys}`} p="sm" radius="md" style={{ backgroundColor: 'var(--surface-base)' }}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text size="sm" c="slate.3">
                        {shortcut.action}
                      </Text>
                      <Badge variant="light" color="gray" radius="md" className="mono-number">
                        {shortcut.keys}
                      </Badge>
                    </Group>
                  </Paper>
                ))}
              </SimpleGrid>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        <Card p="lg">
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon variant="default" size={32} radius="md">
                <IconBug size={18} />
              </ThemeIcon>
              <Text fw={600} c="slate.0" size="lg">
                Still stuck?
              </Text>
            </Group>

            <Text size="sm" c="slate.3">
              Tell us what you were doing, what you expected, and what happened instead. Say whether the laptop was a scout or the
              lead scout, and include a screenshot if you can.
            </Text>

            <Group>
              <Button variant="default" onClick={() => openExternal(issuesUrl)} leftSection={<IconBug size={16} />}>
                Report a problem
              </Button>
              <Anchor
                href={docsBaseUrl}
                c="slate.2"
                size="sm"
                onClick={(event) => {
                  event.preventDefault()
                  openExternal(docsBaseUrl)
                }}
              >
                Project page
              </Anchor>
            </Group>
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
}
