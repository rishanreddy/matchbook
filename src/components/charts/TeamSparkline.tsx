import type { ReactElement } from 'react'
import { Box, useMantineTheme } from '@mantine/core'
import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts'

interface TeamSparklineProps {
  data: number[]
  height?: number
}

export function TeamSparkline({ data, height = 50 }: TeamSparklineProps): ReactElement {
  const theme = useMantineTheme()
  const chartData = data.map((value, index) => ({ index, value }))

  return (
    <Box h={height}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <Tooltip formatter={(value) => Number(value).toFixed(1)} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={theme.colors.blue[6]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  )
}
