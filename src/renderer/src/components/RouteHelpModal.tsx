import type { ReactElement, ReactNode } from 'react'
import {
  ActionIcon,
  Box,
  Divider,
  Group,
  List,
  Modal,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconHelp, IconInfoCircle, IconBulb } from '@tabler/icons-react'

export type HelpStep = {
  title: string
  description: string
}

export type HelpTip = {
  text: string
}

export type RouteHelpModalProps = {
  /** Title shown in the modal header */
  title: string
  /** Brief description/summary shown below the title */
  description?: string
  /** Ordered steps for the workflow */
  steps?: HelpStep[]
  /** Optional tips shown after the steps */
  tips?: HelpTip[]
  /** Custom content to render (alternative to steps/tips) */
  children?: ReactNode
  /** Size of the help icon button */
  iconSize?: number
  /** Tooltip text for the help icon */
  tooltipLabel?: string
  /** Color variant for the icon */
  color?: string
}

/**
 * A reusable help icon + modal pattern for route-level documentation.
 * Replaces bulky inline Alert boxes with a compact help trigger.
 */
export function RouteHelpModal({
  title,
  description,
  steps,
  tips,
  children,
  iconSize = 18,
  tooltipLabel = 'How it works',
  color = 'frc-blue',
}: RouteHelpModalProps): ReactElement {
  const [opened, { open, close }] = useDisclosure(false)

  return (
    <>
      <Tooltip label={tooltipLabel} position="left" withArrow>
        <ActionIcon
          variant="subtle"
          color={color}
          size="lg"
          radius="md"
          onClick={open}
          className="transition-all duration-200 hover:bg-[rgba(26,140,255,0.12)]"
        >
          <IconHelp size={iconSize} />
        </ActionIcon>
      </Tooltip>

      <Modal
        opened={opened}
        onClose={close}
        title={
          <Group gap="sm">
            <ThemeIcon size={28} radius="md" variant="light" color={color}>
              <IconInfoCircle size={16} />
            </ThemeIcon>
            <Title order={4} c="slate.0" className="tracking-tight">
              {title}
            </Title>
          </Group>
        }
        size="md"
        radius="lg"
        centered
        overlayProps={{
          backgroundOpacity: 0.6,
          blur: 4,
        }}
        styles={{
          header: {
            backgroundColor: 'rgba(15, 21, 32, 0.98)',
            borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
          },
          body: {
            backgroundColor: 'rgba(15, 21, 32, 0.98)',
          },
          content: {
            backgroundColor: 'rgba(15, 21, 32, 0.98)',
            border: '1px solid rgba(148, 163, 184, 0.15)',
          },
        }}
      >
        <Stack gap="lg" py="xs">
          {description && (
            <Text size="sm" c="slate.3" className="leading-relaxed">
              {description}
            </Text>
          )}

          {steps && steps.length > 0 && (
            <Box>
              <Text size="xs" fw={600} c="slate.4" mb="sm" className="uppercase tracking-wider">
                Steps
              </Text>
              <List
                spacing="sm"
                type="ordered"
                styles={{
                  item: {
                    color: 'var(--mantine-color-slate-2)',
                    fontSize: 'var(--mantine-font-size-sm)',
                  },
                  itemWrapper: {
                    alignItems: 'flex-start',
                  },
                }}
              >
                {steps.map((step) => (
                  <List.Item key={step.title}>
                    <Text fw={500} c="slate.1" size="sm">
                      {step.title}
                    </Text>
                    <Text c="slate.4" size="xs" mt={2}>
                      {step.description}
                    </Text>
                  </List.Item>
                ))}
              </List>
            </Box>
          )}

          {tips && tips.length > 0 && (
            <>
              {steps && steps.length > 0 && <Divider color="rgba(148, 163, 184, 0.1)" />}
              <Box>
                <Group gap="xs" mb="sm">
                  <IconBulb size={14} className="text-[var(--mantine-color-frc-orange-5)]" />
                  <Text size="xs" fw={600} c="slate.4" className="uppercase tracking-wider">
                    Tips
                  </Text>
                </Group>
                <Stack gap="xs">
                  {tips.map((tip) => (
                    <Text key={tip.text} size="xs" c="slate.3" className="leading-relaxed">
                      • {tip.text}
                    </Text>
                  ))}
                </Stack>
              </Box>
            </>
          )}

          {children}
        </Stack>
      </Modal>
    </>
  )
}
