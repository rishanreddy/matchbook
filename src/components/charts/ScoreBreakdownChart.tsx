import type { ReactElement } from 'react'
import { Box, useMantineTheme } from '@mantine/core'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface ScoreBreakdownChartProps {
  auto: number
  teleop: number
  endgame: number
  height?: number
}

export function ScoreBreakdownChart({ auto, teleop, endgame, height = 260 }: ScoreBreakdownChartProps): ReactElement {
  const theme = useMantineTheme()
  const data = [{ name: 'Average', auto, teleop, endgame }]

  return (
    <Box h={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="auto" stackId="score" fill={theme.colors.grape[5]} />
          <Bar dataKey="teleop" stackId="score" fill={theme.colors.blue[5]} />
          <Bar dataKey="endgame" stackId="score" fill={theme.colors.teal[5]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  )
}
