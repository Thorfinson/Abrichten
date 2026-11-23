import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { materials, getMaterialById } from '../../data/materials'
import { beginDragHistory, endDragHistory } from '../../utils/dragHistory'
import { computeJointPosition } from '../../utils/geometry'
import { cuttingDims } from '../../utils/cuttingDims'
import { Dialog, Button, FIELD_CLASS, SECTION_LABEL_CLASS, TD_CLASS, CHECK_CLASS } from '../ui/Dialog'
import type { Board, MaterialCategory } from '../../types/furniture'
import { useDesignLocked } from '../../hooks/useDesignLocked'

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

interface KorpusParts {
  boards: Omit<Board, 'id'>[]
  /** [back, other] board indices: the back sits in a groove of the other part */
  dados: [number, number][]
}

/**
 * Carcass parts in world axes. The parts are laid out from z = 0 as the front and
 * then mirrored, so the result stands like every project: back at z = 0 (wall side),
 * front towards +z, where the front view and the 3D camera look from. Back types:
 *  - face:   back B × H screwed onto the back edges; the carcass is T − back deep
 *  - groove: back reaches GROOVE_DEPTH into grooves of sides, top and bottom
 *            (all full depth), GROOVE_INSET from the back edge; shelves stop in front
 */
function generateKorpus(cfg: KorpusConfig, names: KorpusNames): KorpusParts {
  const { outerWidth: B, outerHeight: H, outerDepth: T, panelThickness: D } = cfg
  const mat = getMaterialById(cfg.materialId)
  const color = mat?.color ?? '#D4A574'
  const grooved = cfg.backType === 'groove'
  // a groove never takes more than half the panel
  const groove = Math.min(GROOVE_DEPTH, D / 2)
  const backZ = grooved ? T - GROOVE_INSET - BACK_THICKNESS : T - BACK_THICKNESS

  // Carcass depth: a face-mounted back adds its thickness behind the carcass
  const carcassDepth = cfg.backType === 'face' ? T - BACK_THICKNESS : T
  // Shelves stop 2 mm short of the back (or the back edge)
  const shelfDepth = (cfg.backType === 'none' ? T : backZ) - 2

  const boards: Omit<Board, 'id'>[] = []
  const dados: [number, number][] = []
  const part = (name: string, width: number, height: number, depth: number, x: number, y: number, z: number) => {
    boards.push({ name, width, height, depth, position: { x, y, z }, rotation: { x: 0, y: 0, z: 0 }, materialId: cfg.materialId, color })
    return boards.length - 1
  }

  const grooveParts = [
    part(names.sideLeft,  D, H, carcassDepth, 0, 0, 0),
    part(names.sideRight, D, H, carcassDepth, B - D, 0, 0)
  ]
  if (cfg.withBottom) grooveParts.push(part(names.bottom, B - 2 * D, D, carcassDepth, D, 0, 0))
  if (cfg.withTop)    grooveParts.push(part(names.top,    B - 2 * D, D, carcassDepth, D, H - D, 0))

  // Back panel
  if (grooved) {
    const bpY = cfg.withBottom ? D - groove : 0
    const bpTop = cfg.withTop ? H - D + groove : H
    boards.push({
      name: names.back,
      width: B - 2 * D + 2 * groove, height: bpTop - bpY, depth: BACK_THICKNESS,
      position: { x: D - groove, y: bpY, z: backZ },
      rotation: { x: 0, y: 0, z: 0 },
      materialId: 'mdf',
      color: '#E8E8E8'
    })
    const back = boards.length - 1
    for (const other of grooveParts) dados.push([back, other])
  } else if (cfg.backType === 'face') {
    boards.push({
      name: names.back,
      width: B, height: H, depth: BACK_THICKNESS,
      position: { x: 0, y: 0, z: backZ },
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
      part(`${names.shelf} ${i + 1}`, B - 2 * D, D, shelfDepth, D, botY + step * (i + 1), 0)
    }
  }

  // front towards +z: mirror the depth axis
  const facingFront = boards.map((b) => ({ ...b, position: { ...b.position, z: T - b.position.z - b.depth } }))
  return { boards: facingFront, dados }
}

export function KorpusPanel() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const showKorpusPanel = useUIStore((s) => s.showKorpusPanel)
  const setShowKorpusPanel = useUIStore((s) => s.setShowKorpusPanel)
  const addAssembly = useProjectStore((s) => s.addAssembly)
  const addBoardsBatch = useProjectStore((s) => s.addBoardsBatch)
  const addJoint = useProjectStore((s) => s.addJoint)
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
    materialId: 'spanplatte'
  })

  // a tool of the design: not in the assembly workspace (store/designLock.ts)
  const locked = useDesignLocked()
  if (locked || !showKorpusPanel) return null

  const set = (patch: Partial<KorpusConfig>) => setCfg((c) => ({ ...c, ...patch }))

  const names: KorpusNames = {
    sideLeft:  t('korpus.sideLeft'),
    sideRight: t('korpus.sideRight'),
    bottom:    t('korpus.bottom'),
    top:       t('korpus.top'),
    back:      t('korpus.back'),
    shelf:     t('dlg.shelf'),   // korpus.shelf says "Boden", the same as the bottom
  }

  const handleGenerate = () => {
    const { boards, dados } = generateKorpus(cfg, names)
    // one undo step for the assembly, its boards and joints
    beginDragHistory()
    try {
      const assemblyId = addAssembly(cfg.assemblyName)
      const ids = addBoardsBatch(assemblyId, boards)
      // the back sits in grooves: dado joints mark that overlap as intended
      for (const [back, other] of dados) {
        addJoint(assemblyId, {
          type: 'dado',
          boardA: ids[back],
          boardB: ids[other],
          position: computeJointPosition({ ...boards[back], id: ids[back] }, { ...boards[other], id: ids[other] }),
          fasteners: []
        })
      }
      selectBoard(assemblyId, ids[ids.length - 1] ?? null)
    } finally {
      endDragHistory()
    }
    setShowKorpusPanel(false)
  }

  const rowClass = 'flex items-center gap-2'
  const labelClass = 'w-40 shrink-0 text-xs text-chrome-secondary'

  const numInput = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    min = 1
  ) => (
    <label className={rowClass}>
      <span className={labelClass}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= min) onChange(v) }}
        className={`${FIELD_CLASS} w-24 text-right`}
      />
    </label>
  )

  const panelCategories: MaterialCategory[] = ['solid_wood', 'panel']

  // Preview: the parts with their translated names, as the cutting list will show them
  const preview = generateKorpus(cfg, names).boards

  return (
    <Dialog
      title={t('korpus.title')}
      titleId="korpus-panel-title"
      onClose={() => setShowKorpusPanel(false)}
      className="w-[520px]"
      footer={<>
        <Button onClick={() => setShowKorpusPanel(false)}>{t('actions.cancel')}</Button>
        <Button variant="primary" onClick={handleGenerate}>{t('korpus.generate')}</Button>
      </>}
    >
      <div className="space-y-4">
        {/* Assembly name */}
        <label className={rowClass}>
          <span className={labelClass}>{t('korpus.assemblyName')}</span>
          <input
            type="text"
            value={cfg.assemblyName}
            onChange={(e) => set({ assemblyName: e.target.value })}
            className={`${FIELD_CLASS} flex-1`}
          />
        </label>

        {/* Outer dimensions */}
        <section className="space-y-2">
          <h3 className={SECTION_LABEL_CLASS}>{lang === 'de' ? 'Außenmaße' : 'Outer Dimensions'}</h3>
          {numInput(t('korpus.outerWidth'),  cfg.outerWidth,  (v) => set({ outerWidth: v }))}
          {numInput(t('korpus.outerHeight'), cfg.outerHeight, (v) => set({ outerHeight: v }))}
          {numInput(t('korpus.outerDepth'),  cfg.outerDepth,  (v) => set({ outerDepth: v }))}
          {numInput(t('korpus.panelThickness'), cfg.panelThickness, (v) => set({ panelThickness: v }), 6)}
        </section>

        <section className="space-y-2">
          <h3 className={SECTION_LABEL_CLASS}>{t('dlg.construction')}</h3>
          {/* Material */}
          <label className={rowClass}>
            <span className={labelClass}>{t('board.material')}</span>
            <select
              value={cfg.materialId}
              onChange={(e) => set({ materialId: e.target.value })}
              className={`${FIELD_CLASS} flex-1`}
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
          </label>

          {/* Back panel */}
          <label className={rowClass}>
            <span className={labelClass}>{t('korpus.backPanel')}</span>
            <select
              value={cfg.backType}
              onChange={(e) => set({ backType: e.target.value as BackPanelType })}
              className={`${FIELD_CLASS} flex-1`}
            >
              <option value="groove">{t('korpus.backGroove')}</option>
              <option value="face">{t('korpus.backFace')}</option>
              <option value="none">{t('korpus.backNone')}</option>
            </select>
          </label>

          {/* Shelves */}
          <label className={rowClass}>
            <span className={labelClass}>{t('dlg.shelvesCount')}</span>
            <input
              type="number"
              min={0}
              max={10}
              value={cfg.shelves}
              onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 0) set({ shelves: v }) }}
              className={`${FIELD_CLASS} w-16 text-right`}
            />
          </label>

          {/* Options */}
          <div className="flex gap-5 pl-[10.5rem]">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-chrome-secondary">
              <input type="checkbox" checked={cfg.withTop} onChange={(e) => set({ withTop: e.target.checked })} className={CHECK_CLASS} />
              {t('korpus.withTop')}
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-chrome-secondary">
              <input type="checkbox" checked={cfg.withBottom} onChange={(e) => set({ withBottom: e.target.checked })} className={CHECK_CLASS} />
              {t('korpus.withBottom')}
            </label>
          </div>
        </section>

        {/* Preview */}
        <section aria-label={lang === 'de' ? 'Vorschau' : 'Preview'}>
          <h3 className={`${SECTION_LABEL_CLASS} mb-1.5`}>
            {lang === 'de' ? 'Vorschau' : 'Preview'}: {preview.length} {lang === 'de' ? 'Teile' : 'parts'}
            <span className="ml-2 font-normal normal-case tracking-normal">({t('dlg.length')} × {t('dlg.width')} × {t('dlg.thickness')})</span>
          </h3>
          <table className="w-full border-collapse text-xs">
            <tbody>
              {preview.map((b, i) => {
                const d = cuttingDims(b)
                return (
                  <tr key={i}>
                    {/* part-name-ok: a preview of parts not created yet, they have no label */}
                    <td className={TD_CLASS}>{b.name}</td>
                    <td className={`${TD_CLASS} text-right font-mono tabular-nums text-chrome-secondary`}>
                      {d.length} × {d.width} × {d.thickness}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>
    </Dialog>
  )
}
