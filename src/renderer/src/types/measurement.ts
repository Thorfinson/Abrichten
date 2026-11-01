import type { Vec3, Unit } from './furniture'

export interface MeasurementPoint {
  x: number
  y: number
}

export interface DistanceMeasurement {
  type: 'distance'
  pointA: MeasurementPoint
  pointB: MeasurementPoint
  distance: number // mm
}

export interface AngleMeasurement {
  type: 'angle'
  pointA: MeasurementPoint
  pointB: MeasurementPoint
  pointC: MeasurementPoint
  angle: number // degrees
}

export interface AreaMeasurement {
  type: 'area'
  points: MeasurementPoint[]
  area: number // mm²
}

/** `view`: the view whose plane the 2D points lie in, so every canvas draws it in place */
export type Measurement = (DistanceMeasurement | AngleMeasurement | AreaMeasurement) & { view?: ViewMode }

export type ToolMode = 'select' | 'measure' | 'angle' | 'area'
export type ViewMode = 'front' | 'side' | 'top' | '3d'
