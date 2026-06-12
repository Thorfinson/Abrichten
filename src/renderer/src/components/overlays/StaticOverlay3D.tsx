import { useMemo, useState, useEffect } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { calculateStatic, type StaticRating } from '../../services/static-calc'
import { getMaterialById } from '../../data/materials'
import type { Board, Assembly } from '../../types/furniture'

const OVERLAY_COLORS: Record<StaticRating, number> = {
  ok: 0x22c55e,
  warning: 0xeab308,
  critical: 0xef4444
}

const OVERLAY_OPACITY: Record<StaticRating, number> = {
  ok: 0.12,
  warning: 0.18,
  critical: 0.22
}

const BORDER_COLORS: Record<StaticRating, string> = {
  ok: '#22c55e',
  warning: '#eab308',
  critical: '#ef4444'
}

/**
 * Find all boards that support a given board from below.
 * Returns boards that overlap horizontally and touch or are just below vertically (within 5mm).
 */
function findSupportBoards(target: Board, allBoards: Board[]): Board[] {
  const sMinX = target.position.x
  const sMaxX = target.position.x + target.width
  const sMinZ = target.position.z
  const sMaxZ = target.position.z + target.depth
  const sBottomY = target.position.y

  const supports: Board[] = []
  for (const b of allBoards) {
    if (b.id === target.id) continue
    const bTopY = b.position.y + b.height
    // Must be near the bottom of the target (within 5mm tolerance)
    if (Math.abs(bTopY - sBottomY) > 5) continue
    // Must overlap horizontally in X and Z
    const bMinX = b.position.x
    const bMaxX = b.position.x + b.width
    const bMinZ = b.position.z
    const bMaxZ = b.position.z + b.depth
    const overlapX = Math.min(sMaxX, bMaxX) - Math.max(sMinX, bMinX)
    const overlapZ = Math.min(sMaxZ, bMaxZ) - Math.max(sMinZ, bMinZ)
    if (overlapX > 0 && overlapZ > 0) supports.push(b)
  }
  return supports
}

/**
 * Calculate the weight of a board in kg from its volume and material density.
 * Volume: width × height × depth (mm³) → convert to m³ (÷ 1e9)
 * Weight: volume_m³ × density_kg/m³
 */
function boardWeightKg(board: Board): number {
  const mat = getMaterialById(board.materialId)
  if (!mat) return 0
  const volumeM3 = (board.width * board.height * board.depth) / 1e9
  return volumeM3 * mat.density
}

/**
 * Find all stone boards sitting on top of a given support board.
 * Returns the total load in kg from those stones.
 */
function stoneLoadOnSupport(support: Board, allBoards: Board[]): number {
  const bTopY = support.position.y + support.height
  const bMinX = support.position.x
  const bMaxX = support.position.x + support.width
  const bMinZ = support.position.z
  const bMaxZ = support.position.z + support.depth

  let totalLoad = 0
  for (const s of allBoards) {
    if (s.id === support.id) continue
    const sMat = getMaterialById(s.materialId)
    if (!sMat || sMat.category !== 'stone') continue
    // Stone must sit on top of this support (within 5mm)
    if (Math.abs(s.position.y - bTopY) > 5) continue

    const sMinX = s.position.x
    const sMaxX = s.position.x + s.width
    const sMinZ = s.position.z
    const sMaxZ = s.position.z + s.depth
    const overlapX = Math.min(sMaxX, bMaxX) - Math.max(sMinX, bMinX)
    const overlapZ = Math.min(sMaxZ, bMaxZ) - Math.max(sMinZ, bMinZ)
    if (overlapX <= 0 || overlapZ <= 0) continue

    // Proportion of stone weight on this support = overlap area / stone total area
    const stoneArea = s.width * s.depth
    const overlapArea = overlapX * overlapZ
    const fraction = stoneArea > 0 ? overlapArea / stoneArea : 0
    const stoneWeight = boardWeightKg(s)
    totalLoad += stoneWeight * fraction
  }
  return totalLoad
}

function StaticBox({ board, allBoards, userLoadKg }: { board: Board; allBoards: Board[]; userLoadKg: number }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const material = getMaterialById(board.materialId)
  const [hovered, setHovered] = useState(false)

  const analysis = useMemo(() => {
    if (!material) return null

    const isStone = material.category === 'stone'

    if (isStone) {
      // Stone: check if supported, calculate weight for display
      const supports = findSupportBoards(board, allBoards)
      const weight = boardWeightKg(board)
      if (supports.length > 0) {
        // Has support → OK
        return { rating: 'ok' as StaticRating, annotation: null, weight }
      }
      // No support
      return {
        rating: 'critical' as StaticRating,
        annotation: `${t('static.supportRequired')} (${weight.toFixed(1)} kg)`,
        weight
      }
    }

    // Non-stone: calculate structural load
    // Base load = stone weight sitting on top + user-configured load
    const stoneLoad = stoneLoadOnSupport(board, allBoards)
    const totalLoadKg = stoneLoad + userLoadKg

    const thickness = Math.min(board.height, board.depth)
    const result = calculateStatic(board.width, board.depth, thickness, totalLoadKg, material)

    if (result.rating === 'ok') {
      return { rating: 'ok' as StaticRating, annotation: null, weight: 0 }
    }

    const loadInfo = stoneLoad > 0
      ? ` (${stoneLoad.toFixed(1)}kg Stein + ${userLoadKg}kg)`
      : ''
    const annotation = `Min. ${result.minThicknessMm}mm (akt. ${result.currentThicknessMm}mm)${loadInfo}`
    return { rating: result.rating, annotation, weight: 0 }
  }, [material, board, allBoards, userLoadKg])

  if (!material || !analysis) return null
  // Show ok rating too (subtle green), skip glass/metal
  if (material.category === 'glass' || material.category === 'metal') return null

  const center: [number, number, number] = [
    board.position.x + board.width / 2,
    board.position.y + board.height / 2,
    board.position.z + board.depth / 2
  ]

  const rotation: [number, number, number] = [
    (board.rotation.x * Math.PI) / 180,
    (board.rotation.y * Math.PI) / 180,
    (board.rotation.z * Math.PI) / 180
  ]

  const pad = 1
  const color = OVERLAY_COLORS[analysis.rating]
  const opacity = analysis.rating === 'ok' ? 0.07 : OVERLAY_OPACITY[analysis.rating]
  const borderColor = BORDER_COLORS[analysis.rating]

  // Build tooltip detail text
  const tooltipLines: string[] = []
  tooltipLines.push(board.name)
  if (analysis.annotation) tooltipLines.push(analysis.annotation)
  tooltipLines.push(`${lang === 'de' ? 'Bewertung' : 'Rating'}: ${analysis.rating.toUpperCase()}`)

  return (
    <group position={center} rotation={rotation}>
      {/* Semi-transparent overlay box — also serves as hover target */}
      <mesh
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <boxGeometry args={[board.width + pad, board.height + pad, board.depth + pad]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
      </mesh>
      {/* Edge outline (only for warning/critical) */}
      {analysis.rating !== 'ok' && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(board.width + pad, board.height + pad, board.depth + pad)]} />
          <lineBasicMaterial color={color} />
        </lineSegments>
      )}
      {/* Hover tooltip */}
      {hovered && (
        <Html
          position={[0, board.height / 2 + 20, 0]}
          center
          style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
          zIndexRange={[100, 0]}
        >
          <div style={{
            background: 'rgba(15,15,20,0.92)',
            color: '#e5e7eb',
            fontSize: '11px',
            padding: '6px 10px',
            borderRadius: '4px',
            borderLeft: `3px solid ${borderColor}`,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            lineHeight: '1.6'
          }}>
            {tooltipLines.map((l, i) => (
              <div key={i} style={{ fontWeight: i === 0 ? 600 : 400, color: i === 0 ? borderColor : undefined }}>
                {l}
              </div>
            ))}
          </div>
        </Html>
      )}
      {/* Annotation label (always visible for warning/critical) */}
      {analysis.annotation && !hovered && (
        <Html
          position={[0, -(board.height / 2 + 15), 0]}
          center
          style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
          zIndexRange={[100, 0]}
        >
          <span style={{
            fontSize: '10px',
            fontWeight: 'bold',
            color: borderColor,
            background: 'rgba(255,255,255,0.85)',
            padding: '1px 4px',
            borderRadius: '2px'
          }}>
            {analysis.annotation}
          </span>
        </Html>
      )}
    </group>
  )
}

/**
 * 3D static analysis overlay — renders a colored box over each board
 * based on its structural rating (ok/warning/critical).
 */
export function StaticOverlay3D() {
  const project = useProjectStore((s) => s.project)
  const showStaticOverlay = useUIStore((s) => s.showStaticOverlay)
  const userLoadKg = useUIStore((s) => s.staticLoadKg)

  if (!showStaticOverlay) return null

  // Collect all boards from visible assemblies for support detection
  const allBoards = project.assemblies
    .filter((assembly) => assembly.visible !== false)
    .flatMap((assembly) => assembly.boards)

  return (
    <>
      {allBoards.map((board) => (
        <StaticBox key={`static-${board.id}`} board={board} allBoards={allBoards} userLoadKg={userLoadKg} />
      ))}
    </>
  )
}
