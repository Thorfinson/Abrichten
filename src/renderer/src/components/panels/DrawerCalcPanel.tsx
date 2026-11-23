import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import { useProjectStore } from '../../store/useProjectStore'
import { getMaterialById } from '../../data/materials'
import { drawerBoxParts, DRAWER_WALL_MM, DRAWER_BOTTOM_MM } from '../../utils/geometry'
import { boardBox } from '../../utils/snap'
import { beginDragHistory, endDragHistory } from '../../utils/dragHistory'
import type { Vec3 } from '../../types/furniture'
import { useDesignLocked } from '../../hooks/useDesignLocked'

interface SlideSystem {
  id: string
  name: string
  manufacturer: string
  sideClearancePerSide: number   // mm each side
  heightOptions: { label: string; h: number }[]
  heightClearanceAbove: number   // mm above drawer box
}

const SLIDE_SYSTEMS: SlideSystem[] = [
  {
    id: 'blum-tandem',
    name: 'Blum TANDEM / Legrabox',
    manufacturer: 'Blum',
    sideClearancePerSide: 12.5,
    heightClearanceAbove: 15,
    heightOptions: [
      { label: 'M – 83mm', h: 83 },
      { label: 'C – 128mm', h: 128 },
      { label: 'D – 193mm', h: 193 },
      { label: 'F – 250mm', h: 250 }
    ]
  },
  {
    id: 'grass-nova-pro',
    name: 'Grass Nova Pro / Vionaro',
    manufacturer: 'Grass',
    sideClearancePerSide: 17,
    heightClearanceAbove: 12,
    heightOptions: [
      { label: '68mm', h: 68 },
      { label: '85mm', h: 85 },
      { label: '112mm', h: 112 },
      { label: '176mm', h: 176 }
    ]
  },
  {
    id: 'hettich-arcitec',
    name: 'Hettich ArciTech',
    manufacturer: 'Hettich',
    sideClearancePerSide: 12.5,
    heightClearanceAbove: 15,
    heightOptions: [
      { label: '95mm', h: 95 },
      { label: '118mm', h: 118 },
      { label: '176mm', h: 176 },
      { label: '218mm', h: 218 }
    ]
  },
  {
    id: 'generic-undermount',
    name: 'Generic Undermount',
    manufacturer: 'Generic',
    sideClearancePerSide: 10,
    heightClearanceAbove: 10,
    heightOptions: [
      { label: '80mm', h: 80 },
      { label: '100mm', h: 100 },
      { label: '150mm', h: 150 }
    ]
  }
]

/** Nominal slide lengths (mm) = drawer box depth. 500 mm fits the common 560–580 mm deep base unit. */
const SLIDE_LENGTHS = [270, 300, 350, 400, 450, 500, 550, 600]
const DEFAULT_SLIDE_LENGTH = 500
/** Generated drawers are birch plywood; the gap to the selection they are placed next to */
const DRAWER_MATERIAL_ID = 'multiplex-birke'
const PLACEMENT_GAP_MM = 50

const INPUT = 'w-24 text-xs bg-chrome-deep border border-chrome-border text-chrome-text rounded px-2 py-1 outline-none focus:border-action'
const SELECT = 'flex-1 min-w-0 text-xs bg-chrome-deep border border-chrome-border text-chrome-text rounded px-2 py-1 outline-none focus:border-action'
const COPY_BTN = 'text-[10px] px-2 py-0.5 rounded bg-chrome-surface text-chrome-secondary hover:bg-chrome-hover'

/** Where a new drawer goes: right of the selection's whole group (so it never lands
 *  inside the cabinet), level with the selection; at the origin without a selection. */
function placementOrigin(): Vec3 {
  const { selectedBoardIds, selectedAssemblyId } = useUIStore.getState()
  const assemblies = useProjectStore.getState().project.assemblies
  const selected = assemblies.flatMap((a) => a.boards).filter((b) => selectedBoardIds.includes(b.id))
  if (selected.length === 0) return { x: 0, y: 0, z: 0 }
  const group = (assemblies.find((a) => a.id === selectedAssemblyId)?.boards ?? selected).map(boardBox)
  const sel = selected.map(boardBox)
  return {
    x: Math.max(...group.map((b) => b.max.x)) + PLACEMENT_GAP_MM,
    y: Math.min(...sel.map((b) => b.min.y)),
    z: Math.min(...sel.map((b) => b.min.z))
  }
}

export function DrawerCalcPanel() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const showDrawerCalcPanel = useUIStore((s) => s.showDrawerCalcPanel)
  const setShowDrawerCalcPanel = useUIStore((s) => s.setShowDrawerCalcPanel)

  const [openingW, setOpeningW] = useState(500)
  const [openingH, setOpeningH] = useState(150)
  const [slideId, setSlideId] = useState('blum-tandem')
  const [slideLength, setSlideLength] = useState(DEFAULT_SLIDE_LENGTH)

  // a tool of the design: not in the assembly workspace (store/designLock.ts)
  const locked = useDesignLocked()
  if (locked || !showDrawerCalcPanel) return null

  const close = () => setShowDrawerCalcPanel(false)
  const sys = SLIDE_SYSTEMS.find((s) => s.id === slideId) ?? SLIDE_SYSTEMS[0]

  const boxWidth = openingW - 2 * sys.sideClearancePerSide
  const maxBoxHeight = openingH - sys.heightClearanceAbove

  // Find all height options that fit
  const fittingHeights = sys.heightOptions.filter((o) => o.h <= maxBoxHeight)
  const recommendedH = fittingHeights.at(-1) // largest that fits

  const boxWidthMm = Math.round(boxWidth * 10) / 10
  const canCreate = !!recommendedH && drawerBoxParts(boxWidthMm, recommendedH.h, slideLength, { x: 0, y: 0, z: 0 }) !== null

  const copy = (text: string) => navigator.clipboard?.writeText(text)

  /** The drawer box as a new assembly — one undo step — with its first part selected. */
  const createDrawer = () => {
    if (!recommendedH) return
    const parts = drawerBoxParts(boxWidthMm, recommendedH.h, slideLength, placementOrigin())
    if (!parts) return
    const store = useProjectStore.getState()
    const material = getMaterialById(DRAWER_MATERIAL_ID, store.project.customMaterials)
    beginDragHistory()   // groups the two store calls into one undo step
    let assemblyId = ''
    let ids: string[] = []
    try {
      assemblyId = store.addAssembly(t('func.drawerAssembly', { w: boxWidthMm, h: recommendedH.h }))
      ids = store.addBoardsBatch(assemblyId, parts.map((p) => ({
        name: t(`func.drawer_${p.key}`),
        width: p.width,
        height: p.height,
        depth: p.depth,
        position: p.position,
        rotation: { x: 0, y: 0, z: 0 },
        materialId: DRAWER_MATERIAL_ID,
        color: material?.color ?? '#E8D5B7',
        grainDirection: p.grainDirection
      })))
    } finally {
      endDragHistory()
    }
    const ui = useUIStore.getState()
    ui.selectBoard(assemblyId, ids[0] ?? null)
    ui.setExportStatus(t('func.drawerCreated', { count: ids.length, w: boxWidthMm, h: recommendedH.h, d: slideLength }))
    close()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="drawer-calc-title" className="bg-chrome-bg text-chrome-text border border-chrome-border rounded-lg shadow-2xl w-[460px] max-w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-chrome-border flex items-center justify-between">
          <h2 id="drawer-calc-title" className="text-sm font-bold">{t('drawer.title')}</h2>
          <button onClick={close} aria-label={t('calc.close')} className="text-chrome-muted hover:text-chrome-text text-lg">×</button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Inputs */}
          <div className="bg-chrome-deep/60 border border-chrome-border rounded p-3 space-y-2">
            <h3 className="text-xs font-bold text-chrome-muted uppercase mb-1">
              {lang === 'de' ? 'Lichte Öffnung' : 'Clear Opening'}
            </h3>
            <div className="flex items-center gap-2">
              <label className="text-xs text-chrome-secondary w-32">{t('drawer.openingWidth')}</label>
              <input
                type="number"
                value={openingW}
                onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) setOpeningW(v) }}
                className={INPUT}
              />
              <span className="text-xs text-chrome-muted">mm</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-chrome-secondary w-32">{t('drawer.openingHeight')}</label>
              <input
                type="number"
                value={openingH}
                onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) setOpeningH(v) }}
                className={INPUT}
              />
              <span className="text-xs text-chrome-muted">mm</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-chrome-secondary w-32">{t('drawer.slideSystem')}</label>
              <select value={slideId} onChange={(e) => setSlideId(e.target.value)} className={SELECT}>
                {SLIDE_SYSTEMS.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-chrome-secondary w-32" htmlFor="drawer-slide-length">{t('func.slideLength')}</label>
              <select
                id="drawer-slide-length"
                value={slideLength}
                onChange={(e) => setSlideLength(Number(e.target.value))}
                className={SELECT}
              >
                {SLIDE_LENGTHS.map((l) => (
                  <option key={l} value={l}>{l} mm</option>
                ))}
              </select>
            </div>
          </div>

          {/* Results */}
          <div className="border border-chrome-border rounded p-3 space-y-2">
            <h3 className="text-xs font-bold text-info uppercase mb-1">
              {lang === 'de' ? 'Schubladenkasten' : 'Drawer Box'}
            </h3>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-chrome-secondary">{t('drawer.boxWidth')}: </span>
                <span className="text-sm font-bold text-info-text">{boxWidth.toFixed(1)} mm</span>
                <span className="text-xs text-chrome-muted ml-1">
                  ({openingW} − 2×{sys.sideClearancePerSide})
                </span>
              </div>
              <button onClick={() => copy(`${boxWidth.toFixed(1)}`)} className={COPY_BTN}>
                {lang === 'de' ? 'Kopieren' : 'Copy'}
              </button>
            </div>

            {recommendedH ? (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-chrome-secondary">{t('drawer.boxHeight')}: </span>
                  <span className="text-sm font-bold text-info-text">{recommendedH.h} mm</span>
                  <span className="text-xs text-chrome-muted ml-1">({t('drawer.heightClass')}: {recommendedH.label})</span>
                </div>
                <button onClick={() => copy(`${recommendedH.h}`)} className={COPY_BTN}>
                  {lang === 'de' ? 'Kopieren' : 'Copy'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-danger">
                {lang === 'de'
                  ? `Öffnungshöhe zu gering für ${sys.name}. Min. ${sys.heightOptions[0]?.h + sys.heightClearanceAbove}mm benötigt.`
                  : `Opening too low for ${sys.name}. Min. ${sys.heightOptions[0]?.h + sys.heightClearanceAbove}mm required.`}
              </p>
            )}

            <div className="text-xs text-chrome-muted mt-1 pt-1 border-t border-chrome-border">
              {lang === 'de' ? 'Seitenspiel' : 'Side clearance'}: {sys.sideClearancePerSide}mm {lang === 'de' ? 'pro Seite' : 'per side'} ·{' '}
              {lang === 'de' ? 'Höhenspiel' : 'Height clearance'}: {sys.heightClearanceAbove}mm
            </div>
          </div>

          {/* All height options */}
          <div>
            <h3 className="text-xs font-bold text-chrome-muted uppercase mb-1">
              {lang === 'de' ? 'Alle Höhenklassen' : 'All Height Classes'}
            </h3>
            <div className="grid grid-cols-2 gap-1">
              {sys.heightOptions.map((o) => {
                const fits = o.h <= maxBoxHeight
                return (
                  <div
                    key={o.label}
                    className={`text-xs px-2 py-1 rounded border ${
                      fits
                        ? o === recommendedH
                          ? 'bg-action text-action-text border-action font-bold'
                          : 'bg-success-dim/50 text-success-text border-success/40'
                        : 'bg-danger-dim/30 text-danger-text/60 border-danger/30 line-through'
                    }`}
                  >
                    {o.label}
                    {fits && <span className="ml-1 opacity-70">✓</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* What "create" builds */}
          <p className="text-[11px] text-chrome-muted">
            {t('func.drawerBuildNote', { wall: DRAWER_WALL_MM, bottom: DRAWER_BOTTOM_MM, d: slideLength })}
          </p>
        </div>

        <div className="p-3 border-t border-chrome-border flex justify-end gap-2">
          <button
            onClick={close}
            className="text-sm px-4 py-1.5 rounded bg-chrome-surface text-chrome-text hover:bg-chrome-hover"
          >
            {t('ui.close')}
          </button>
          <button
            onClick={createDrawer}
            disabled={!canCreate}
            className="text-sm px-4 py-1.5 rounded bg-action text-action-text hover:bg-action-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('func.drawerCreate')}
          </button>
        </div>
      </div>
    </div>
  )
}
