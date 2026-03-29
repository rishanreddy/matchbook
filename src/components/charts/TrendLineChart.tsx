import type { ReactElement } from 'react'
import { Box, useMantineTheme } from '@mantine/core'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface TrendPoint {
  match: number
  total: number
}

interface TrendLineChartProps {
  data: TrendPoint[]
  height?: number
}

export function TrendLineChart({ data, height = 260 }: TrendLineChartProps): ReactElement {
  const theme = useMantineTheme()

  return (
    <Box h={height}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="match" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="total" stroke={theme.colors.indigo[6]} strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  )
}
