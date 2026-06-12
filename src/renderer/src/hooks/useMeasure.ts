import { useState, useCallback } from 'react'
import { useUIStore } from '../store/useUIStore'
import { useProjectStore } from '../store/useProjectStore'
import { distance } from '../utils/geometry'
import { formatValue } from '../utils/units'
import type { MeasurementPoint, DistanceMeasurement } from '../types/measurement'

type MeasureState = 'idle' | 'first_placed' | 'complete'

export function useMeasure() {
  const [state, setState] = useState<MeasureState>('idle')
  const [pointA, setPointA] = useState<MeasurementPoint | null>(null)
  const [pointB, setPointB] = useState<MeasurementPoint | null>(null)

  const addMeasurement = useUIStore.getState().addMeasurement
  const displayUnit = useProjectStore((s) => s.project.displayUnit)

  const handleClick = useCallback((xMm: number, yMm: number) => {
    const point: MeasurementPoint = { x: xMm, y: yMm }

    if (state === 'idle' || state === 'complete') {
      // Start new measurement
      setPointA(point)
      setPointB(null)
      setState('first_placed')
    } else if (state === 'first_placed' && pointA) {
      // Complete measurement
      setPointB(point)
      setState('complete')

      const d = distance(pointA, point)
      const measurement: DistanceMeasurement = {
        type: 'distance',
        pointA,
        pointB: point,
        distance: d
      }
      addMeasurement(measurement)
    }
  }, [state, pointA, addMeasurement])

  const reset = useCallback(() => {
    setState('idle')
    setPointA(null)
    setPointB(null)
  }, [])

  return {
    state,
    pointA,
    pointB,
    handleClick,
    reset,
    displayUnit
  }
}
