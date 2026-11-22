import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import { useProjectStore } from '../../store/useProjectStore'
import { HINGE_CUP_EDGE_MM, hingePositionsMm, hardwareItems, withHinges } from '../../data/hardware'
import { getMaterialById } from '../../data/materials'
import { usePartLabels } from '../../hooks/usePartLabels'
import { partTitle } from '../../utils/partLabel'
import { boardFace, uprightFace } from '../../utils/boardFace'
import type { Board } from '../../types/furniture'

/** Epic 18a: recommend hinge count based on door height and weight */
function recommendHingeCount(doorHeightMm: number, doorWeightKg: number = 10): number {
  let count = Math.max(2, Math.ceil(doorHeightMm / 600))
  if (doorWeightKg > 15) count += Math.floor((doorWeightKg - 15) / 20)
  return count
}

type OverlayType = 'full' | 'half' | 'inset'

interface HingeSystem {
  id: string
  name: string
  manufacturer: string
  /** Catalogue item (data/hardware.ts) attached to the door by "apply" */
  hardwareId: string
  cupDiameter: number   // mm
  cupDepth: number      // mm
  mountingHoleSpacing: number  // mm centre-to-centre of plate screws
  fullOverlayMm: number
  halfOverlayMm: number
  insetOffsetMm: number
}

const HINGE_SYSTEMS: HingeSystem[] = [
  {
    id: 'blum-clip-top',
    name: 'Blum CLIP top',
    manufacturer: 'Blum',
    hardwareId: 'blum-clip-top-110',
    cupDiameter: 35,
    cupDepth: 12.5,
    mountingHoleSpacing: 48,
    fullOverlayMm: 17,
    halfOverlayMm: 9,
    insetOffsetMm: -4
  },
  {
    id: 'hettich-sensys',
    name: 'Hettich Sensys',
    manufacturer: 'Hettich',
    hardwareId: 'hettich-sensys-110',
    cupDiameter: 35,
    cupDepth: 11,
    mountingHoleSpacing: 48,
    fullOverlayMm: 16,
    halfOverlayMm: 8,
    insetOffsetMm: -3
  },
  {
    id: 'grass-tiomos',
    name: 'Grass Tiomos',
    manufacturer: 'Grass',
    hardwareId: 'grass-tiomos-110',
    cupDiameter: 35,
    cupDepth: 11.5,
    mountingHoleSpacing: 48,
    fullOverlayMm: 16,
    halfOverlayMm: 8,
    insetOffsetMm: -3
  }
]

const INPUT = 'w-20 text-xs bg-chrome-deep border border-chrome-border text-chrome-text rounded px-2 py-1 outline-none focus:border-action'
const SELECT = 'flex-1 min-w-0 text-xs bg-chrome-deep border border-chrome-border text-chrome-text rounded px-2 py-1 outline-none focus:border-action'
const LABEL = 'text-xs text-chrome-secondary w-36 shrink-0'
const COPY_BTN = 'text-[9px] px-1 py-0.5 rounded bg-chrome-surface text-chrome-secondary hover:bg-chrome-hover'

/** Epic 18b: SVG diagram showing door with hinge positions */
function HingeDiagram({
  doorHeight, hingePositions, lang
}: {
  doorHeight: number
  hingePositions: number[]
  lang: 'de' | 'en'
}) {
  // SVG dimensions — door rendered proportionally, capped at 200px tall
  const SVG_W = 200
  const SVG_H = 240
  const doorW = 60
  const doorH = 180
  const doorX = 70  // left edge of door in SVG
  const doorY = 20  // top of door

  // Scale factor: doorH SVG pixels = doorHeight mm
  const scale = doorH / doorHeight

  return (
    <div>
      <h3 className="text-xs font-bold text-chrome-muted uppercase mb-1">
        {lang === 'de' ? 'Scharnierdiagramm' : 'Hinge Diagram'}
      </h3>
      <svg width={SVG_W} height={SVG_H} className="border border-chrome-border rounded bg-chrome-deep block mx-auto">
        {/* Door rectangle */}
        <rect x={doorX} y={doorY} width={doorW} height={doorH}
          fill="#3f3f46" stroke="#a1a1aa" strokeWidth={1.5} />

        {/* Hinge circles + dimension lines */}
        {hingePositions.map((pos, i) => {
          const cy = doorY + pos * scale
          const circleX = doorX + 8  // near left edge of door
          const lineX = doorX + doorW + 8

          return (
            <g key={i}>
              {/* Hinge cup circle */}
              <circle cx={circleX} cy={cy} r={5} fill="#3b82f6" stroke="#93c5fd" strokeWidth={1} />
              <circle cx={circleX} cy={cy} r={2} fill="#18181b" />

              {/* Dimension leader line from circle to right margin */}
              <line x1={circleX + 6} y1={cy} x2={lineX - 2} y2={cy}
                stroke="#71717a" strokeWidth={0.75} strokeDasharray="3 2" />

              {/* Value label */}
              <text x={lineX + 2} y={cy + 4} fontSize={9} fill="#93c5fd" fontFamily="monospace">
                {pos}mm
              </text>
            </g>
          )
        })}

        {/* Door top label */}
        <text x={doorX + doorW / 2} y={doorY - 6} fontSize={8} fill="#a1a1aa"
          textAnchor="middle">{lang === 'de' ? 'OK Tür' : 'Top'}</text>

        {/* Door bottom label */}
        <text x={doorX + doorW / 2} y={doorY + doorH + 12} fontSize={8} fill="#a1a1aa"
          textAnchor="middle">{lang === 'de' ? 'UK Tür' : 'Bottom'}</text>

        {/* Door height annotation on left */}
        <line x1={doorX - 12} y1={doorY} x2={doorX - 12} y2={doorY + doorH}
          stroke="#71717a" strokeWidth={1} />
        <line x1={doorX - 16} y1={doorY} x2={doorX - 8} y2={doorY}
          stroke="#71717a" strokeWidth={1} />
        <line x1={doorX - 16} y1={doorY + doorH} x2={doorX - 8} y2={doorY + doorH}
          stroke="#71717a" strokeWidth={1} />
        <text x={doorX - 20} y={doorY + doorH / 2 + 4} fontSize={8} fill="#a1a1aa"
          textAnchor="middle" transform={`rotate(-90, ${doorX - 20}, ${doorY + doorH / 2})`}>
          {doorHeight}mm
        </text>
      </svg>
    </div>
  )
}

/** The single selected board (the door the calculator acts on), with its assembly. */
function useSelectedDoor(): { assemblyId: string; board: Board } | null {
  const project = useProjectStore((s) => s.project)
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const selectedAssemblyId = useUIStore((s) => s.selectedAssemblyId)
  if (selectedBoardIds.length !== 1) return null
  const board = project.assemblies.find((a) => a.id === selectedAssemblyId)?.boards.find((b) => b.id === selectedBoardIds[0])
  return board && selectedAssemblyId ? { assemblyId: selectedAssemblyId, board } : null
}

export function HingeCalcPanel() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const showHingeCalcPanel = useUIStore((s) => s.showHingeCalcPanel)
  const setShowHingeCalcPanel = useUIStore((s) => s.setShowHingeCalcPanel)
  const customMaterials = useProjectStore((s) => s.project.customMaterials)
  const door = useSelectedDoor()
  const labels = usePartLabels()

  const [doorThickness, setDoorThickness] = useState(18)
  const [doorHeight, setDoorHeight] = useState(700)
  const [doorWeightKg, setDoorWeightKg] = useState(10)
  const [cabinetThickness, setCabinetThickness] = useState(18)
  const [overlay, setOverlay] = useState<OverlayType>('full')
  const [hingeId, setHingeId] = useState('blum-clip-top')
  const [hingeCount, setHingeCount] = useState(2)

  // Opened with one board selected: take height, thickness and weight from it
  const doorId = door?.board.id
  useEffect(() => {
    if (!showHingeCalcPanel || !door) return
    const b = door.board
    const height = Math.round(uprightFace(b).y)
    const density = getMaterialById(b.materialId, customMaterials)?.density ?? 700
    const weight = Math.max(0.5, Math.round((b.weightKg ?? (density * b.width * b.height * b.depth) / 1e9) * 2) / 2)
    setDoorHeight(height)
    setDoorThickness(Math.round(boardFace(b).thickness * 10) / 10)
    setDoorWeightKg(weight)
    setHingeCount(recommendHingeCount(height, weight))
  }, [showHingeCalcPanel, doorId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!showHingeCalcPanel) return null

  const close = () => setShowHingeCalcPanel(false)
  const sys = HINGE_SYSTEMS.find((h) => h.id === hingeId) ?? HINGE_SYSTEMS[0]

  // Cup bore centre from door edge (shared with the boring list)
  const cupEdge = HINGE_CUP_EDGE_MM

  // Mounting plate position offset (how far the plate arm is from door edge):
  const overlayMm =
    overlay === 'full'  ? sys.fullOverlayMm :
    overlay === 'half'  ? sys.halfOverlayMm :
    sys.insetOffsetMm

  // Hinge positions from the door top: same margin rule as the boring list
  const hingePositions = hingePositionsMm(doorHeight, hingeCount)

  const copy = (text: string) => navigator.clipboard?.writeText(text)

  /** Attach the chosen hinges to the selected door (replacing any other hinge type), one undo step. */
  const applyToDoor = () => {
    if (!door) return
    const hardware = withHinges(door.board.hardware, sys.hardwareId, hingeCount)
    useProjectStore.getState().updateBoard(door.assemblyId, door.board.id, { hardware })
    const item = hardwareItems.find((h) => h.id === sys.hardwareId)
    const count = hardware.at(-1)?.quantity ?? hingeCount
    useUIStore.getState().setExportStatus(t('func.hingesApplied', {
      count, hinge: item ? (lang === 'de' ? item.name : item.nameEn) : sys.name, board: partTitle(labels.get(door.board.id), door.board.name)
    }))
    close()
  }

  const rec = recommendHingeCount(doorHeight, doorWeightKg)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="hinge-calc-title" className="bg-chrome-bg text-chrome-text border border-chrome-border rounded-lg shadow-2xl w-[500px] max-w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-chrome-border flex items-center justify-between">
          <h2 id="hinge-calc-title" className="text-sm font-bold">{t('hinge.title')}</h2>
          <button onClick={close} aria-label={t('calc.close')} className="text-chrome-muted hover:text-chrome-text text-lg">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Door from the selection */}
          <div className="text-xs text-chrome-muted">
            {door
              ? t('func.hingeDoorFrom', { board: partTitle(labels.get(door.board.id), door.board.name) })
              : t('func.hingeSelectDoor')}
          </div>

          {/* Hinge system */}
          <div className="bg-chrome-deep/60 border border-chrome-border rounded p-3 space-y-2">
            <div className="flex items-center gap-2">
              <label className={LABEL}>{lang === 'de' ? 'Scharnier' : 'Hinge System'}</label>
              <select value={hingeId} onChange={(e) => setHingeId(e.target.value)} className={SELECT}>
                {HINGE_SYSTEMS.map((h) => (
                  <option key={h.id} value={h.id}>{h.name} ({h.manufacturer})</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className={LABEL}>{t('hinge.overlay')}</label>
              <select value={overlay} onChange={(e) => setOverlay(e.target.value as OverlayType)} className={SELECT}>
                <option value="full">{t('hinge.fullOverlay')} ({sys.fullOverlayMm}mm)</option>
                <option value="half">{t('hinge.halfOverlay')} ({sys.halfOverlayMm}mm)</option>
                <option value="inset">{t('hinge.inset')} ({sys.insetOffsetMm}mm)</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className={LABEL}>{t('hinge.doorThickness')}</label>
              <input type="number" value={doorThickness} min={12} onChange={(e) => setDoorThickness(Number(e.target.value))} className={INPUT} />
              <span className="text-xs text-chrome-muted">mm</span>
            </div>
            <div className="flex items-center gap-2">
              <label className={LABEL}>{lang === 'de' ? 'Türhöhe' : 'Door Height'}</label>
              <input type="number" value={doorHeight} min={100} onChange={(e) => setDoorHeight(Number(e.target.value))} className={INPUT} />
              <span className="text-xs text-chrome-muted">mm</span>
            </div>
            <div className="flex items-center gap-2">
              <label className={LABEL}>{lang === 'de' ? 'Seitendicke' : 'Cabinet Side Thickness'}</label>
              <input type="number" value={cabinetThickness} min={12} onChange={(e) => setCabinetThickness(Number(e.target.value))} className={INPUT} />
              <span className="text-xs text-chrome-muted">mm</span>
            </div>
            <div className="flex items-center gap-2">
              <label className={LABEL}>{lang === 'de' ? 'Türgewicht' : 'Door Weight'}</label>
              <input type="number" value={doorWeightKg} min={1} max={100} onChange={(e) => setDoorWeightKg(Number(e.target.value))} className={INPUT} />
              <span className="text-xs text-chrome-muted">kg</span>
            </div>
            <div className="flex items-center gap-2">
              <label className={LABEL}>{lang === 'de' ? 'Anzahl Scharniere' : 'Hinge Count'}</label>
              <input type="number" value={hingeCount} min={1} max={6} onChange={(e) => setHingeCount(Number(e.target.value))} className={INPUT} />
            </div>
          </div>

          {/* Epic 18a — recommendation callout */}
          <div className={`flex items-center gap-2 rounded px-3 py-2 text-xs border ${
            hingeCount >= rec ? 'bg-success-dim/60 border-success/40 text-success-text' : 'bg-accent-dim/60 border-accent/40 text-accent-text'
          }`}>
            <span className="text-base">{hingeCount >= rec ? '✓' : '⚠'}</span>
            <span className="flex-1">
              {lang === 'de'
                ? `Empfohlen: ${rec} Scharniere für ${doorHeight}mm Tür (${doorWeightKg}kg)`
                : `Recommended: ${rec} hinges for a ${doorHeight}mm door (${doorWeightKg}kg)`}
            </span>
            {hingeCount !== rec && (
              <button
                onClick={() => setHingeCount(rec)}
                className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-chrome-surface text-chrome-text hover:bg-chrome-hover"
              >
                {lang === 'de' ? 'Übernehmen' : 'Apply'}
              </button>
            )}
          </div>

          {/* Boring results */}
          <div className="border border-chrome-border rounded p-3 space-y-2">
            <h3 className="text-xs font-bold text-info uppercase mb-1">{lang === 'de' ? 'Bohrmaße' : 'Boring Dimensions'}</h3>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-chrome-deep rounded p-2 border border-chrome-border">
                <div className="text-chrome-muted mb-0.5">{t('hinge.cupDiameter')}</div>
                <div className="font-bold text-info-text">Ø{sys.cupDiameter}mm × {sys.cupDepth}mm {lang === 'de' ? 'tief' : 'deep'}</div>
              </div>
              <div className="bg-chrome-deep rounded p-2 border border-chrome-border">
                <div className="text-chrome-muted mb-0.5">{t('hinge.cupCenter')}</div>
                <div className="font-bold text-info-text flex items-center gap-1">
                  {cupEdge}mm
                  <button onClick={() => copy(`${cupEdge}`)} className={COPY_BTN}>
                    {lang === 'de' ? 'Kop.' : 'Copy'}
                  </button>
                </div>
              </div>
              <div className="bg-chrome-deep rounded p-2 border border-chrome-border">
                <div className="text-chrome-muted mb-0.5">{t('hinge.platePos')}</div>
                <div className="font-bold text-info-text">{overlayMm}mm {lang === 'de' ? 'Überschlag' : 'overlay'}</div>
              </div>
              <div className="bg-chrome-deep rounded p-2 border border-chrome-border">
                <div className="text-chrome-muted mb-0.5">{t('hinge.mountingHoles')}</div>
                <div className="font-bold text-info-text">32mm Raster · Ø3mm × 12mm</div>
              </div>
            </div>
          </div>

          {/* Hinge positions */}
          <div>
            <h3 className="text-xs font-bold text-chrome-muted uppercase mb-1">
              {lang === 'de' ? 'Scharnierposition (ab Türoberkante)' : 'Hinge Position (from door top)'}
            </h3>
            <div className="space-y-1">
              {hingePositions.map((pos, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-chrome-deep/60 rounded px-2 py-1">
                  <span className="text-chrome-secondary">{lang === 'de' ? 'Scharnier' : 'Hinge'} {i + 1}</span>
                  <div className="flex items-center gap-1">
                    <span className="font-bold">{pos}mm</span>
                    <button onClick={() => copy(`${pos}`)} className={COPY_BTN}>
                      {lang === 'de' ? 'Kop.' : 'Copy'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-chrome-hint mt-1 italic">
              {lang === 'de'
                ? `Topfmitte von Türkante: ${HINGE_CUP_EDGE_MM}mm (Ø35-Topf, 3–6 mm Bohrabstand). Alle Maße in mm.`
                : `Cup centre from door edge: ${HINGE_CUP_EDGE_MM}mm (Ø35 cup, 3–6 mm boring distance). All dimensions in mm.`}
            </p>
          </div>

          {/* Epic 18b — hinge position diagram */}
          <HingeDiagram doorHeight={doorHeight} hingePositions={hingePositions} lang={lang} />
        </div>

        <div className="p-3 border-t border-chrome-border flex justify-end gap-2">
          <button
            onClick={close}
            className="text-sm px-4 py-1.5 rounded bg-chrome-surface text-chrome-text hover:bg-chrome-hover"
          >
            {t('ui.close')}
          </button>
          <button
            onClick={applyToDoor}
            disabled={!door}
            title={door ? undefined : t('func.hingeSelectDoor')}
            className="text-sm px-4 py-1.5 rounded bg-action text-action-text hover:bg-action-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('func.hingeApply')}
          </button>
        </div>
      </div>
    </div>
  )
}
