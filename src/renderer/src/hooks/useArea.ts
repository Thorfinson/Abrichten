import { useState, useCallback } from 'react'
import { useUIStore } from '../store/useUIStore'
import { useProjectStore } from '../store/useProjectStore'
import { polygonArea } from '../utils/geometry'
import type { MeasurementPoint, AreaMeasurement } from '../types/measurement'

type AreaState = 'idle' | 'placing' | 'complete'

export function useArea() {
  const [state, setState] = useState<AreaState>('idle')
  const [points, setPoints] = useState<MeasurementPoint[]>([])

  const addMeasurement = useUIStore.getState().addMeasurement
  const displayUnit = useProjectStore((s) => s.project.displayUnit)

  const handleClick = useCallback((xMm: number, yMm: number) => {
    const point: MeasurementPoint = { x: xMm, y: yMm }

    if (state === 'complete') {
      // Start fresh
      setPoints([point])
      setState('placing')
    } else if (state === 'idle') {
      setPoints([point])
      setState('placing')
    } else {
      setPoints((prev) => [...prev, point])
    }
  }, [state])

  const handleDoubleClick = useCallback((xMm: number, yMm: number) => {
    const allPoints = [...points, { x: xMm, y: yMm }]
    if (allPoints.length < 3) return

    setState('complete')
    setPoints(allPoints)

    const area = polygonArea(allPoints)
    const measurement: AreaMeasurement = {
      type: 'area',
      points: allPoints,
      area
    }
    addMeasurement(measurement)
  }, [points, addMeasurement])

  const reset = useCallback(() => {
    setState('idle')
    setPoints([])
  }, [])

  return {
    state,
    points,
    handleClick,
    handleDoubleClick,
    reset,
    displayUnit
  }
}
