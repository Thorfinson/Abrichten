import { useEffect, useMemo } from 'react'
import { Billboard, Html } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useUIStore } from '../../store/useUIStore'
import { useViewHidden } from '../../hooks/useViewHidden'
import { useProjectStore } from '../../store/useProjectStore'
import { useStaticSimulation, useStaticStore, modelFieldMax, DEFORMATION_SCALE, type StaticResultType, type StaticScaleMode } from '../../store/useStaticStore'
import { faceToWorld, openGapMm, worldToFace, type BoardStatic } from '../../services/static-sim'
import { utilisationRgb, utilisationCss, UNSUPPORTED_COLOR, NEUTRAL_COLOR, SUPPORT_COLOR, JOINT_COLOR } from '../../services/static-calc'
import { MAX_LOADS_PER_BOARD } from '../../utils/validateProject'
import { HTML_Z_RANGE } from '../canvasTheme'
import type { Board } from '../../types/furniture'
import {
  fieldGeometry, contourGeometry, boxCentre, frameOf, nodeNear, nodeWorld, place, displacement, type Rgba, type Vec
} from './staticFieldGeometry'
import { useDesignLocked } from '../../hooks/useDesignLocked'

/** The heat map sits this far outside the board; polygonOffset does the rest against z-fighting. */
const INFLATE_MM = 0.3
/** Contour lines lie this far above the heat map. */
const CONTOUR_LIFT_MM = 0.6
/** Contour levels: 25 / 50 / 75 / 100 % of the scale. */
export const CONTOUR_LEVELS = [0.25, 0.5, 0.75, 1] as const
/**
 * Opacity follows the value: parts that carry little stay see-through, so the stressed
 * ones stand out and parts behind them stay visible.
 */
const MIN_ALPHA = 0.62
const SOLID_FROM = 0.5
const UNSUPPORTED_ALPHA = 0.75
const NEUTRAL_ALPHA = 0.22
/** Outline crease angle: the box edges, not the element edges. */
const EDGE_ANGLE_DEG = 25
const BREAK_COLOR = '#ef4444'
const WARNING_COLOR = '#f59e0b'
const SELECTED_COLOR = '#3b82f6'
const HOTSPOT_COLOR = '#fafafa'
const HOTSPOT_HALO = '#18181b'
/** Support markers: this share of the board's longest side, within these limits (mm). */
const SUPPORT_SHARE = 0.012
const SUPPORT_MIN_MM = 5
const SUPPORT_MAX_MM = 14
const LOAD_COLOR = '#f4f4f5'
const CONTOUR_COLOR = '#09090b'
/** Drawn after the boards, so the heat map tints them. */
const HEAT_RENDER_ORDER = 2
const MARKER_RENDER_ORDER = 10
/** A placed load is a patch of this size (mm), as large as fits on a smaller board. */
export const LOAD_PATCH_MM = 100
/** Load arrow: head and shaft length, mm. */
const ARROW_HEAD_MM = 24
const ARROW_SHAFT_MM = 110
/** The label stands this far (px) above its hot-spot ring. */
const LABEL_CLEARANCE_PX = 26
/** A click that moved further than this (px) was a drag, not a placement. */
const CLICK_SLOP_PX = 4
/** Overlay meshes take no pointer events unless a load is being placed: picking and dragging stay with the boards. */
const noRaycast = (): void => {}

const heatAlpha = (v: number): number => MIN_ALPHA + (1 - MIN_ALPHA) * Math.min(1, Math.max(0, v) / SOLID_FROM)
const fmt = (v: number, lang: string, digits = 1): string => v.toLocaleString(lang, { maximumFractionDigits: digits })
const isRated = (r: BoardStatic): boolean => r.status !== 'unsupported' && r.status !== 'wallHung'
const isLying = (r: BoardStatic): boolean => r.field.axes[1] === 'z'
/** Critical by its deflection, not its stress: the deflection is what to point at. */
const sagGoverns = (r: BoardStatic): boolean => r.status === 'critical' && r.uMax < 1

function heatRgba(v: number): Rgba {
  const [r, g, b] = utilisationRgb(v)
  const c = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace)
  return { r: c.r, g: c.g, b: c.b, a: heatAlpha(v) }
}

/** Label text of a board, or null when it gets none (ok and not selected). */
export function staticLabel(r: BoardStatic, selected: boolean, mode: StaticResultType, t: TFunction, lang: string): string | null {
  const text = ratingLabel(r, selected, mode, t, lang)
  // a support assumed across a gap: why the board is not "ok" (services/static-sim SupportGap)
  const gap = openGapMm(r)
  return text !== null && gap !== null ? `${text} · ${t('sim.gapShort', { mm: fmt(gap, lang) })}` : text
}

function ratingLabel(r: BoardStatic, selected: boolean, mode: StaticResultType, t: TFunction, lang: string): string | null {
  if (r.status === 'unsupported') return selected ? t('sim.unsupported') : null   // purple + legend say it; labels would pile up
  if (r.status === 'wallHung') return selected ? t('sim.wallHung') : null
  if (r.status !== 'warning' && r.status !== 'critical' && !selected) return null
  const u = Math.round(r.uMax * 100)
  const sag = { d: fmt(r.deflectionMm, lang), allow: fmt(r.allowableDeflectionMm, lang) }
  if (mode === 'deflection') return r.allowableDeflectionMm > 0 ? t('sim.labelSag', sag) : t('sim.labelMax', { u: Math.round(r.sagMax * 100) })
  if (r.uMax >= 1) return r.governing === 'buckling' ? t('sim.labelBuckling', { u }) : t('sim.labelBreak', { u })
  if (sagGoverns(r)) return t('sim.labelSag', sag)
  return r.status === 'warning' && r.sagMax > r.uMax ? t('sim.labelMaxSag', { u, ...sag }) : t('sim.labelMax', { u })
}

/** Colour of a board's outline and label accent. */
function accentColor(r: BoardStatic): string {
  if (r.status === 'unsupported') return UNSUPPORTED_COLOR
  if (r.status === 'wallHung') return NEUTRAL_COLOR
  if (r.status === 'critical') return BREAK_COLOR
  if (r.status === 'warning') return WARNING_COLOR
  return utilisationCss(r.uMax)
}

/** Places a load (one undo step) where a lying board's top was clicked. */
// design-lock-ok: called only while placing a load, which the assembly workspace switches off
function placeLoad(boardId: string, point: THREE.Vector3, kg: number): void {
  const { project, updateBoard } = useProjectStore.getState()
  for (const assembly of project.assemblies) {
    const board = assembly.boards.find((b) => b.id === boardId)
    if (!board) continue
    const local = worldToFace(board, { x: point.x, z: point.z })
    if (!local || (board.loads?.length ?? 0) >= MAX_LOADS_PER_BOARD) return
    const w = Math.min(LOAD_PATCH_MM, board.width), d = Math.min(LOAD_PATCH_MM, board.depth)
    const clamp = (v: number, hi: number): number => Math.round(Math.min(hi, Math.max(0, v)))
    const load = { id: crypto.randomUUID(), x: clamp(local.x - w / 2, board.width - w), z: clamp(local.z - d / 2, board.depth - d), kg, w, d }
    updateBoard(assembly.id, board.id, { loads: [...(board.loads ?? []), load] })
    return
  }
}

/** Ring at the hot spot, always facing the camera and drawn over everything. */
function HotSpot({ boardId, position, radius, breaks }: { boardId: string; position: Vec; radius: number; breaks: boolean }) {
  const ring = useMemo(() => new THREE.RingGeometry(radius * 0.62, radius, 40), [radius])
  const halo = useMemo(() => new THREE.RingGeometry(radius * 0.5, radius * 1.14, 40), [radius])
  const dot = useMemo(() => new THREE.CircleGeometry(radius * 0.2, 20), [radius])
  useEffect(() => () => { ring.dispose(); halo.dispose(); dot.dispose() }, [ring, halo, dot])
  const color = breaks ? BREAK_COLOR : HOTSPOT_COLOR
  return (
    <Billboard position={position} userData={{ staticHotspot: boardId }}>
      <mesh geometry={halo} renderOrder={MARKER_RENDER_ORDER} raycast={noRaycast}>
        <meshBasicMaterial color={HOTSPOT_HALO} transparent opacity={0.55} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh geometry={ring} renderOrder={MARKER_RENDER_ORDER + 1} raycast={noRaycast}>
        <meshBasicMaterial color={color} transparent depthTest={false} depthWrite={false} />
      </mesh>
      <mesh geometry={dot} renderOrder={MARKER_RENDER_ORDER + 1} raycast={noRaycast}>
        <meshBasicMaterial color={color} transparent depthTest={false} depthWrite={false} />
      </mesh>
    </Billboard>
  )
}

/**
 * The supported nodes of the selected board in their final contact state: a small cone
 * under each, pointing at the board (the usual support symbol), drawn over everything.
 */
function Supports({ r, scale }: { r: BoardStatic; scale: number }) {
  const span = Math.max(r.box.x1 - r.box.x0, r.box.y1 - r.box.y0, r.box.z1 - r.box.z0)
  const size = Math.min(SUPPORT_MAX_MM, Math.max(SUPPORT_MIN_MM, SUPPORT_SHARE * span))
  return (
    <>
      <SupportMarkers r={r} scale={scale} size={size} kind={1} />
      <SupportMarkers r={r} scale={scale} size={size} kind={2} />
    </>
  )
}

/** One kind of support marker: 1 resting contacts (cones), 2 joints (squares). */
function SupportMarkers({ r, scale, size, kind }: { r: BoardStatic; scale: number; size: number; kind: 1 | 2 }) {
  const points = useMemo(() => {
    const f = frameOf(r), fld = r.field, na = fld.a.length
    const out: Vec[] = []
    if (r.model === 'none') return out
    for (let n = 0; n < fld.held.length; n++) {
      if (fld.held[n] !== kind) continue
      const [da, db, dc] = displacement(r, f, n, scale)
      const a = fld.a[n % na] + da, b = fld.b[Math.floor(n / na)] + db
      // below the bottom face of a lying board, below the node of a standing one
      out.push(f.C === 'y' ? place(f, a, b, f.c0 - size + dc) : place(f, a, b - size, (f.c0 + f.c1) / 2))
    }
    return out
  }, [r, scale, size])
  const geometry = useMemo(
    () => (kind === 1 ? new THREE.ConeGeometry(size * 0.6, size * 1.6, 12) : new THREE.BoxGeometry(size, size, size)),
    [size, kind]
  )
  const mesh = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({ color: kind === 1 ? SUPPORT_COLOR : JOINT_COLOR, transparent: true, depthTest: false, depthWrite: false })
    const m = new THREE.InstancedMesh(geometry, material, Math.max(1, points.length))
    const mat = new THREE.Matrix4()
    points.forEach((p, k) => m.setMatrixAt(k, mat.makeTranslation(p[0], p[1], p[2])))
    m.count = points.length
    m.renderOrder = MARKER_RENDER_ORDER
    m.raycast = noRaycast
    m.userData = { staticSupports: r.boardId, kind: kind === 1 ? 'contact' : 'joint', count: points.length }
    return m
  }, [geometry, points, r.boardId, kind])
  useEffect(() => () => { (mesh.material as THREE.Material).dispose(); mesh.dispose() }, [mesh])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <primitive object={mesh} />
}

interface BoardHeatProps {
  result: BoardStatic
  scale: number
  mode: StaticResultType
  /** Upper end of the colour range; null = the board's own maximum */
  rangeTop: number | null
  contours: boolean
  selected: boolean
  placing: boolean
  placeKg: number
  material: THREE.Material
}

/** Values divided by `top`, the upper end of the colour range (unchanged for 1 or nothing to scale by). */
function toRange(values: ArrayLike<number>, top: number): ArrayLike<number> {
  if (!(top > 0) || top === 1) return values
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = values[i] / top
  return out
}

function BoardHeat({ result: r, scale, mode, rangeTop, contours, selected, placing, placeKg, material }: BoardHeatProps) {
  const { t, i18n } = useTranslation()
  const rated = isRated(r)
  const raw = mode === 'stress' ? r.field.u : r.field.sag
  // Colour range 0 … rangeTop (model / board maximum, or 1 = absolute); null = this board's own maximum
  const values = useMemo(() => {
    let top = rangeTop
    if (top === null) { top = 0; for (let i = 0; i < raw.length; i++) if (raw[i] > top) top = raw[i] }
    return toRange(raw, top)
  }, [raw, rangeTop])
  const geometry = useMemo(() => {
    if (!rated) {
      const flat = new THREE.Color(r.status === 'unsupported' ? UNSUPPORTED_COLOR : NEUTRAL_COLOR)
      const a = r.status === 'unsupported' ? UNSUPPORTED_ALPHA : NEUTRAL_ALPHA
      return fieldGeometry(r, { values: new Float32Array(r.field.u.length), scale: 0, inflate: INFLATE_MM, color: () => ({ r: flat.r, g: flat.g, b: flat.b, a }) })
    }
    return fieldGeometry(r, { values, scale, inflate: INFLATE_MM, color: heatRgba })
  }, [r, scale, rated, values])
  const outline = useMemo(() => new THREE.EdgesGeometry(geometry, EDGE_ANGLE_DEG), [geometry])
  const lines = useMemo(
    () => (rated && contours && r.model !== 'none' ? contourGeometry(r, values, CONTOUR_LEVELS, scale, INFLATE_MM + CONTOUR_LIFT_MM) : null),
    [r, rated, contours, values, scale]
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => outline.dispose(), [outline])
  useEffect(() => () => lines?.dispose(), [lines])

  const centre = boxCentre(r)
  const label = staticLabel(r, selected, mode, t, i18n.language)
  const accent = accentColor(r)
  // the hot spot: the maximum of what the map shows (where a board critical by its sag sags most)
  const showHot = rated && label !== null && r.model !== 'none'
  const target = mode === 'deflection' || sagGoverns(r) ? r.sagAt : r.maxAt
  const hotNode = nodeNear(r, target)
  const hotPos = nodeWorld(r, hotNode, scale, isLying(r) ? 'hi' : 'mid')
  const span = Math.max(r.box.x1 - r.box.x0, r.box.z1 - r.box.z0, r.box.y1 - r.box.y0)
  const radius = Math.min(28, Math.max(9, 0.035 * span))
  const breaks = mode === 'stress' && r.uMax >= 1
  const labelPos: Vec = label && !showHot ? [centre[0], r.box.y1 + 14, centre[2]] : hotPos

  const pick = placing ? THREE.Mesh.prototype.raycast : noRaycast
  const onPointerDown = placing
    ? (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); e.nativeEvent.stopPropagation() }
    : undefined
  const onClick = placing
    ? (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      if (e.delta > CLICK_SLOP_PX || !isLying(r) || !e.face || e.face.normal.y < 0.5) return
      placeLoad(r.boardId, e.point, placeKg)
    }
    : undefined

  return (
    <>
      <mesh
        geometry={geometry}
        material={material}
        position={centre}
        renderOrder={HEAT_RENDER_ORDER}
        raycast={pick}
        onPointerDown={onPointerDown}
        onClick={onClick}
        userData={{ staticBoardId: r.boardId, status: r.status, mode }}
      />
      <lineSegments geometry={outline} position={centre} renderOrder={HEAT_RENDER_ORDER} raycast={noRaycast}>
        <lineBasicMaterial color={selected ? SELECTED_COLOR : accent} transparent opacity={rated ? 0.95 : 0.6} depthWrite={false} />
      </lineSegments>
      {lines && (
        <lineSegments geometry={lines} position={centre} renderOrder={HEAT_RENDER_ORDER + 1} raycast={noRaycast} userData={{ staticContours: r.boardId }}>
          <lineBasicMaterial color={CONTOUR_COLOR} transparent opacity={0.5} depthWrite={false} />
        </lineSegments>
      )}
      {showHot && <HotSpot boardId={r.boardId} position={hotPos} radius={radius} breaks={breaks} />}
      {selected && rated && <Supports r={r} scale={scale} />}
      {selected && r.gaps && <GapMarkers r={r} />}
      {label && (
        <Html position={labelPos} zIndexRange={HTML_Z_RANGE} style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          <div
            data-testid="static-label"
            data-board-id={r.boardId}
            style={{
              transform: `translate(-50%, calc(-100% - ${showHot ? LABEL_CLEARANCE_PX : 0}px))`,
              background: 'rgba(24,24,27,0.92)',
              color: breaks ? '#fecaca' : '#f4f4f5',
              borderLeft: `3px solid ${accent}`,
              borderRadius: 4,
              padding: '2px 7px',
              fontSize: 11,
              fontWeight: 600,
              lineHeight: '16px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
              userSelect: 'none'
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </>
  )
}

/** The gaps of the selected board's supports, where they are, with their width. */
function GapMarkers({ r }: { r: BoardStatic }) {
  const { t, i18n } = useTranslation()
  return (
    <>
      {(r.gaps ?? []).map((g, i) => (
        <Html key={i} position={[g.at.x, g.at.y, g.at.z]} zIndexRange={HTML_Z_RANGE} style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          <div
            data-testid="static-gap"
            data-bridged={g.bridged ? 'true' : 'false'}
            style={{
              transform: 'translate(-50%, -50%)',
              background: g.bridged ? 'rgba(244,244,245,0.9)' : 'rgba(24,24,27,0.92)',
              color: g.bridged ? '#3f3f46' : '#fde68a',
              border: g.bridged ? '1px solid #a1a1aa' : `1px solid ${WARNING_COLOR}`,
              borderRadius: 3, padding: '0 5px', fontSize: 10, fontWeight: 600, lineHeight: '15px', userSelect: 'none'
            }}
          >
            {t(g.bridged ? 'sim.gapBridged' : 'sim.gapShort', { mm: fmt(g.mm, i18n.language) })}
          </div>
        </Html>
      ))}
    </>
  )
}

/** One placed load: a downward arrow onto its patch, with its weight. */
function LoadArrow({ board, load, r, scale }: { board: Board; load: NonNullable<Board['loads']>[number]; r: BoardStatic; scale: number }) {
  const { t } = useTranslation()
  const corners = useMemo(() => {
    const map = faceToWorld(board)
    if (!map) return null
    return [[load.x, load.z], [load.x + load.w, load.z], [load.x + load.w, load.z + load.d], [load.x, load.z + load.d]].map(([px, pz]) => map(px, pz))
  }, [board, load.x, load.z, load.w, load.d])
  const outline = useMemo(() => {
    if (!corners) return null
    const cx = corners.reduce((s, p) => s + p.x, 0) / 4, cz = corners.reduce((s, p) => s + p.z, 0) / 4
    return new THREE.BufferGeometry().setFromPoints(corners.map((p) => new THREE.Vector3(p.x - cx, 0.8, p.z - cz)))
  }, [corners])
  useEffect(() => () => outline?.dispose(), [outline])
  if (!corners || !outline) return null
  const cx = corners.reduce((s, p) => s + p.x, 0) / 4, cz = corners.reduce((s, p) => s + p.z, 0) / 4
  const dy = isLying(r) ? displacement(r, frameOf(r), nodeNear(r, { x: cx, y: r.box.y1, z: cz }), scale)[2] : 0
  return (
    <group position={[cx, r.box.y1 + INFLATE_MM + dy, cz]} userData={{ staticLoadArrow: load.id, boardId: board.id, kg: load.kg }}>
      <mesh position={[0, ARROW_HEAD_MM / 2, 0]} rotation={[Math.PI, 0, 0]} renderOrder={MARKER_RENDER_ORDER} raycast={noRaycast}>
        <coneGeometry args={[7, ARROW_HEAD_MM, 18]} />
        <meshBasicMaterial color={LOAD_COLOR} transparent depthTest={false} depthWrite={false} />
      </mesh>
      <mesh position={[0, ARROW_HEAD_MM + ARROW_SHAFT_MM / 2, 0]} renderOrder={MARKER_RENDER_ORDER} raycast={noRaycast}>
        <cylinderGeometry args={[1.8, 1.8, ARROW_SHAFT_MM, 8]} />
        <meshBasicMaterial color={LOAD_COLOR} transparent depthTest={false} depthWrite={false} />
      </mesh>
      <lineLoop geometry={outline} renderOrder={MARKER_RENDER_ORDER} raycast={noRaycast}>
        <lineBasicMaterial color={LOAD_COLOR} transparent depthTest={false} depthWrite={false} />
      </lineLoop>
      <Html position={[0, ARROW_HEAD_MM + ARROW_SHAFT_MM + 4, 0]} zIndexRange={HTML_Z_RANGE} style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        <div
          data-testid="static-load-label"
          data-board-id={board.id}
          style={{
            transform: 'translate(-50%, -100%)',
            background: 'rgba(244,244,245,0.95)', color: '#18181b', borderRadius: 3,
            padding: '0 5px', fontSize: 10, fontWeight: 700, lineHeight: '15px', userSelect: 'none'
          }}
        >
          {t('sim.loadArrow', { kg: load.kg })}
        </div>
      </Html>
    </group>
  )
}

/** Arrows for every load placed on a visible board. */
function PlacedLoads({ results, scale }: { results: Map<string, BoardStatic>; scale: number }) {
  const assemblies = useProjectStore((s) => s.project.assemblies)
  const hidden = useViewHidden()
  return (
    <>
      {assemblies.filter((a) => a.visible !== false).flatMap((a) => a.boards.flatMap((b) => {
        const r = hidden.has(b.id) ? undefined : results.get(b.id)
        // only lying boards carry placed loads (services/static-sim.ts ownLoads)
        if (!r || !b.loads?.length || !isLying(r)) return []
        return b.loads.map((l) => <LoadArrow key={l.id} board={b} load={l} r={r} scale={scale} />)
      }))}
    </>
  )
}

/** Esc (or switching statics off) leaves the "Last setzen" mode; the canvas shows a crosshair meanwhile. */
function usePlacementMode(placing: boolean): void {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!placing) return
    const canvas = gl.domElement
    const before = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()   // handled: the global Esc (deselect) must not run as well
      useStaticStore.getState().setPlacingLoad(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true); canvas.style.cursor = before }
  }, [placing, gl])
  useEffect(() => () => useStaticStore.getState().setPlacingLoad(false), [])
}

/** Heat map of the load simulation, drawn on the boards. */
function StaticHeatMap() {
  const sim = useStaticSimulation()
  const showDeformation = useStaticStore((s) => s.showDeformation)
  const mode = useStaticStore((s) => s.resultType)
  const contours = useStaticStore((s) => s.showContours)
  const scaleMode = useStaticStore((s) => s.scaleMode)
  // placing a load changes the design: never in the assembly workspace (store/designLock.ts)
  const locked = useDesignLocked()
  const placing = useStaticStore((s) => s.placingLoad) && !locked
  const placeKg = useStaticStore((s) => s.placeKg)
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  // the simulation covers the whole furniture; parts the assembly step view hides get no colour
  const hidden = useViewHidden()
  usePlacementMode(placing)
  // One material for all boards: colour and opacity come per vertex
  const material = useMemo(() => new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4
  }), [])
  useEffect(() => () => material.dispose(), [material])

  const scale = showDeformation ? DEFORMATION_SCALE : 0
  const modelMax = useMemo(() => modelFieldMax(sim, mode), [sim, mode])
  const rangeTop = scaleMode === 'absolute' ? 1 : scaleMode === 'model' ? modelMax : null
  return (
    <group name="static-heatmap" userData={{ simulationMs: sim.durationMs, solved: sim.solved }}>
      {[...sim.results.values()].filter((r) => !hidden.has(r.boardId)).map((r) => (
        <BoardHeat
          key={r.boardId}
          result={r}
          scale={scale}
          mode={mode}
          rangeTop={rangeTop}
          contours={contours}
          selected={selectedBoardIds.includes(r.boardId)}
          placing={placing}
          placeKg={placeKg}
          material={material}
        />
      ))}
      <PlacedLoads results={sim.results} scale={scale} />
    </group>
  )
}

/**
 * Static overlay: the 2D load simulation as an FE-style field on the boards (stress or
 * deflection), contour lines, a ring and label at the maximum of each board that needs
 * attention, the supports of the selected board, placed loads as arrows, optionally
 * the deformed shape.
 */
export function StaticOverlay3D() {
  const showStaticOverlay = useUIStore((s) => s.showStaticOverlay)
  return showStaticOverlay ? <StaticHeatMap /> : null
}
