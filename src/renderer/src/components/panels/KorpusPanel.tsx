import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { materials, getMaterialById } from '../../data/materials'
import type { MaterialCategory } from '../../types/furniture'

type BackPanelType = 'none' | 'groove' | 'face'

interface KorpusConfig {
  assemblyName: string
  outerWidth: number
  outerHeight: number
  outerDepth: number
  panelThickness: number
  backType: BackPanelType
  withTop: boolean
  withBottom: boolean
  shelves: number
  materialId: string
}

const BACK_THICKNESS = 6   // mm — standard back panel thickness
const GROOVE_DEPTH   = 8   // mm — groove depth cut into panel
const GROOVE_INSET   = 6   // mm — groove inset from back edge

interface KorpusNames {
  sideLeft: string; sideRight: string; bottom: string; top: string; back: string; shelf: string
}

function generateKorpus(cfg: KorpusConfig, names: KorpusNames) {
  const { outerWidth: B, outerHeight: H, outerDepth: T, panelThickness: D } = cfg
  const mat = getMaterialById(cfg.materialId)
  const color = mat?.color ?? '#D4A574'

  // Effective inner depth (shortened by back panel if grooved)
  const innerDepth = cfg.backType === 'groove' ? T - GROOVE_INSET - BACK_THICKNESS : T

  const boards = []
  let nextY = D // start position for first shelf

  // Left side panel
  boards.push({
    name: names.sideLeft,
    width: D, height: H, depth: T,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    materialId: cfg.materialId, color
  })
  // Right side panel
  boards.push({
    name: names.sideRight,
    width: D, height: H, depth: T,
    position: { x: B - D, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    materialId: cfg.materialId, color
  })
  // Bottom panel
  if (cfg.withBottom) {
    boards.push({
      name: names.bottom,
      width: B - 2 * D, height: D, depth: innerDepth,
      position: { x: D, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      materialId: cfg.materialId, color
    })
    nextY = D
  } else {
    nextY = 0
  }
  // Top panel
  if (cfg.withTop) {
    boards.push({
      name: names.top,
      width: B - 2 * D, height: D, depth: innerDepth,
      position: { x: D, y: H - D, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      materialId: cfg.materialId, color
    })
  }
  // Back panel
  if (cfg.backType === 'groove') {
    const bpW = B - 2 * D
    const bpH = cfg.withTop && cfg.withBottom ? H - 2 * D : cfg.withBottom ? H - D : cfg.withTop ? H - D : H
    const bpY = cfg.withBottom ? D : 0
    boards.push({
      name: names.back,
      width: bpW, height: bpH, depth: BACK_THICKNESS,
      position: { x: D, y: bpY, z: T - GROOVE_INSET - BACK_THICKNESS },
      rotation: { x: 0, y: 0, z: 0 },
      materialId: 'mdf',
      color: '#E8E8E8'
    })
  } else if (cfg.backType === 'face') {
    boards.push({
      name: names.back,
      width: B, height: H, depth: BACK_THICKNESS,
      position: { x: 0, y: 0, z: T - BACK_THICKNESS },
      rotation: { x: 0, y: 0, z: 0 },
      materialId: 'mdf',
      color: '#E8E8E8'
    })
  }
  // Fixed shelves (evenly distributed)
  if (cfg.shelves > 0) {
    const topY  = cfg.withTop    ? H - D : H
    const botY  = cfg.withBottom ? D     : 0
    const space = topY - botY - D
    const step  = space / (cfg.shelves + 1)
    for (let i = 0; i < cfg.shelves; i++) {
      boards.push({
        name: `${names.shelf} ${i + 1}`,
        width: B - 2 * D, height: D, depth: innerDepth - 2,
        position: { x: D, y: botY + step * (i + 1), z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        materialId: cfg.materialId, color
      })
    }
  }

  return boards
}

export function KorpusPanel() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const showKorpusPanel = useUIStore((s) => s.showKorpusPanel)
  const setShowKorpusPanel = useUIStore((s) => s.setShowKorpusPanel)
  const addAssembly = useProjectStore((s) => s.addAssembly)
  const addBoard = useProjectStore((s) => s.addBoard)
  const selectBoard = useUIStore((s) => s.selectBoard)

  const [cfg, setCfg] = useState<KorpusConfig>({
    assemblyName: lang === 'de' ? 'Korpus' : 'Cabinet',
    outerWidth: 600,
    outerHeight: 720,
    outerDepth: 570,
    panelThickness: 18,
    backType: 'groove',
    withTop: true,
    withBottom: true,
    shelves: 1,
    materialId: 'spanplatte-melamin'
  })

  if (!showKorpusPanel) return null

  const set = (patch: Partial<KorpusConfig>) => setCfg((c) => ({ ...c, ...patch }))

  const handleGenerate = () => {
    const names: KorpusNames = {
      sideLeft:  t('korpus.sideLeft'),
      sideRight: t('korpus.sideRight'),
      bottom:    t('korpus.bottom'),
      top:       t('korpus.top'),
      back:      t('korpus.back'),
      shelf:     t('korpus.shelf'),
    }
    const boards = generateKorpus(cfg, names)
    const assemblyId = addAssembly(cfg.assemblyName)
    let lastId: string | null = null
    for (const b of boards) {
      lastId = addBoard(assemblyId, b)
    }
    selectBoard(assemblyId, lastId)
    setShowKorpusPanel(false)
  }

  const numInput = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    min = 1
  ) => (
    <div className="flex items-center gap-2 mb-2">
      <label className="text-xs text-gray-600 w-40 shrink-0">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= min) onChange(v) }}
        className="w-24 text-xs border border-gray-300 rounded px-2 py-1 bg-white"
      />
      <span className="text-xs text-gray-400">mm</span>
    </div>
  )

  const panelCategories: MaterialCategory[] = ['solid_wood', 'panel']

  // Preview the board count (names don't matter for the preview)
  const PREVIEW_NAMES: KorpusNames = { sideLeft: '—', sideRight: '—', bottom: '—', top: '—', back: '—', shelf: '—' }
  const preview = generateKorpus(cfg, PREVIEW_NAMES)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowKorpusPanel(false) }}>
      <div className="bg-white rounded-lg shadow-xl w-[480px] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">{t('korpus.title')}</h2>
          <button onClick={() => setShowKorpusPanel(false)} className="text-gray-400 hover:text-gray-700 text-lg">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Assembly name */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 w-40 shrink-0">{t('korpus.assemblyName')}</label>
            <input
              type="text"
              value={cfg.assemblyName}
              onChange={(e) => set({ assemblyName: e.target.value })}
              className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
            />
          </div>

          {/* Outer dimensions */}
          <div className="bg-gray-50 rounded p-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">{lang === 'de' ? 'Außenmaße' : 'Outer Dimensions'}</h3>
            {numInput(t('korpus.outerWidth'),  cfg.outerWidth,  (v) => set({ outerWidth: v }))}
            {numInput(t('korpus.outerHeight'), cfg.outerHeight, (v) => set({ outerHeight: v }))}
            {numInput(t('korpus.outerDepth'),  cfg.outerDepth,  (v) => set({ outerDepth: v }))}
            {numInput(t('korpus.panelThickness'), cfg.panelThickness, (v) => set({ panelThickness: v }), 6)}
          </div>

          {/* Material */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 w-40 shrink-0">{t('board.material')}</label>
            <select
              value={cfg.materialId}
              onChange={(e) => set({ materialId: e.target.value })}
              className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            >
              {panelCategories.map((cat) => (
                <optgroup key={cat} label={t(`materials.${cat}`)}>
                  {materials.filter((m) => m.category === cat).map((mat) => (
                    <option key={mat.id} value={mat.id}>
                      {lang === 'de' ? mat.name : mat.nameEn}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Back panel */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 w-40 shrink-0">{t('korpus.backPanel')}</label>
            <select
              value={cfg.backType}
              onChange={(e) => set({ backType: e.target.value as BackPanelType })}
              className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            >
              <option value="groove">{t('korpus.backGroove')}</option>
              <option value="face">{t('korpus.backFace')}</option>
              <option value="none">{t('korpus.backNone')}</option>
            </select>
          </div>

          {/* Options */}
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.withTop}
                onChange={(e) => set({ withTop: e.target.checked })}
              />
              {t('korpus.withTop')}
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.withBottom}
                onChange={(e) => set({ withBottom: e.target.checked })}
              />
              {t('korpus.withBottom')}
            </label>
          </div>

          {/* Shelves */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 w-40 shrink-0">{t('korpus.shelves')}</label>
            <input
              type="number"
              min={0}
              max={10}
              value={cfg.shelves}
              onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 0) set({ shelves: v }) }}
              className="w-16 text-xs border border-gray-300 rounded px-2 py-1"
            />
          </div>

          {/* Preview */}
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
            <div className="font-medium mb-1">{lang === 'de' ? 'Vorschau' : 'Preview'}: {preview.length} {lang === 'de' ? 'Teile' : 'parts'}</div>
            <div className="text-blue-600 space-y-0.5">
              {preview.map((b, i) => (
                <div key={i}>{b.name}: {b.width}×{b.height}×{b.depth}mm</div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-gray-200 flex gap-2 justify-end">
          <button
            onClick={() => setShowKorpusPanel(false)}
            className="text-sm px-4 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {t('actions.cancel')}
          </button>
          <button
            onClick={handleGenerate}
            className="text-sm px-4 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 font-medium"
          >
            {t('korpus.generate')}
          </button>
        </div>
      </div>
    </div>
  )
}
