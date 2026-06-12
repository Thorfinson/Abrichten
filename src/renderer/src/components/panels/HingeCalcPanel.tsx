import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'

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
    cupDiameter: 35,
    cupDepth: 11.5,
    mountingHoleSpacing: 48,
    fullOverlayMm: 16,
    halfOverlayMm: 8,
    insetOffsetMm: -3
  }
]

/** Standard cup centre distance from door edge = 22mm for most European hinges */
const CUP_EDGE_DISTANCE = 22

/** Epic 18b: SVG diagram showing door with hinge positions */
function HingeDiagram({
  doorHeight, doorThickness, hingePositions, lang
}: {
  doorHeight: number
  doorThickness: number
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
      <h3 className="text-xs font-bold text-gray-500 uppercase mb-1">
        {lang === 'de' ? 'Scharnierdiagramm' : 'Hinge Diagram'}
      </h3>
      <svg width={SVG_W} height={SVG_H} className="border border-gray-200 rounded bg-gray-50 block mx-auto">
        {/* Door rectangle */}
        <rect x={doorX} y={doorY} width={doorW} height={doorH}
          fill="white" stroke="#6b7280" strokeWidth={1.5} />

        {/* Hinge circles + dimension lines */}
        {hingePositions.map((pos, i) => {
          const cy = doorY + pos * scale
          const circleX = doorX + 8  // near left edge of door

          // Dimension line on the right side
          const lineX = doorX + doorW + 8
          const arrowLen = 5

          return (
            <g key={i}>
              {/* Hinge cup circle */}
              <circle cx={circleX} cy={cy} r={5} fill="#3b82f6" stroke="#1d4ed8" strokeWidth={1} />
              <circle cx={circleX} cy={cy} r={2} fill="white" />

              {/* Dimension leader line from circle to right margin */}
              <line x1={circleX + 6} y1={cy} x2={lineX - 2} y2={cy}
                stroke="#94a3b8" strokeWidth={0.75} strokeDasharray="3 2" />

              {/* Value label */}
              <text x={lineX + 2} y={cy + 4} fontSize={9} fill="#1e40af" fontFamily="monospace">
                {pos}mm
              </text>
            </g>
          )
        })}

        {/* Door top label */}
        <text x={doorX + doorW / 2} y={doorY - 6} fontSize={8} fill="#6b7280"
          textAnchor="middle">{lang === 'de' ? 'OK Tür' : 'Top'}</text>

        {/* Door bottom label */}
        <text x={doorX + doorW / 2} y={doorY + doorH + 12} fontSize={8} fill="#6b7280"
          textAnchor="middle">{lang === 'de' ? 'UK Tür' : 'Bottom'}</text>

        {/* Door height annotation on left */}
        <line x1={doorX - 12} y1={doorY} x2={doorX - 12} y2={doorY + doorH}
          stroke="#94a3b8" strokeWidth={1} />
        <line x1={doorX - 16} y1={doorY} x2={doorX - 8} y2={doorY}
          stroke="#94a3b8" strokeWidth={1} />
        <line x1={doorX - 16} y1={doorY + doorH} x2={doorX - 8} y2={doorY + doorH}
          stroke="#94a3b8" strokeWidth={1} />
        <text x={doorX - 20} y={doorY + doorH / 2 + 4} fontSize={8} fill="#6b7280"
          textAnchor="middle" transform={`rotate(-90, ${doorX - 20}, ${doorY + doorH / 2})`}>
          {doorHeight}mm
        </text>
      </svg>
    </div>
  )
}

export function HingeCalcPanel() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const showHingeCalcPanel = useUIStore((s) => s.showHingeCalcPanel)
  const setShowHingeCalcPanel = useUIStore((s) => s.setShowHingeCalcPanel)

  const [doorThickness, setDoorThickness] = useState(18)
  const [doorHeight, setDoorHeight] = useState(700)
  const [doorWeightKg, setDoorWeightKg] = useState(10)
  const [cabinetThickness, setCabinetThickness] = useState(18)
  const [overlay, setOverlay] = useState<OverlayType>('full')
  const [hingeId, setHingeId] = useState('blum-clip-top')
  const [hingeCount, setHingeCount] = useState(2)

  if (!showHingeCalcPanel) return null

  const sys = HINGE_SYSTEMS.find((h) => h.id === hingeId) ?? HINGE_SYSTEMS[0]

  // Cup bore centre from door edge: always 22mm (Blum/Hettich/Grass standard)
  const cupEdge = CUP_EDGE_DISTANCE

  // Mounting plate position offset (how far the plate arm is from door edge):
  const overlayMm =
    overlay === 'full'  ? sys.fullOverlayMm :
    overlay === 'half'  ? sys.halfOverlayMm :
    sys.insetOffsetMm

  // Hinge position from top/bottom of door
  // Standard: first hinge 100–120mm from top, last hinge 100–120mm from bottom
  const hingePositions: number[] = []
  if (hingeCount === 1) {
    hingePositions.push(doorHeight / 2)
  } else {
    const topOffset    = Math.min(120, doorHeight * 0.15)
    const bottomOffset = Math.min(120, doorHeight * 0.15)
    const spread = doorHeight - topOffset - bottomOffset
    for (let i = 0; i < hingeCount; i++) {
      hingePositions.push(Math.round(topOffset + spread / (hingeCount - 1) * i))
    }
  }

  const copy = (text: string) => navigator.clipboard?.writeText(text)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowHingeCalcPanel(false) }}>
      <div className="bg-white rounded-lg shadow-xl w-[500px] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">{t('hinge.title')}</h2>
          <button onClick={() => setShowHingeCalcPanel(false)} className="text-gray-400 hover:text-gray-700 text-lg">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Hinge system */}
          <div className="bg-gray-50 rounded p-3 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-36 shrink-0">{lang === 'de' ? 'Scharnier' : 'Hinge System'}</label>
              <select
                value={hingeId}
                onChange={(e) => setHingeId(e.target.value)}
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white"
              >
                {HINGE_SYSTEMS.map((h) => (
                  <option key={h.id} value={h.id}>{h.name} ({h.manufacturer})</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-36 shrink-0">{t('hinge.overlay')}</label>
              <select
                value={overlay}
                onChange={(e) => setOverlay(e.target.value as OverlayType)}
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white"
              >
                <option value="full">{t('hinge.fullOverlay')} ({sys.fullOverlayMm}mm)</option>
                <option value="half">{t('hinge.halfOverlay')} ({sys.halfOverlayMm}mm)</option>
                <option value="inset">{t('hinge.inset')} ({sys.insetOffsetMm}mm)</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-36 shrink-0">{t('hinge.doorThickness')}</label>
              <input type="number" value={doorThickness} min={12} onChange={(e) => setDoorThickness(Number(e.target.value))}
                className="w-20 text-xs border border-gray-300 rounded px-2 py-1" />
              <span className="text-xs text-gray-400">mm</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-36 shrink-0">{lang === 'de' ? 'Türhöhe' : 'Door Height'}</label>
              <input type="number" value={doorHeight} min={100} onChange={(e) => setDoorHeight(Number(e.target.value))}
                className="w-20 text-xs border border-gray-300 rounded px-2 py-1" />
              <span className="text-xs text-gray-400">mm</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-36 shrink-0">{lang === 'de' ? 'Seitendicke' : 'Cabinet Side Thickness'}</label>
              <input type="number" value={cabinetThickness} min={12} onChange={(e) => setCabinetThickness(Number(e.target.value))}
                className="w-20 text-xs border border-gray-300 rounded px-2 py-1" />
              <span className="text-xs text-gray-400">mm</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-36 shrink-0">{lang === 'de' ? 'Türgewicht' : 'Door Weight'}</label>
              <input type="number" value={doorWeightKg} min={1} max={100} onChange={(e) => setDoorWeightKg(Number(e.target.value))}
                className="w-20 text-xs border border-gray-300 rounded px-2 py-1" />
              <span className="text-xs text-gray-400">kg</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-36 shrink-0">{lang === 'de' ? 'Anzahl Scharniere' : 'Hinge Count'}</label>
              <input type="number" value={hingeCount} min={1} max={6} onChange={(e) => setHingeCount(Number(e.target.value))}
                className="w-20 text-xs border border-gray-300 rounded px-2 py-1" />
            </div>
          </div>

          {/* Epic 18a — recommendation callout */}
          {(() => {
            const rec = recommendHingeCount(doorHeight, doorWeightKg)
            return (
              <div className={`flex items-center gap-2 rounded px-3 py-2 text-xs ${
                hingeCount >= rec ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-amber-50 border border-amber-200 text-amber-800'
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
                    className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-amber-600 text-white hover:bg-amber-700"
                  >
                    {lang === 'de' ? 'Übernehmen' : 'Apply'}
                  </button>
                )}
              </div>
            )
          })()}

          {/* Boring results */}
          <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
            <h3 className="text-xs font-bold text-blue-700 uppercase mb-1">{lang === 'de' ? 'Bohrmaße' : 'Boring Dimensions'}</h3>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white rounded p-2 border border-blue-200">
                <div className="text-gray-500 mb-0.5">{t('hinge.cupDiameter')}</div>
                <div className="font-bold text-blue-800">Ø{sys.cupDiameter}mm × {sys.cupDepth}mm {lang === 'de' ? 'tief' : 'deep'}</div>
              </div>
              <div className="bg-white rounded p-2 border border-blue-200">
                <div className="text-gray-500 mb-0.5">{t('hinge.cupCenter')}</div>
                <div className="font-bold text-blue-800 flex items-center gap-1">
                  {cupEdge}mm
                  <button onClick={() => copy(`${cupEdge}`)} className="text-[9px] px-1 py-0.5 rounded bg-blue-200 text-blue-700 hover:bg-blue-300">
                    {lang === 'de' ? 'Kop.' : 'Copy'}
                  </button>
                </div>
              </div>
              <div className="bg-white rounded p-2 border border-blue-200">
                <div className="text-gray-500 mb-0.5">{t('hinge.platePos')}</div>
                <div className="font-bold text-blue-800">{overlayMm}mm {lang === 'de' ? 'Überschlag' : 'overlay'}</div>
              </div>
              <div className="bg-white rounded p-2 border border-blue-200">
                <div className="text-gray-500 mb-0.5">{t('hinge.mountingHoles')}</div>
                <div className="font-bold text-blue-800">32mm Raster · Ø3mm × 12mm</div>
              </div>
            </div>
          </div>

          {/* Hinge positions */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-1">
              {lang === 'de' ? 'Scharnierposition (ab Türoberkante)' : 'Hinge Position (from door top)'}
            </h3>
            <div className="space-y-1">
              {hingePositions.map((pos, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                  <span className="text-gray-600">{lang === 'de' ? 'Scharnier' : 'Hinge'} {i + 1}</span>
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-gray-800">{pos}mm</span>
                    <button onClick={() => copy(`${pos}`)} className="text-[9px] px-1 py-0.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300">
                      {lang === 'de' ? 'Kop.' : 'Copy'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1 italic">
              {lang === 'de'
                ? 'Topfmitte von Türkante: 22mm (DIN-Standard). Alle Maße in mm.'
                : 'Cup centre from door edge: 22mm (DIN standard). All dimensions in mm.'}
            </p>
          </div>

          {/* Epic 18b — hinge position diagram */}
          <HingeDiagram
            doorHeight={doorHeight}
            doorThickness={doorThickness}
            hingePositions={hingePositions}
            lang={lang}
          />
        </div>

        <div className="p-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={() => setShowHingeCalcPanel(false)}
            className="text-sm px-4 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {t('actions.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
