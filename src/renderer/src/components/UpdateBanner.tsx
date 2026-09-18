import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { ActionIcon, Box, Button, Group, Progress, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconArrowUpCircle, IconX } from '@tabler/icons-react'

type BannerState = 'hidden' | 'available' | 'downloading' | 'downloaded'

function readVersion(info: unknown): string | null {
  if (typeof info === 'object' && info !== null && 'version' in info) {
    const { version } = info as { version: unknown }
    return typeof version === 'string' ? version : null
  }

  return null
}

function readPercent(progress: unknown): number {
  if (typeof progress === 'object' && progress !== null && 'percent' in progress) {
    const percent = Number((progress as { percent: unknown }).percent)
    return Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0
  }

  return 0
}

/**
 * Site-wide prompt for a pending application update.
 *
 * Update state was previously only visible inside Settings, so a scouting team had no
 * way to learn a new build existed without going looking for it. This surfaces the
 * same updater events at the top of every page, and stays out of the way otherwise.
 */
export function UpdateBanner(): ReactElement | null {
  const [state, setState] = useState<BannerState>('hidden')
  const [version, setVersion] = useState<string | null>(null)
  const [percent, setPercent] = useState<number>(0)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState<boolean>(false)

  useEffect(() => {
    if (!window.electronAPI) {
      return
    }

    const offAvailable = window.electronAPI.onUpdaterAvailable((info) => {
      setVersion(readVersion(info))
      setState('available')
    })
    const offProgress = window.electronAPI.onUpdaterDownloadProgress((progress) => {
      setPercent(readPercent(progress))
      setState('downloading')
    })
    const offDownloaded = window.electronAPI.onUpdaterDownloaded((info) => {
      setVersion(readVersion(info))
      setState('downloaded')
      // A download the user opted into is worth re-surfacing even if they dismissed
      // the earlier "available" notice.
      setDismissedKey(null)
    })

    return () => {
      offAvailable()
      offProgress()
      offDownloaded()
    }
  }, [])

  const handleDownload = useCallback(async (): Promise<void> => {
    if (!window.electronAPI) {
      return
    }

    setIsBusy(true)
    try {
      const result = await window.electronAPI.downloadUpdate()
      if (!result.supported) {
        notifications.show({
          color: 'yellow',
          title: 'Update not downloaded',
          message: result.reason ?? 'This build cannot install updates.',
        })
        setState('hidden')
      }
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Download failed',
        message:
          error instanceof Error
            ? error.message
            : 'Could not reach GitHub. Connect to the internet and try again from Settings.',
      })
      setState('available')
    } finally {
      setIsBusy(false)
    }
  }, [])

  const handleInstall = useCallback(async (): Promise<void> => {
    if (!window.electronAPI) {
      return
    }

    setIsBusy(true)
    try {
      await window.electronAPI.installUpdate()
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Install failed',
        message: error instanceof Error ? error.message : 'Could not start the installer.',
      })
    } finally {
      setIsBusy(false)
    }
  }, [])

  const dismissKey = `${state === 'downloaded' ? 'ready' : 'available'}:${version ?? 'unknown'}`

  if (state === 'hidden' || dismissedKey === dismissKey) {
    return null
  }

  const label =
    state === 'downloaded'
      ? `Matchbook ${version ?? 'update'} is ready to install.`
      : state === 'downloading'
        ? `Downloading Matchbook ${version ?? 'update'}...`
        : `Matchbook ${version ?? 'update'} is available.`

  return (
    <Box className="update-banner" role="status">
      <Group gap="sm" wrap="nowrap" align="center">
        <IconArrowUpCircle size={18} stroke={1.7} aria-hidden="true" />
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600}>
            {label}
          </Text>
          {state === 'downloading' ? (
            <Progress value={percent} size="xs" radius="xl" mt={6} aria-label="Download progress" />
          ) : (
            <Text size="xs" c="dimmed">
              {state === 'downloaded'
                ? 'Matchbook will restart to finish installing.'
                : 'Download it now, or keep scouting and install later from Settings.'}
            </Text>
          )}
        </Box>

        {state === 'available' && (
          <Button size="xs" loading={isBusy} onClick={() => void handleDownload()}>
            Download update
          </Button>
        )}
        {state === 'downloaded' && (
          <Button size="xs" loading={isBusy} onClick={() => void handleInstall()}>
            Restart and install
          </Button>
        )}

        {state !== 'downloading' && (
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Dismiss update notice"
            onClick={() => setDismissedKey(dismissKey)}
          >
            <IconX size={16} stroke={1.7} />
          </ActionIcon>
        )}
      </Group>
    </Box>
  )
}
