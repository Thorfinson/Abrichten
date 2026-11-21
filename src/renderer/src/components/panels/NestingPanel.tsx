import { useEffect, useMemo, useRef, useState } from 'react'
import { activeAssemblies } from '../../utils/activeParts'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { nestBoards, nestingToSvg } from '../../utils/nesting'
import { partLabels } from '../../utils/partLabel'
import type { NestingResult, NestingGroup } from '../../utils/nesting'
import { Dialog, Button, FIELD_CLASS, LABEL_CLASS, CHECK_CLASS, segmentClass } from '../ui/Dialog'

const SHEET_PRESETS = [
  { label: 'standard', w: 2800, h: 2070 },
  { label: 'euro',     w: 2440, h: 1220 },
  { label: 'small',   w: 1220, h: 610  }
]

const CUSTOM_SIZE_KEY = 'abrichten-nesting-custom-size'
/** Inputs settle for this long before the layout is recomputed */
const RECOMPUTE_DEBOUNCE_MS = 300

function efficiencyColor(pct: number): string {
  if (pct >= 0.8) return 'text-success'
  if (pct >= 0.6) return 'text-accent'
  return 'text-danger'
}

function efficiencyBar(pct: number): string {
  if (pct >= 0.8) return 'bg-success'
  if (pct >= 0.6) return 'bg-accent'
  return 'bg-danger'
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
  const [pending, setPending] = useState(false)
  const [activeGroup, setActiveGroup] = useState(0)
  const [activeSheet, setActiveSheet] = useState(0)

  const allBoards = useMemo(() => activeAssemblies(project).flatMap((a) => a.boards), [project])
  const labels = useMemo(() => partLabels(project.assemblies), [project.assemblies])

  // Optimise on open (at once) and whenever an input or the project changes
  // (debounced, so typing a sheet size does not recompute on every key)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (!showNestingPanel) { wasOpen.current = false; return }
    const delay = wasOpen.current ? RECOMPUTE_DEBOUNCE_MS : 0
    wasOpen.current = true
    setPending(true)
    const timer = setTimeout(() => {
      setResult(allBoards.length > 0 ? nestBoards(allBoards, sheetW, sheetH, kerf, allowRotation, project.customMaterials) : null)
      setPending(false)
    }, delay)
    return () => clearTimeout(timer)
  }, [showNestingPanel, allBoards, sheetW, sheetH, kerf, allowRotation, project.customMaterials])

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

  // A recomputed layout may have fewer groups or sheets: stay on the last one
  const groupIdx = result ? Math.min(activeGroup, Math.max(0, result.groups.length - 1)) : 0
  const group: NestingGroup | undefined = result?.groups[groupIdx]
  const sheetIdx = group ? Math.min(activeSheet, Math.max(0, group.sheets.length - 1)) : 0
  const currentSheet = group?.sheets[sheetIdx]
  const svgContent = currentSheet ? nestingToSvg(currentSheet, 0.12, labels) : null

  const handleExportSvg = () => {
    if (!svgContent || !group) return
    const filename = `${project.name}_nesting_${group.materialName}_${group.thickness}mm_sheet${sheetIdx + 1}.svg`
    const blob = new Blob([svgContent], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog
      title={t('nesting.title')}
      titleId="nesting-panel-title"
      onClose={() => setShowNestingPanel(false)}
      className="h-[85vh] w-[1180px]"
      bodyClassName="flex flex-col"
      footer={<>
        <span className="mr-auto text-xs text-chrome-muted" role="status">
          {pending ? t('dlg.computing') : result
            ? <>{t('cutting.total')}: <span className="font-mono text-chrome-text">{result.totalSheets}</span> {t('nesting.sheets')} · {t('nesting.efficiency')} <span className={`font-mono font-semibold ${efficiencyColor(result.overallEfficiency)}`}>{(result.overallEfficiency * 100).toFixed(1)} %</span></>
            : null}
        </span>
        <Button variant="primary" onClick={handleExportSvg} disabled={!svgContent}>{t('nesting.export')}</Button>
        <Button onClick={() => setShowNestingPanel(false)}>{t('ui.close')}</Button>
      </>}
    >
      {/* Settings */}
      <div className="flex shrink-0 flex-wrap items-end gap-4 border-b border-chrome-border px-4 py-3">
        <div>
          <span className={LABEL_CLASS}>{t('dlg.sheetPreset')}</span>
          <div className="flex gap-1">
            {SHEET_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                aria-pressed={sheetW === p.w && sheetH === p.h}
                onClick={() => { setSheetW(p.w); setSheetH(p.h) }}
                className={segmentClass(sheetW === p.w && sheetH === p.h)}
              >
                {t(`nesting.presets.${p.label}`)}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={!isPreset}
              onClick={handleSetCustom}
              className={segmentClass(!isPreset)}
              title={i18n.language === 'de' ? 'Zuletzt verwendete benutzerdefinierte Größe' : 'Last used custom size'}
            >
              {i18n.language === 'de' ? 'Eigen' : 'Custom'}
            </button>
          </div>
        </div>
        <label>
          <span className={LABEL_CLASS}>{t('nesting.sheetWidth')}</span>
          <input type="number" min={1} value={sheetW} onChange={(e) => handleSheetWChange(Number(e.target.value))}
            className={`${FIELD_CLASS} w-24 text-right`} />
        </label>
        <label>
          <span className={LABEL_CLASS}>{t('nesting.sheetHeight')}</span>
          <input type="number" min={1} value={sheetH} onChange={(e) => handleSheetHChange(Number(e.target.value))}
            className={`${FIELD_CLASS} w-24 text-right`} />
        </label>
        <label>
          <span className={LABEL_CLASS}>{t('nesting.sawKerf')}</span>
          <input type="number" min={0} value={kerf} onChange={(e) => setKerf(Number(e.target.value))}
            className={`${FIELD_CLASS} w-16 text-right`} />
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 pb-1.5 text-xs text-chrome-secondary">
          <input
            type="checkbox"
            checked={allowRotation}
            onChange={(e) => setAllowRotation(e.target.checked)}
            className={CHECK_CLASS}
          />
          {i18n.language === 'de' ? '90° Drehung erlauben' : 'Allow 90° rotation'}
        </label>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left nav: groups + sheets */}
        <nav aria-label={t('nesting.result')} className="w-60 shrink-0 overflow-y-auto border-r border-chrome-border p-3">
          {!result ? (
            <p className="text-xs italic text-chrome-hint">
              {allBoards.length === 0 ? t('nesting.noBoards') : t('dlg.computing')}
            </p>
          ) : result.groups.map((g, gi) => (
            <div key={gi} className="mb-3">
              <button
                type="button"
                aria-pressed={groupIdx === gi}
                onClick={() => { setActiveGroup(gi); setActiveSheet(0) }}
                className={`w-full rounded px-2 py-1.5 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-action ${groupIdx === gi ? 'bg-chrome-surface text-chrome-text' : 'text-chrome-secondary hover:bg-chrome-hover/50'}`}
              >
                <div className="truncate font-medium">
                  {g.materialName}
                  {!g.materialKnown && <span className="text-danger"> ⚠ {t('calc.unknownMaterial')}</span>}
                </div>
                <div className="flex items-center gap-1 text-chrome-muted">
                  <span>{g.thickness} mm · {g.sheets.length} {t(g.sheets.length === 1 ? 'nesting.sheet' : 'nesting.sheets')}</span>
                  <span className={`font-semibold ${efficiencyColor(g.efficiency)}`}>· {(g.efficiency * 100).toFixed(0)} %</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-chrome-deep">
                  <div className={`h-full rounded-full ${efficiencyBar(g.efficiency)}`} style={{ width: `${Math.min(100, g.efficiency * 100)}%` }} />
                </div>
                {g.unplacedCount > 0 && (
                  <div className="mt-0.5 text-danger">⚠ {t('dlg.unplaced', { count: g.unplacedCount })}</div>
                )}
              </button>
              {groupIdx === gi && g.sheets.map((sh, si) => (
                <button
                  key={si}
                  type="button"
                  aria-current={sheetIdx === si ? 'true' : undefined}
                  onClick={() => setActiveSheet(si)}
                  className={`w-full rounded px-3 py-0.5 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-action ${sheetIdx === si ? 'font-medium text-accent' : 'text-chrome-muted hover:text-chrome-text'}`}
                >
                  {t('nesting.sheet')} {si + 1} <span className="text-chrome-hint">({sh.placed.length} {t('cutting.pieces')})</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Sheet preview: the SVG scales to the free space (labels with it) */}
        <div className="flex min-w-0 flex-1 flex-col bg-chrome-deep p-4">
          {group && currentSheet && (
            <p className="mb-2 shrink-0 text-center text-xs text-chrome-muted">
              <span className="text-chrome-text">{group.materialName}</span> · {group.thickness} mm · {t('nesting.sheet')} {sheetIdx + 1}/{group.sheets.length}
              {' · '}{currentSheet.width} × {currentSheet.height} mm
              {' · '}{t('nesting.waste')} <span className="text-danger">{group.wastePercent.toFixed(1)} %</span>
            </p>
          )}
          {svgContent ? (
            <div
              className="min-h-0 flex-1 [&>svg]:h-full [&>svg]:w-full"
              data-testid="nesting-preview"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          ) : (
            <p className="m-auto text-xs italic text-chrome-hint">
              {allBoards.length === 0 ? t('nesting.noBoards') : t('dlg.computing')}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  )
}
