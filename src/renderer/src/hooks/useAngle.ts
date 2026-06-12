import { useState, useCallback } from 'react'
import { useUIStore } from '../store/useUIStore'
import { useProjectStore } from '../store/useProjectStore'
import { angleBetween } from '../utils/geometry'
import type { MeasurementPoint, AngleMeasurement } from '../types/measurement'

type AngleState = 'idle' | 'first_placed' | 'second_placed' | 'complete'

export function useAngle() {
  const [state, setState] = useState<AngleState>('idle')
  const [pointA, setPointA] = useState<MeasurementPoint | null>(null)
  const [pointB, setPointB] = useState<MeasurementPoint | null>(null)
  const [pointC, setPointC] = useState<MeasurementPoint | null>(null)

  const addMeasurement = useUIStore.getState().addMeasurement
  const displayUnit = useProjectStore((s) => s.project.displayUnit)

  const handleClick = useCallback((xMm: number, yMm: number) => {
    const point: MeasurementPoint = { x: xMm, y: yMm }

    if (state === 'idle' || state === 'complete') {
      setPointA(point)
      setPointB(null)
      setPointC(null)
      setState('first_placed')
    } else if (state === 'first_placed') {
      setPointB(point)
      setState('second_placed')
    } else if (state === 'second_placed' && pointA && pointB) {
      setPointC(point)
      setState('complete')

      const angle = angleBetween(pointA, pointB, point)
      const measurement: AngleMeasurement = {
        type: 'angle',
        pointA,
        pointB,
        pointC: point,
        angle
      }
      addMeasurement(measurement)
    }
  }, [state, pointA, pointB, addMeasurement])

  const reset = useCallback(() => {
    setState('idle')
    setPointA(null)
    setPointB(null)
    setPointC(null)
  }, [])

  return {
    state,
    pointA,
    pointB,
    pointC,
    handleClick,
    reset,
    displayUnit
  }
}
