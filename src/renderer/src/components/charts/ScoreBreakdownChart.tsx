import type { ReactElement } from 'react'
import { Box, useMantineTheme } from '@mantine/core'
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface ScoreBreakdownChartProps {
  auto: number
  teleop: number
  endgame: number
  height?: number
}

export function ScoreBreakdownChart({ auto, teleop, endgame, height = 260 }: ScoreBreakdownChartProps): ReactElement {
  const theme = useMantineTheme()

  const data = [
    { name: 'Auto', value: auto, color: theme.colors.grape[5] },
    { name: 'Teleop', value: teleop, color: theme.colors['frc-blue']?.[5] ?? theme.colors.blue[5] },
    { name: 'Endgame', value: endgame, color: theme.colors.teal[5] },
  ]

  const gridColor = 'rgba(148, 163, 184, 0.12)'
  const axisColor = 'rgba(148, 163, 184, 0.5)'

  return (
    <Box
      h={height}
      style={{
        background: 'radial-gradient(ellipse at bottom, rgba(29, 161, 242, 0.03) 0%, transparent 70%)',
        borderRadius: 12,
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 20, right: 20, left: 0, bottom: 10 }}
          barCategoryGap="20%"
        >
          <defs>
            <linearGradient id="autoGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.colors.grape[4]} stopOpacity={1} />
              <stop offset="100%" stopColor={theme.colors.grape[6]} stopOpacity={0.8} />
            </linearGradient>
            <linearGradient id="teleopGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.colors['frc-blue']?.[4] ?? theme.colors.blue[4]} stopOpacity={1} />
              <stop offset="100%" stopColor={theme.colors['frc-blue']?.[6] ?? theme.colors.blue[6]} stopOpacity={0.8} />
            </linearGradient>
            <linearGradient id="endgameGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.colors.teal[4]} stopOpacity={1} />
              <stop offset="100%" stopColor={theme.colors.teal[6]} stopOpacity={0.8} />
            </linearGradient>
            <filter id="barGlow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={gridColor}
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{
              fill: axisColor,
              fontSize: 12,
              fontWeight: 500,
            }}
            axisLine={{ stroke: gridColor }}
            tickLine={false}
          />
          <YAxis
            tick={{
              fill: axisColor,
              fontSize: 11,
            }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
            contentStyle={{
              backgroundColor: 'rgba(22, 27, 34, 0.95)',
              border: '1px solid rgba(29, 161, 242, 0.3)',
              borderRadius: 8,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
              padding: '8px 12px',
            }}
            itemStyle={{
              color: '#f1f5f9',
              fontSize: 12,
            }}
            labelStyle={{
              color: '#94a3b8',
              fontWeight: 600,
              marginBottom: 4,
            }}
            formatter={(value) => [`${Number(value).toFixed(1)} pts`, 'Average']}
          />
          <Legend
            wrapperStyle={{
              paddingTop: 12,
            }}
            formatter={(value) => (
              <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 500 }}>{value}</span>
            )}
          />
          <Bar
            dataKey="value"
            radius={[6, 6, 0, 0]}
            filter="url(#barGlow)"
          >
            {data.map((item) => (
              <Cell
                key={`cell-${item.name}`}
                fill={
                  item.name === 'Auto' ? 'url(#autoGradient)' :
                  item.name === 'Teleop' ? 'url(#teleopGradient)' :
                  'url(#endgameGradient)'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  )
}
