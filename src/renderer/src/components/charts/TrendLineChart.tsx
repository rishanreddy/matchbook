import type { ReactElement } from 'react'
import { Box, useMantineTheme } from '@mantine/core'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'

interface TrendPoint {
  match: number
  total: number
}

interface TrendLineChartProps {
  data: TrendPoint[]
  height?: number
  showAverage?: boolean
}

export function TrendLineChart({ data, height = 260, showAverage = true }: TrendLineChartProps): ReactElement {
  const theme = useMantineTheme()

  const primaryColor = theme.colors['frc-blue']?.[5] ?? theme.colors.indigo[5]
  const primaryColorLight = theme.colors['frc-blue']?.[4] ?? theme.colors.indigo[4]
  const gridColor = 'rgba(148, 163, 184, 0.12)'
  const axisColor = 'rgba(148, 163, 184, 0.5)'

  // Calculate average for reference line
  const average = data.length > 0
    ? data.reduce((sum, point) => sum + point.total, 0) / data.length
    : 0

  return (
    <Box
      h={height}
      style={{
        background: 'radial-gradient(ellipse at top, rgba(29, 161, 242, 0.04) 0%, transparent 70%)',
        borderRadius: 12,
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 20, right: 20, left: 0, bottom: 10 }}
        >
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primaryColorLight} stopOpacity={0.5} />
              <stop offset="100%" stopColor={primaryColorLight} stopOpacity={0.02} />
            </linearGradient>
            <filter id="trendGlow">
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
            dataKey="match"
            tick={{
              fill: axisColor,
              fontSize: 11,
            }}
            axisLine={{ stroke: gridColor }}
            tickLine={false}
            tickFormatter={(value) => `M${value}`}
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
            cursor={{
              stroke: 'rgba(29, 161, 242, 0.3)',
              strokeWidth: 1,
              strokeDasharray: '4 4',
            }}
            contentStyle={{
              backgroundColor: 'rgba(22, 27, 34, 0.95)',
              border: '1px solid rgba(29, 161, 242, 0.3)',
              borderRadius: 8,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
              padding: '10px 14px',
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
            formatter={(value) => [`${Number(value).toFixed(1)} pts`, 'Total Score']}
            labelFormatter={(label) => `Match ${label}`}
          />
          {showAverage && average > 0 && (
            <ReferenceLine
              y={average}
              stroke="rgba(255, 136, 0, 0.5)"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: `Avg: ${average.toFixed(1)}`,
                fill: 'rgba(255, 136, 0, 0.8)',
                fontSize: 10,
                fontWeight: 600,
                position: 'right',
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="total"
            stroke={primaryColor}
            strokeWidth={2.5}
            fill="url(#trendGradient)"
            filter="url(#trendGlow)"
            dot={{
              r: 4,
              fill: primaryColor,
              stroke: 'rgba(22, 27, 34, 0.8)',
              strokeWidth: 2,
            }}
            activeDot={{
              r: 6,
              fill: primaryColor,
              stroke: '#ffffff',
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  )
}
