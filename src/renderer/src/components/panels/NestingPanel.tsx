import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { nestBoards, nestingToSvg } from '../../utils/nesting'
import type { NestingResult, NestingGroup } from '../../utils/nesting'

const SHEET_PRESETS = [
  { label: 'standard', w: 2800, h: 2070 },
  { label: 'euro',     w: 2440, h: 1220 },
  { label: 'small',   w: 1220, h: 610  }
]

const CUSTOM_SIZE_KEY = 'abrichten-nesting-custom-size'

function efficiencyColor(pct: number): string {
  if (pct >= 0.8) return 'text-green-700'
  if (pct >= 0.6) return 'text-amber-600'
  return 'text-red-600'
}

export function NestingPanel() {
  const { t, i18n } = useTranslation()
  const project = useProjectStore((s) => s.project)
  const showNestingPanel = useUIStore((s) => s.showNestingPanel)
  const setShowNestingPanel = useUIStore((s) => s.setShowNestingPanel)

  const [sheetW, setSheetW] = useState(2800)
  const [sheetH, setSheetH] = useState(2070)
  const [kerf, setKerf] = useState(3)
  const [allowRotation, setAllowRotation] = useState(false)
  const [result, setResult] = useState<NestingResult | null>(null)
  const [activeGroup, setActiveGroup] = useState(0)
  const [activeSheet, setActiveSheet] = useState(0)

  const isPreset = SHEET_PRESETS.some((p) => p.w === sheetW && p.h === sheetH)

  const handleSetCustom = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(CUSTOM_SIZE_KEY) ?? 'null')
      if (saved?.w && saved?.h) { setSheetW(saved.w); setSheetH(saved.h) }
    } catch { /* ignore */ }
  }

  const handleSheetWChange = (v: number) => {
    setSheetW(v)
    localStorage.setItem(CUSTOM_SIZE_KEY, JSON.stringify({ w: v, h: sheetH }))
  }
  const handleSheetHChange = (v: number) => {
    setSheetH(v)
    localStorage.setItem(CUSTOM_SIZE_KEY, JSON.stringify({ w: sheetW, h: v }))
  }

  if (!showNestingPanel) return null

  const allBoards = project.assemblies.flatMap((a) => a.boards)

  const handleOptimize = () => {
    if (allBoards.length === 0) return
    const r = nestBoards(allBoards, sheetW, sheetH, kerf, allowRotation)
    setResult(r)
    setActiveGroup(0)
    setActiveSheet(0)
  }

  const group: NestingGroup | undefined = result?.groups[activeGroup]
  const currentSheet = group?.sheets[activeSheet]
  const svgContent = currentSheet ? nestingToSvg(currentSheet, 0.12) : null

  const handleExportSvg = () => {
    if (!svgContent || !group) return
    const filename = `${project.name}_nesting_${group.materialName}_${group.thickness}mm_sheet${activeSheet + 1}.svg`
    const blob = new Blob([svgContent], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowNestingPanel(false) }}>
      <div className="bg-white rounded-lg shadow-xl w-[860px] max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">{t('nesting.title')}</h2>
          <button onClick={() => setShowNestingPanel(false)} className="text-gray-400 hover:text-gray-700 text-lg">×</button>
        </div>

        {/* Settings */}
        <div className="p-4 border-b border-gray-100 flex gap-3 items-end flex-wrap">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Preset</label>
            <div className="flex gap-1">
              {SHEET_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => { setSheetW(p.w); setSheetH(p.h) }}
                  className={`text-xs px-2 py-1 rounded border ${sheetW === p.w && sheetH === p.h ? 'bg-blue-600 text-white border-blue-700' : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'}`}
                >
                  {t(`nesting.presets.${p.label}`)}
                </button>
              ))}
              <button
                onClick={handleSetCustom}
                className={`text-xs px-2 py-1 rounded border ${!isPreset ? 'bg-blue-600 text-white border-blue-700' : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'}`}
                title={i18n.language === 'de' ? 'Zuletzt verwendete benutzerdefinierte Größe' : 'Last used custom size'}
              >
                {i18n.language === 'de' ? 'Eigen' : 'Custom'}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">{t('nesting.sheetWidth')}</label>
            <input type="number" value={sheetW} onChange={(e) => handleSheetWChange(Number(e.target.value))}
              className="w-24 text-xs border border-gray-300 rounded px-2 py-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">{t('nesting.sheetHeight')}</label>
            <input type="number" value={sheetH} onChange={(e) => handleSheetHChange(Number(e.target.value))}
              className="w-24 text-xs border border-gray-300 rounded px-2 py-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">{t('nesting.sawKerf')}</label>
            <input type="number" value={kerf} onChange={(e) => setKerf(Number(e.target.value))}
              className="w-16 text-xs border border-gray-300 rounded px-2 py-1" />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer self-end pb-1.5">
            <input
              type="checkbox"
              checked={allowRotation}
              onChange={(e) => setAllowRotation(e.target.checked)}
              className="w-3 h-3"
            />
            {i18n.language === 'de' ? '90° Drehung erlauben' : 'Allow 90° rotation'}
          </label>
          <button
            onClick={handleOptimize}
            disabled={allBoards.length === 0}
            className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t('nesting.optimize')}
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Left nav: groups + sheets */}
          <div className="w-52 shrink-0 border-r border-gray-200 overflow-y-auto">
            {result ? (
              <div className="p-3">
                {/* Overall stats */}
                <div className="text-xs text-gray-600 mb-3 bg-gray-50 rounded p-2 space-y-0.5">
                  <div className="font-bold">{result.totalSheets} {t('nesting.sheets')} total</div>
                  <div>{t('nesting.efficiency')}: <span className={`font-bold ${efficiencyColor(result.overallEfficiency)}`}>{(result.overallEfficiency * 100).toFixed(1)}%</span></div>
                  {/* Efficiency bar */}
                  <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${result.overallEfficiency >= 0.8 ? 'bg-green-500' : result.overallEfficiency >= 0.6 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, result.overallEfficiency * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Material groups */}
                {result.groups.map((g, gi) => (
                  <div key={gi} className="mb-3">
                    <div
                      className={`text-xs font-medium px-2 py-1 rounded cursor-pointer ${activeGroup === gi ? 'bg-blue-100 text-blue-800' : 'text-gray-700 hover:bg-gray-100'}`}
                      onClick={() => { setActiveGroup(gi); setActiveSheet(0) }}
                    >
                      <div className="truncate">{g.materialName}</div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">{g.thickness}mm · {g.sheets.length} {t('nesting.sheets')}</span>
                        <span className={`font-bold ${efficiencyColor(g.efficiency)}`}>· {(g.efficiency * 100).toFixed(0)}%</span>
                      </div>
                      {/* Per-group efficiency bar */}
                      <div className="mt-0.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${g.efficiency >= 0.8 ? 'bg-green-400' : g.efficiency >= 0.6 ? 'bg-amber-400' : 'bg-red-400'}`}
                          style={{ width: `${Math.min(100, g.efficiency * 100)}%` }}
                        />
                      </div>
                      {g.unplacedCount > 0 && (
                        <div className="text-red-500">⚠ {g.unplacedCount} unplaced</div>
                      )}
                    </div>
                    {activeGroup === gi && g.sheets.map((_, si) => (
                      <button
                        key={si}
                        onClick={() => setActiveSheet(si)}
                        className={`w-full text-xs px-3 py-0.5 text-left ${activeSheet === si ? 'text-blue-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        → {t('nesting.sheet')} {si + 1} ({g.sheets[si].placed.length} {t('cutting.pieces')})
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4">
                <p className="text-xs text-gray-400 italic">
                  {allBoards.length === 0 ? t('nesting.noBoards') : t('nesting.result') + '...'}
                </p>
              </div>
            )}
          </div>

          {/* SVG preview */}
          <div className="flex-1 overflow-auto p-4 flex items-start justify-center bg-gray-50">
            {svgContent ? (
              <div>
                {group && (
                  <p className="text-xs text-gray-500 mb-2 text-center">
                    {group.materialName} · {group.thickness}mm · {t('nesting.sheet')} {activeSheet + 1}/{group.sheets.length}
                    {' · '}{t('nesting.waste')}: <span className="text-red-600">{group.wastePercent.toFixed(1)}%</span>
                  </p>
                )}
                <div dangerouslySetInnerHTML={{ __html: svgContent }} />
              </div>
            ) : (
              <div className="text-xs text-gray-400 italic mt-8">{t('nesting.result')}...</div>
            )}
          </div>
        </div>

        <div className="p-3 border-t border-gray-200 flex justify-end gap-2">
          {svgContent && (
            <button
              onClick={handleExportSvg}
              className="text-sm px-4 py-1.5 rounded bg-green-600 text-white hover:bg-green-700"
            >
              {t('nesting.export')}
            </button>
          )}
          <button
            onClick={() => setShowNestingPanel(false)}
            className="text-sm px-4 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {t('actions.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
