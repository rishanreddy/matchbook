import type { ReactElement } from 'react'
import { Box, Group, Stack, Tabs, Text, ThemeIcon, Title } from '@mantine/core'
import { IconDeviceFloppy, IconQrcode, IconRefresh, IconTool, IconWifi } from '@tabler/icons-react'
import { useSearchParams } from 'react-router-dom'
import { RouteHelpModal } from '../components/RouteHelpModal'
import { AdvancedPanel } from '../features/sync/AdvancedPanel'
import { FilePanel } from '../features/sync/FilePanel'
import { HubWifiPanel } from '../features/sync/HubWifiPanel'
import { QrPanel } from '../features/sync/QrPanel'
import { ScoutWifiPanel } from '../features/sync/ScoutWifiPanel'
import { describeMethod, useLastSent, type LastSent } from '../features/sync/lastSent'
import { useDatabaseStore } from '../stores/useDatabase'
import { useIsHub } from '../stores/useDeviceStore'

type SyncTab = 'wifi' | 'qr' | 'file' | 'advanced'

const TABS: SyncTab[] = ['wifi', 'qr', 'file', 'advanced']

const TAB_HINTS: Record<SyncTab, string> = {
  wifi: 'Fastest. Both laptops need to be on the same Wi-Fi or hotspot. The internet is not needed.',
  qr: 'No Wi-Fi needed. One laptop shows codes on its screen and the other reads them with its camera.',
  file: 'No Wi-Fi needed. Save a file, carry it over on a USB stick or with AirDrop, and open it on the other laptop.',
  advanced: 'Spreadsheets, and the tool for clearing a laptop between events.',
}

function isSyncTab(value: string | null): value is SyncTab {
  return value !== null && (TABS as string[]).includes(value)
}

function describeLastSent(last: LastSent | null): string {
  if (!last) {
    return 'You have not sent your scouting to the lead scout yet.'
  }

  const when = new Date(last.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  return `Last sent ${when}: ${last.entries.toLocaleString()} ${last.entries === 1 ? 'entry' : 'entries'} ${describeMethod(last.method)}.`
}

export function Sync(): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const isHub = useIsHub()
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const activeTab: SyncTab = isSyncTab(requested) ? requested : 'wifi'
  const lastSent = useLastSent()

  return (
    <Box className="container-wide">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" wrap="nowrap" className="animate-fadeInUp">
          <Group gap="md" wrap="nowrap">
            <ThemeIcon size={48} radius="md" variant="default">
              <IconRefresh size={24} stroke={1.6} />
            </ThemeIcon>
            <Box>
              <Title order={1} c="slate.0" style={{ fontSize: 28, fontWeight: 700 }}>
                Sync Data
              </Title>
              <Text size="sm" c="slate.3">
                {isHub
                  ? 'Collect scouting from the scouts’ laptops, and give them the form.'
                  : 'Send your scouting to the lead scout, and get the form from them.'}
              </Text>
              {!isHub && (
                <Text size="sm" c="slate.2" mt={4}>
                  {describeLastSent(lastSent)}
                </Text>
              )}
            </Box>
          </Group>
          <RouteHelpModal
            title="Moving data between laptops"
            description="There are three ways to move scouting from one laptop to another. Use whichever works where you are."
            steps={[
              { title: 'Wi-Fi', description: 'Fastest. Both laptops on the same Wi-Fi or a phone hotspot. No internet is needed.' },
              { title: 'QR codes', description: 'No Wi-Fi at all. One screen shows codes, the other laptop’s camera reads them.' },
              { title: 'A file', description: 'Save a file, carry it on a USB stick or AirDrop it, and open it on the other laptop.' },
            ]}
            tips={[
              { text: 'Sending the same entries twice is safe. The lead scout keeps one copy of each.' },
              { text: 'If one way is not working, try another. They all move exactly the same data.' },
            ]}
            tooltipLabel="How moving data works"
            color="frc-blue"
          />
        </Group>

        <Tabs
          value={activeTab}
          onChange={(value) => isSyncTab(value) && setParams({ tab: value }, { replace: true })}
          variant="default"
          radius="sm"
          color="gray"
          // Only the visible method runs. Kept mounted, the Wi-Fi tab would keep listening for
          // hubs and the QR tab would keep preparing codes while nobody is looking at them.
          keepMounted={false}
        >
          <Tabs.List>
            <Tabs.Tab value="wifi" leftSection={<IconWifi size={16} />}>
              Wi-Fi
            </Tabs.Tab>
            <Tabs.Tab value="qr" leftSection={<IconQrcode size={16} />}>
              QR codes
            </Tabs.Tab>
            <Tabs.Tab value="file" leftSection={<IconDeviceFloppy size={16} />}>
              File
            </Tabs.Tab>
            <Tabs.Tab value="advanced" leftSection={<IconTool size={16} />}>
              Advanced
            </Tabs.Tab>
          </Tabs.List>

          <Text size="sm" c="slate.3" mt="md" mb="md">
            {TAB_HINTS[activeTab]}
          </Text>

          <Tabs.Panel value="wifi">{isHub ? <HubWifiPanel db={db} /> : <ScoutWifiPanel db={db} />}</Tabs.Panel>
          <Tabs.Panel value="qr">
            <QrPanel db={db} isHub={isHub} />
          </Tabs.Panel>
          <Tabs.Panel value="file">
            <FilePanel db={db} />
          </Tabs.Panel>
          <Tabs.Panel value="advanced">
            <AdvancedPanel db={db} isHub={isHub} />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Box>
  )
}
