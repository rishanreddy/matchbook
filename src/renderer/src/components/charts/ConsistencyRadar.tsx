import type { ReactElement } from 'react'
import { Box, useMantineTheme } from '@mantine/core'
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'

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
    { metric: 'Auto', value: values.auto, fullMark: 100 },
    { metric: 'Teleop', value: values.teleop, fullMark: 100 },
    { metric: 'Endgame', value: values.endgame, fullMark: 100 },
    { metric: 'Consistency', value: values.consistencyScore, fullMark: 100 },
    { metric: 'Ceiling', value: values.ceiling, fullMark: 100 },
  ]

  // Premium color palette
  const primaryColor = theme.colors['frc-orange']?.[5] ?? theme.colors.orange[5]
  const primaryColorLight = theme.colors['frc-orange']?.[3] ?? theme.colors.orange[3]
  const gridColor = 'rgba(148, 163, 184, 0.15)'
  const axisColor = 'rgba(148, 163, 184, 0.6)'

  return (
    <Box
      h={height}
      style={{
        background: 'radial-gradient(ellipse at center, rgba(255, 136, 0, 0.03) 0%, transparent 70%)',
        borderRadius: 12,
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="68%">
          <defs>
            <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primaryColor} stopOpacity={0.8} />
              <stop offset="100%" stopColor={primaryColorLight} stopOpacity={0.3} />
            </linearGradient>
            <filter id="radarGlow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <PolarGrid
            stroke={gridColor}
            strokeDasharray="3 3"
          />
          <PolarAngleAxis
            dataKey="metric"
            tick={{
              fill: axisColor,
              fontSize: 11,
              fontWeight: 500,
            }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{
              fill: axisColor,
              fontSize: 10,
            }}
            tickCount={5}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(22, 27, 34, 0.95)',
              border: '1px solid rgba(255, 136, 0, 0.3)',
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
            formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Score']}
          />
          <Radar
            dataKey="value"
            stroke={primaryColor}
            strokeWidth={2}
            fill="url(#radarGradient)"
            fillOpacity={0.6}
            filter="url(#radarGlow)"
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
        </RadarChart>
      </ResponsiveContainer>
    </Box>
  )
}
