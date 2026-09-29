import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { Box } from '@mantine/core'
import { areaY, defineChart, lineY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'

interface TeamSparklineProps {
  data: number[]
  height?: number
  color?: 'blue' | 'orange' | 'green' | 'red'
  showTooltip?: boolean
}

export function TeamSparkline({ data, height = 50, color = 'blue', showTooltip = true }: TeamSparklineProps): ReactElement {
  const colors = {
    blue: '#6aa2fb',
    orange: '#ffb020',
    green: '#43bb83',
    red: '#ee6b63',
  }
  const stroke = colors[color]
  const definition = useMemo(() => {
    const points = data.map((score, index) => ({ match: index + 1, score }))
    const minimum = data.length ? Math.min(...data) : 0
    const maximum = data.length ? Math.max(...data) : 1
    const floor = Math.max(0, minimum - 5)
    return defineChart({
      marks: [
        areaY(points, { x: 'match', y: 'score', y1: floor, fill: stroke, fillOpacity: 0.14 }),
        lineY(points, { x: 'match', y: 'score', stroke, strokeWidth: 2 }),
      ],
      scales: {
        x: { scale: () => scaleLinear().domain([1, Math.max(2, data.length)]), axis: false },
        y: { scale: () => scaleLinear().domain([floor, Math.max(floor + 1, maximum + 5)]), axis: false },
      },
      guides: false,
      margin: { top: 3, right: 3, bottom: 3, left: 3 },
      ...(showTooltip ? { tooltip } : {}),
    })
  }, [data, showTooltip, stroke])

  return (
    <Box h={height} style={{ borderRadius: 8, background: `${stroke}08` }}>
      <Chart definition={definition} height={height} ariaLabel="Team scores by match" />
    </Box>
  )
}
