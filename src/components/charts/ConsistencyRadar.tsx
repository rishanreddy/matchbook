import type { ReactElement } from 'react'
import { Box, useMantineTheme } from '@mantine/core'
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'

interface ConsistencyRadarProps {
  values: {
    auto: number
    teleop: number
    endgame: number
    consistencyScore: number
    ceiling: number
  }
  height?: number
}

export function ConsistencyRadar({ values, height = 280 }: ConsistencyRadarProps): ReactElement {
  const theme = useMantineTheme()
  const data = [
    { metric: 'Auto', value: values.auto },
    { metric: 'Teleop', value: values.teleop },
    { metric: 'Endgame', value: values.endgame },
    { metric: 'Consistency', value: values.consistencyScore },
    { metric: 'Ceiling', value: values.ceiling },
  ]

  return (
    <Box h={height}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid />
          <PolarAngleAxis dataKey="metric" />
          <Tooltip />
          <Radar dataKey="value" stroke={theme.colors.orange[6]} fill={theme.colors.orange[4]} fillOpacity={0.5} />
        </RadarChart>
      </ResponsiveContainer>
    </Box>
  )
}
