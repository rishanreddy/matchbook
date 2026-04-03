import type { ReactElement } from 'react'
import { Box, useMantineTheme } from '@mantine/core'
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts'

interface TeamSparklineProps {
  data: number[]
  height?: number
  color?: 'blue' | 'orange' | 'green' | 'red'
  showTooltip?: boolean
}

export function TeamSparkline({
  data,
  height = 50,
  color = 'blue',
  showTooltip = true,
}: TeamSparklineProps): ReactElement {
  const theme = useMantineTheme()

  const colorMap = {
    blue: {
      stroke: theme.colors['frc-blue']?.[5] ?? theme.colors.blue[5],
      fill: theme.colors['frc-blue']?.[4] ?? theme.colors.blue[4],
    },
    orange: {
      stroke: theme.colors['frc-orange']?.[5] ?? theme.colors.orange[5],
      fill: theme.colors['frc-orange']?.[4] ?? theme.colors.orange[4],
    },
    green: {
      stroke: theme.colors.green[5],
      fill: theme.colors.green[4],
    },
    red: {
      stroke: theme.colors.red[5],
      fill: theme.colors.red[4],
    },
  }

  const colors = colorMap[color]
  const chartData = data.map((value, index) => ({ index: index + 1, value }))



  return (
    <Box
      h={height}
      style={{
        background: `linear-gradient(180deg, ${colors.fill}08 0%, transparent 100%)`,
        borderRadius: 8,
        padding: '4px 0',
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
        >
          <defs>
            <linearGradient id={`sparklineGradient-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.fill} stopOpacity={0.4} />
              <stop offset="100%" stopColor={colors.fill} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <YAxis domain={['dataMin - 5', 'dataMax + 5']} hide />
          {showTooltip && (
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(22, 27, 34, 0.95)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: 6,
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                padding: '6px 10px',
                fontSize: 11,
              }}
              itemStyle={{
                color: '#f1f5f9',
              }}
              labelStyle={{
                color: '#94a3b8',
                fontSize: 10,
              }}
              formatter={(value) => [`${Number(value).toFixed(1)}`, 'Score']}
              labelFormatter={(label) => `Match ${label}`}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke={colors.stroke}
            strokeWidth={2}
            fill={`url(#sparklineGradient-${color})`}
            dot={false}
            activeDot={{
              r: 4,
              fill: colors.stroke,
              stroke: 'rgba(22, 27, 34, 0.8)',
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  )
}
