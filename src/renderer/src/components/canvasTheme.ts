import type { CSSProperties } from 'react'

/**
 * Colours of the dark viewport. three.js materials need literal colours, so
 * this mirrors the canvas tokens in index.css (`--color-canvas*`).
 */
export const CANVAS = {
  background: '#222226',
  /** 50 mm grid cells */
  gridCell: '#3a3a42',
  /** 1 m grid sections */
  gridSection: '#5c5c66',
  axisX: '#f87171',
  axisY: '#4ade80',
  axisZ: '#60a5fa',
  origin: '#d4d4d8',
  gridLabel: '#8b8b94',
  /** Board dimension lines and their labels */
  dimLine: '#e4e4e7',
  dimExtension: '#71717a',
  /** Assembly / large-selection overall dimension */
  dimAssembly: '#fb923c',
  measureDistance: '#f87171',
  measureAngle: '#c4b5fd',
  measureArea: '#6ee7b7',
  collision: '#f87171'
} as const

/**
 * z-index range of every drei <Html> label. DOM cards and panels sit at z-30
 * and above (modals z-50), so scene labels never show through them.
 */
export const HTML_Z_RANGE: [number, number] = [20, 0]

/** Pill behind a scene label (dimension, measurement, axis tick) */
export function sceneLabelStyle(color: string, fontSize = 10): CSSProperties {
  return {
    fontSize: `${fontSize}px`,
    lineHeight: 1.3,
    color,
    background: 'var(--color-canvas-label)',
    padding: '0 4px',
    borderRadius: '3px',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
    userSelect: 'none'
  }
}
