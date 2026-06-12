import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'

interface TolerancePreset {
  key: string
  labelDe: string
  labelEn: string
  valueMm: number
  noteDe: string
  noteEn: string
}

/** Epic 25a: Small SVG schematic showing where each tolerance applies */
function ToleranceDiagram({ toleranceKey }: { toleranceKey: string }) {
  const size = 38
  const s = size

  const diagrams: Record<string, React.ReactNode> = {
    door_reveal: (
      <svg width={s} height={s} viewBox="0 0 38 38">
        {/* Cabinet opening */}
        <rect x={2} y={2} width={34} height={34} fill="none" stroke="#6b7280" strokeWidth={1} />
        {/* Door inset */}
        <rect x={6} y={6} width={26} height={26} fill="#dbeafe" stroke="#3b82f6" strokeWidth={1} />
        {/* Gap indicator arrows */}
        <line x1={2} y1={19} x2={6} y2={19} stroke="#ef4444" strokeWidth={1.5} />
        <line x1={32} y1={19} x2={36} y2={19} stroke="#ef4444" strokeWidth={1.5} />
        <text x={19} y={22} fontSize={7} fill="#ef4444" textAnchor="middle" fontWeight="bold">X</text>
      </svg>
    ),
    door_reveal_3: (
      <svg width={s} height={s} viewBox="0 0 38 38">
        <rect x={2} y={2} width={34} height={34} fill="none" stroke="#6b7280" strokeWidth={1} />
        <rect x={7} y={7} width={24} height={24} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} />
        <line x1={2} y1={19} x2={7} y2={19} stroke="#ef4444" strokeWidth={1.5} />
        <line x1={31} y1={19} x2={36} y2={19} stroke="#ef4444" strokeWidth={1.5} />
        <text x={19} y={22} fontSize={7} fill="#ef4444" textAnchor="middle" fontWeight="bold">X</text>
      </svg>
    ),
    drawer_side_blum: (
      <svg width={s} height={s} viewBox="0 0 38 38">
        {/* Cabinet side */}
        <rect x={2} y={4} width={8} height={30} fill="#d1d5db" stroke="#6b7280" strokeWidth={1} />
        {/* Drawer box */}
        <rect x={14} y={8} width={22} height={22} fill="#dbeafe" stroke="#3b82f6" strokeWidth={1} />
        {/* Gap */}
        <line x1={10} y1={19} x2={14} y2={19} stroke="#ef4444" strokeWidth={2} />
        <text x={12} y={16} fontSize={7} fill="#ef4444" textAnchor="middle">X</text>
      </svg>
    ),
    drawer_side_grass: (
      <svg width={s} height={s} viewBox="0 0 38 38">
        <rect x={2} y={4} width={8} height={30} fill="#d1d5db" stroke="#6b7280" strokeWidth={1} />
        <rect x={19} y={8} width={17} height={22} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} />
        <line x1={10} y1={19} x2={19} y2={19} stroke="#ef4444" strokeWidth={2} />
        <text x={14} y={16} fontSize={7} fill="#ef4444" textAnchor="middle">X</text>
      </svg>
    ),
    drawer_height: (
      <svg width={s} height={s} viewBox="0 0 38 38">
        {/* Opening */}
        <rect x={2} y={2} width={34} height={34} fill="none" stroke="#6b7280" strokeWidth={1} />
        {/* Drawer */}
        <rect x={4} y={10} width={30} height={20} fill="#dbeafe" stroke="#3b82f6" strokeWidth={1} />
        {/* Gap above */}
        <line x1={19} y1={2} x2={19} y2={10} stroke="#ef4444" strokeWidth={1.5} />
        <text x={28} y={7} fontSize={7} fill="#ef4444">X</text>
      </svg>
    ),
    shelf_pin: (
      <svg width={s} height={s} viewBox="0 0 38 38">
        {/* Side panel */}
        <rect x={2} y={2} width={8} height={34} fill="#d1d5db" stroke="#6b7280" strokeWidth={1} />
        {/* Shelf */}
        <rect x={12} y={16} width={24} height={6} fill="#dbeafe" stroke="#3b82f6" strokeWidth={1} />
        {/* Gap */}
        <line x1={10} y1={19} x2={12} y2={19} stroke="#ef4444" strokeWidth={2} />
        <text x={11} y={14} fontSize={7} fill="#ef4444" textAnchor="middle">X</text>
      </svg>
    ),
    back_panel_groove: (
      <svg width={s} height={s} viewBox="0 0 38 38">
        {/* Side panel cross-section */}
        <rect x={4} y={2} width={14} height={34} fill="#d1d5db" stroke="#6b7280" strokeWidth={1} />
        {/* Groove */}
        <rect x={14} y={2} width={4} height={34} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} />
        {/* Back panel in groove */}
        <rect x={14} y={8} width={4} height={22} fill="#93c5fd" stroke="#3b82f6" strokeWidth={1} />
        {/* Depth indicator */}
        <line x1={18} y1={32} x2={24} y2={32} stroke="#ef4444" strokeWidth={1.5} />
        <text x={27} y={35} fontSize={7} fill="#ef4444">X</text>
      </svg>
    ),
    domino_gap: (
      <svg width={s} height={s} viewBox="0 0 38 38">
        {/* Board A */}
        <rect x={2} y={12} width={14} height={14} fill="#d1d5db" stroke="#6b7280" strokeWidth={1} />
        {/* Domino tenon */}
        <rect x={16} y={16} width={6} height={6} fill="#fbbf24" stroke="#f59e0b" strokeWidth={1} />
        {/* Board B */}
        <rect x={22} y={12} width={14} height={14} fill="#d1d5db" stroke="#6b7280" strokeWidth={1} />
        {/* Fit gap */}
        <text x={19} y={10} fontSize={7} fill="#ef4444" textAnchor="middle">X</text>
      </svg>
    ),
    hinge_overlay: (
      <svg width={s} height={s} viewBox="0 0 38 38">
        {/* Cabinet side */}
        <rect x={2} y={2} width={10} height={34} fill="#d1d5db" stroke="#6b7280" strokeWidth={1} />
        {/* Door (full overlay) */}
        <rect x={2} y={6} width={20} height={26} fill="#dbeafe" stroke="#3b82f6" strokeWidth={1} />
        {/* Overlay arrow */}
        <line x1={12} y1={30} x2={22} y2={30} stroke="#ef4444" strokeWidth={1.5} markerEnd="url(#a)" />
        <text x={26} y={33} fontSize={7} fill="#ef4444">X</text>
      </svg>
    ),
    hinge_overlay_half: (
      <svg width={s} height={s} viewBox="0 0 38 38">
        <rect x={2} y={2} width={10} height={34} fill="#d1d5db" stroke="#6b7280" strokeWidth={1} />
        {/* Door (half overlay — covers only half the side) */}
        <rect x={2} y={6} width={15} height={26} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} />
        <line x1={7} y1={30} x2={17} y2={30} stroke="#ef4444" strokeWidth={1.5} />
        <text x={20} y={33} fontSize={7} fill="#ef4444">X</text>
      </svg>
    ),
  }

  const diagram = diagrams[toleranceKey]
  if (!diagram) return null
  return <div className="shrink-0">{diagram}</div>
}

const PRESETS: TolerancePreset[] = [
  { key: 'door_reveal',       labelDe: 'Türspalt umlaufend',     labelEn: 'Door reveal (all around)',   valueMm: 2,    noteDe: 'Standard EU-Küche, Blum CLIP top', noteEn: 'Standard EU kitchen, Blum CLIP top' },
  { key: 'door_reveal_3',     labelDe: 'Türspalt (grob)',        labelEn: 'Door reveal (coarse)',        valueMm: 3,    noteDe: 'Massivholz, mehr Spielraum',       noteEn: 'Solid wood, more clearance' },
  { key: 'drawer_side_blum',  labelDe: 'Schublade Seite (Blum)', labelEn: 'Drawer side (Blum)',          valueMm: 12.5, noteDe: 'Blum TANDEM / Legrabox pro Seite',  noteEn: 'Blum TANDEM / Legrabox per side' },
  { key: 'drawer_side_grass', labelDe: 'Schublade Seite (Grass)',labelEn: 'Drawer side (Grass)',         valueMm: 17,   noteDe: 'Grass Nova Pro pro Seite',         noteEn: 'Grass Nova Pro per side' },
  { key: 'drawer_height',     labelDe: 'Schublade Höhenspiel',   labelEn: 'Drawer height clearance',    valueMm: 15,   noteDe: 'Über Schubladenkasten',           noteEn: 'Above drawer box' },
  { key: 'shelf_pin',         labelDe: 'Regalboden Einbaumaß',  labelEn: 'Shelf board setback',         valueMm: 2,    noteDe: 'Abstand zu Seite (Luft)',         noteEn: 'Clearance to side panel' },
  { key: 'back_panel_groove', labelDe: 'Rückwand Nuttiefe',      labelEn: 'Back panel groove depth',    valueMm: 8,    noteDe: 'Standard-Nuttiefe für Rückwände', noteEn: 'Standard groove depth for back panels' },
  { key: 'domino_gap',        labelDe: 'Domino/Dübel Einpress',  labelEn: 'Domino/Dowel press fit',     valueMm: 0.1,  noteDe: 'Einpresstoleranz',                noteEn: 'Press-fit tolerance' },
  { key: 'hinge_overlay',     labelDe: 'Scharnier Überschlag',   labelEn: 'Hinge overlay',              valueMm: 17,   noteDe: 'Blum CLIP top Vollüberschlag',    noteEn: 'Blum CLIP top full overlay' },
  { key: 'hinge_overlay_half',labelDe: 'Scharnier Halbüberschlag',labelEn: 'Hinge half overlay',       valueMm: 9,    noteDe: 'Blum CLIP top Halbüberschlag',   noteEn: 'Blum CLIP top half overlay' }
]

/** Epic 25b — Custom tolerance row with axis+value inputs */
function CustomToleranceRow({
  lang, canNudge, nudge
}: {
  lang: 'de' | 'en'
  canNudge: boolean
  nudge: (valueMm: number, axis: 'x' | 'y' | 'z', dir: 1 | -1) => void
}) {
  const [customAxis, setCustomAxis] = useState<'x' | 'y' | 'z'>('x')
  const [customValue, setCustomValue] = useState(1)

  return (
    <div className="border-t border-gray-300 bg-yellow-50 px-3 py-2">
      <span className="text-[10px] text-gray-500 font-bold uppercase mr-2">
        {lang === 'de' ? 'Eigener Wert' : 'Custom'}
      </span>
      <div className="flex items-center gap-2 mt-1">
        <select
          value={customAxis}
          onChange={(e) => setCustomAxis(e.target.value as 'x' | 'y' | 'z')}
          className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white w-14"
        >
          <option value="x">X</option>
          <option value="y">Y</option>
          <option value="z">Z</option>
        </select>
        <input
          type="number"
          value={customValue}
          min={0.1}
          step={0.5}
          onChange={(e) => setCustomValue(Math.max(0.1, Number(e.target.value)))}
          className="w-16 text-xs border border-gray-300 rounded px-1 py-0.5"
        />
        <span className="text-xs text-gray-400">mm</span>
        <button
          onClick={() => nudge(customValue, customAxis, -1)}
          disabled={!canNudge}
          className="px-2 py-0.5 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30 font-mono"
        >−</button>
        <button
          onClick={() => nudge(customValue, customAxis, 1)}
          disabled={!canNudge}
          className="px-2 py-0.5 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30 font-mono"
        >+</button>
      </div>
    </div>
  )
}

export function TolerancePanel() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const showTolerancePanel = useUIStore((s) => s.showTolerancePanel)
  const setShowTolerancePanel = useUIStore((s) => s.setShowTolerancePanel)
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const selectedAssemblyId = useUIStore((s) => s.selectedAssemblyId)
  const nudgeBoards = useProjectStore((s) => s.nudgeBoards)

  if (!showTolerancePanel) return null

  const canNudge = selectedBoardIds.length > 0 && selectedAssemblyId !== null

  const nudge = (valueMm: number, axis: 'x' | 'y' | 'z', dir: 1 | -1) => {
    if (!canNudge || !selectedAssemblyId) return
    const delta = { x: 0, y: 0, z: 0 }
    delta[axis] = valueMm * dir
    nudgeBoards(selectedAssemblyId, selectedBoardIds, delta)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowTolerancePanel(false) }}>
      <div className="bg-white rounded-lg shadow-xl w-[620px] max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">
            {lang === 'de' ? 'Toleranz-Referenz & Einstellmaße' : 'Tolerance Reference & Standard Clearances'}
          </h2>
          <button onClick={() => setShowTolerancePanel(false)} className="text-gray-400 hover:text-gray-700 text-lg">×</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-gray-100">
              <tr>
                <th className="border border-gray-200 px-2 py-2 text-center w-10">
                  {lang === 'de' ? 'Abb.' : 'Diag.'}
                </th>
                <th className="border border-gray-200 px-3 py-2 text-left">
                  {lang === 'de' ? 'Bezeichnung' : 'Name'}
                </th>
                <th className="border border-gray-200 px-2 py-2 text-right w-16">mm</th>
                <th className="border border-gray-200 px-3 py-2 text-left text-gray-500">
                  {lang === 'de' ? 'Hinweis' : 'Note'}
                </th>
                <th className="border border-gray-200 px-2 py-2 text-center w-36">
                  {lang === 'de' ? 'Brett verschieben' : 'Nudge board'}
                </th>
              </tr>
            </thead>
            <tbody>
              {PRESETS.map((p) => (
                <tr key={p.key} className="hover:bg-blue-50">
                  <td className="border border-gray-200 px-1 py-1 text-center">
                    <ToleranceDiagram toleranceKey={p.key} />
                  </td>
                  <td className="border border-gray-200 px-3 py-1.5 font-medium text-gray-800">
                    {lang === 'de' ? p.labelDe : p.labelEn}
                  </td>
                  <td className="border border-gray-200 px-2 py-1.5 text-right font-mono text-blue-700 font-bold">
                    {p.valueMm}
                  </td>
                  <td className="border border-gray-200 px-3 py-1.5 text-gray-400 italic">
                    {lang === 'de' ? p.noteDe : p.noteEn}
                  </td>
                  <td className="border border-gray-200 px-2 py-1.5">
                    <div className="flex gap-1 justify-center flex-wrap">
                      {(['x', 'y', 'z'] as const).map((axis) => (
                        <div key={axis} className="flex gap-0.5">
                          <button
                            onClick={() => nudge(p.valueMm, axis, -1)}
                            disabled={!canNudge}
                            className="px-1 py-0.5 text-[10px] bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30 font-mono"
                            title={`-${p.valueMm}mm ${axis.toUpperCase()}`}
                          >−{axis}</button>
                          <button
                            onClick={() => nudge(p.valueMm, axis, 1)}
                            disabled={!canNudge}
                            className="px-1 py-0.5 text-[10px] bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30 font-mono"
                            title={`+${p.valueMm}mm ${axis.toUpperCase()}`}
                          >+{axis}</button>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!canNudge && (
            <p className="text-xs text-gray-400 italic p-3 text-center">
              {lang === 'de'
                ? 'Brett auswählen um Verschiebe-Buttons zu aktivieren'
                : 'Select a board to enable nudge buttons'}
            </p>
          )}

          {/* Epic 25b — Custom tolerance entry */}
          <CustomToleranceRow lang={lang} canNudge={canNudge} nudge={nudge} />
        </div>

        <div className="p-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={() => setShowTolerancePanel(false)}
            className="text-sm px-4 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {t('actions.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
