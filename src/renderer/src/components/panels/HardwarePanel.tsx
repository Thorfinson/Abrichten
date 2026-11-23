import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import { Dialog, Button, FIELD_CLASS, TH_CLASS, TD_CLASS } from '../ui/Dialog'
import { useProjectStore } from '../../store/useProjectStore'
import { hardwareItems, getHardwareByCategory, cleanBridgesMm } from '../../data/hardware'
import type { HardwareCategory, HardwareItem } from '../../data/hardware'
import type { CustomHardwareItem } from '../../types/furniture'
import { useDesignHint, useDesignLocked } from '../../hooks/useDesignLocked'

/** Why adding is off in the assembly workspace, else nothing (store/designLock.ts). */
function useLockedTitle(): string | undefined {
  const locked = useDesignLocked()
  const { readOnly } = useDesignHint()
  return locked ? readOnly : undefined
}

const CATEGORIES: HardwareCategory[] = ['hinges', 'slides', 'shelfPins', 'handles', 'camLocks']
type TabType = HardwareCategory | 'custom'
const NUM = `${TD_CLASS} text-right font-mono tabular-nums`

/** Which optional columns the catalogue table shows (one of its items has the value). */
interface HardwareColumns { drilling: boolean; angle: boolean; length: boolean; load: boolean }

function HardwareRow({
  item, lang, canAdd, onAdd, columns
}: {
  item: HardwareItem
  lang: 'de' | 'en'
  canAdd: boolean
  onAdd: () => void
  columns: HardwareColumns
}) {
  const { t } = useTranslation()
  const name = lang === 'de' ? item.name : item.nameEn
  const lockedTitle = useLockedTitle()

  return (
    <tr className="text-xs hover:bg-chrome-surface/40">
      <td className={TD_CLASS}>{name}</td>
      <td className={`${TD_CLASS} text-chrome-muted`}>{item.manufacturer}</td>
      {/* a cell for every column the table shows, empty when this item has no value (rows stay aligned) */}
      {columns.drilling && <td className={NUM}>{item.drillingDiameter !== undefined ? `${item.drillingDiameter}mm` : '—'}</td>}
      {columns.angle && <td className={NUM}>{item.openingAngle !== undefined ? `${item.openingAngle}°` : '—'}</td>}
      {columns.length && <td className={NUM}>{item.length !== undefined ? `${item.length}mm` : '—'}</td>}
      {columns.load && <td className={NUM}>{item.loadCapacityKg !== undefined ? `${item.loadCapacityKg}kg` : '—'}</td>}
      <td className={`${TD_CLASS} whitespace-nowrap`}><CatalogBridges item={item} lang={lang} /></td>
      <td className={`${NUM} font-medium`}>
        {t('cost.currency')}{item.unitPrice.toFixed(2)}
      </td>
      <td className={`${TD_CLASS} text-center`}>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canAdd}
          onClick={onAdd}
          className="font-bold"
          aria-label={`${t('hardware.addToBoard')}: ${name}`}
          title={lockedTitle ?? (canAdd ? t('hardware.addToBoard') : (lang === 'de' ? 'Brett auswählen' : 'Select a board first'))}
        >+</Button>
      </td>
    </tr>
  )
}

const mmText = (n: number, lang: string): string => n.toLocaleString(lang, { maximumFractionDigits: 3 })
const mmNumber = (v: string): number | null => {
  const n = Number(v.trim().replace(',', '.'))
  return v.trim() !== '' && Number.isFinite(n) ? n : null
}

/**
 * The gap a hardware item bridges between its board and the neighbour (from–to mm), edited
 * in place: only such a range lets the statics count a support or a joint across air
 * (services/static-sim). Stored when focus leaves the pair (or on Enter), as one undo step;
 * "to" empty means exactly "from"; both empty removes it; a wrong entry falls back to what
 * is stored; leaving it unchanged stores nothing.
 */
function BridgesField({ range, name, lang, locked, onCommit }: {
  range: [number, number] | undefined
  name: string
  lang: string
  locked: boolean
  onCommit: (range: [number, number] | undefined) => void
}) {
  const { t } = useTranslation()
  const shown = (i: 0 | 1): string => (range ? mmText(range[i], lang) : '')
  const [from, setFrom] = useState(shown(0))
  const [to, setTo] = useState(shown(1))
  const [was, setWas] = useState(range)
  if (was !== range) { setWas(range); setFrom(shown(0)); setTo(shown(1)) }
  const commit = () => {
    if (from === shown(0) && to === shown(1)) return
    if (from.trim() === '' && to.trim() === '') { if (range) onCommit(undefined); return }
    const a = mmNumber(from), b = mmNumber(to.trim() === '' ? from : to)
    const next = a !== null && b !== null ? cleanBridgesMm([a, b]) : undefined
    if (next && (next[0] !== range?.[0] || next[1] !== range?.[1])) onCommit(next)
    else { setFrom(shown(0)); setTo(shown(1)) }
  }
  const field = (value: string, set: (v: string) => void, which: string) => (
    <input
      value={value} onChange={(e) => set(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
      disabled={locked} inputMode="decimal" aria-label={`${t('hardware.bridges')} ${which}: ${name}`} placeholder="—"
      className={`${FIELD_CLASS} w-12 text-right font-mono`}
    />
  )
  return (
    <span
      className="inline-flex items-center gap-1" title={t('hardware.bridgesHint')} data-testid="hardware-bridges"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit() }}
    >
      {field(from, setFrom, t('hardware.bridgesFrom'))}
      <span className="text-chrome-muted">–</span>
      {field(to, setTo, t('hardware.bridgesTo'))}
    </span>
  )
}

/** The range of a project hardware item (its bridgesMm). */
function CustomBridges({ item, lang }: { item: CustomHardwareItem; lang: string }) {
  const locked = useDesignLocked()
  const update = useProjectStore((s) => s.updateCustomHardware)
  return <BridgesField range={item.bridgesMm} name={lang === 'de' ? item.name : item.nameEn} lang={lang} locked={locked}
    onCommit={(bridgesMm) => update(item.id, { bridgesMm })} />
}

/** The range a catalogue item bridges in this project (Project.hardwareBridges). */
function CatalogBridges({ item, lang }: { item: HardwareItem; lang: string }) {
  const locked = useDesignLocked()
  const range = useProjectStore((s) => s.project.hardwareBridges?.[item.id])
  const set = useProjectStore((s) => s.setHardwareBridges)
  return <BridgesField range={range ?? item.bridgesMm} name={lang === 'de' ? item.name : item.nameEn} lang={lang} locked={locked}
    onCommit={(r) => set(item.id, r)} />
}

/** Epic 13c — Custom hardware entry form */
function CustomHardwareSection({
  lang, canAdd, onAdd
}: {
  lang: 'de' | 'en'
  canAdd: boolean
  onAdd: (id: string) => void
}) {
  const customHardwareRaw = useProjectStore((s) => s.project.customHardware)
  const customHardware = customHardwareRaw ?? []
  const addCustomHardware = useProjectStore((s) => s.addCustomHardware)
  const removeCustomHardware = useProjectStore((s) => s.removeCustomHardware)
  const locked = useDesignLocked()
  const { readOnly } = useDesignHint()
  const lockedTitle = locked ? readOnly : undefined

  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [drillingDiam, setDrillingDiam] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [bridgesFrom, setBridgesFrom] = useState('')
  const [bridgesTo, setBridgesTo] = useState('')
  const [category, setCategory] = useState<HardwareCategory>('hinges')
  const [showForm, setShowForm] = useState(false)

  const { t } = useTranslation()

  const handleCreate = () => {
    if (!name.trim()) return
    const from = mmNumber(bridgesFrom), to = mmNumber(bridgesTo === '' ? bridgesFrom : bridgesTo)
    const bridgesMm = from !== null && to !== null ? cleanBridgesMm([from, to]) : undefined
    const item: Omit<CustomHardwareItem, 'id'> = {
      name: name.trim(),
      nameEn: nameEn.trim() || name.trim(),
      category,
      manufacturer: manufacturer.trim() || undefined,
      drillingDiameter: drillingDiam ? Number(drillingDiam) : undefined,
      unitPrice: unitPrice ? Number(unitPrice) : 0,
      ...(bridgesMm ? { bridgesMm } : {})
    }
    addCustomHardware(item)
    setName(''); setNameEn(''); setManufacturer(''); setDrillingDiam(''); setUnitPrice(''); setBridgesFrom(''); setBridgesTo('')
    setShowForm(false)
  }

  return (
    <div className="space-y-2">
      {customHardware.length === 0 && !showForm && (
        <p className="text-xs italic text-chrome-hint">
          {lang === 'de' ? 'Keine eigenen Beschläge.' : 'No custom hardware items.'}
        </p>
      )}

      {customHardware.length > 0 && (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={TH_CLASS}>{t('hardware.name')}</th>
              <th className={TH_CLASS}>{t('hardware.manufacturer')}</th>
              <th className={TH_CLASS} title={t('hardware.bridgesHint')}>{t('hardware.bridges')}</th>
              <th className={`${TH_CLASS} text-right`}>{t('hardware.unitPrice')}</th>
              <th className={`${TH_CLASS} w-8`}></th>
              <th className={`${TH_CLASS} w-8`}></th>
            </tr>
          </thead>
          <tbody>
            {customHardware.map((item) => (
              <tr key={item.id} className="hover:bg-chrome-surface/40">
                <td className={TD_CLASS}>
                  {lang === 'de' ? item.name : item.nameEn}
                </td>
                <td className={`${TD_CLASS} text-chrome-muted`}>{item.manufacturer ?? '—'}</td>
                <td className={`${TD_CLASS} whitespace-nowrap`}><CustomBridges item={item} lang={lang} /></td>
                <td className={NUM}>{t('cost.currency')}{item.unitPrice.toFixed(2)}</td>
                <td className={`${TD_CLASS} text-center`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canAdd}
                    onClick={() => onAdd(item.id)}
                    className="font-bold"
                    title={lockedTitle ?? (canAdd ? t('hardware.addToBoard') : (lang === 'de' ? 'Brett auswählen' : 'Select a board first'))}
                    aria-label={t('hardware.addToBoard')}
                  >+</Button>
                </td>
                <td className={`${TD_CLASS} text-center`}>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={locked}
                    onClick={() => removeCustomHardware(item.id)}
                    aria-label={lang === 'de' ? 'Löschen' : 'Delete'}
                    title={lang === 'de' ? 'Löschen' : 'Delete'}
                  >×</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm ? (
        <div className="space-y-2 rounded border border-action/50 bg-chrome-deep/60 p-3">
          <p className="text-xs font-semibold text-chrome-text">{lang === 'de' ? 'Neuer Beschlag' : 'New Custom Item'}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-[11px] text-chrome-muted">{lang === 'de' ? 'Name (DE)' : 'Name'}</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className={`${FIELD_CLASS} w-full`} />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-chrome-muted">{lang === 'de' ? 'Name (EN)' : 'Name (optional alt.)'}</label>
              <input value={nameEn} onChange={(e) => setNameEn(e.target.value)}
                className={`${FIELD_CLASS} w-full`} />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-chrome-muted">{t('hardware.manufacturer')}</label>
              <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)}
                className={`${FIELD_CLASS} w-full`} />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-chrome-muted">{t('hardware.category')}</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as HardwareCategory)}
                className={`${FIELD_CLASS} w-full`}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{t(`hardware.${c}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-chrome-muted">{t('hardware.drillingDiameter')} (opt.)</label>
              <input type="number" value={drillingDiam} onChange={(e) => setDrillingDiam(e.target.value)}
                className={`${FIELD_CLASS} w-full`} />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-chrome-muted">{t('hardware.unitPrice')}</label>
              <input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)}
                className={`${FIELD_CLASS} w-full`} />
            </div>
            <div className="col-span-2" title={t('hardware.bridgesHint')}>
              <label className="mb-0.5 block text-[11px] text-chrome-muted">{t('hardware.bridges')} (opt.)</label>
              <span className="inline-flex items-center gap-1">
                <input value={bridgesFrom} onChange={(e) => setBridgesFrom(e.target.value)} inputMode="decimal"
                  aria-label={`${t('hardware.bridges')} ${t('hardware.bridgesFrom')}: ${lang === 'de' ? 'Neuer Beschlag' : 'New item'}`} className={`${FIELD_CLASS} w-16 text-right font-mono`} />
                <span className="text-chrome-muted">–</span>
                <input value={bridgesTo} onChange={(e) => setBridgesTo(e.target.value)} inputMode="decimal"
                  aria-label={`${t('hardware.bridges')} ${t('hardware.bridgesTo')}: ${lang === 'de' ? 'Neuer Beschlag' : 'New item'}`} className={`${FIELD_CLASS} w-16 text-right font-mono`} />
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setShowForm(false)}>{t('actions.cancel')}</Button>
            <Button size="sm" variant="primary" onClick={handleCreate} disabled={!name.trim()}>
              {lang === 'de' ? 'Anlegen' : 'Create'}
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowForm(true)} disabled={locked} title={locked ? readOnly : undefined}
          className="w-full rounded border border-dashed border-chrome-divider px-3 py-1.5 text-xs text-chrome-secondary outline-none hover:border-action hover:text-chrome-text focus-visible:ring-2 focus-visible:ring-action disabled:opacity-40 disabled:pointer-events-none">
          + {lang === 'de' ? 'Eigenen Beschlag anlegen' : 'Add Custom Hardware Item'}
        </button>
      )}
    </div>
  )
}

export function HardwarePanel() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const showHardwarePanel = useUIStore((s) => s.showHardwarePanel)
  const setShowHardwarePanel = useUIStore((s) => s.setShowHardwarePanel)
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const selectedAssemblyId = useUIStore((s) => s.selectedAssemblyId)
  const addHardwareToBoard = useProjectStore((s) => s.addHardwareToBoard)
  const [activeCategory, setActiveCategory] = useState<TabType>('hinges')
  // the catalogue reads in the assembly workspace; adding to a part is the design's
  const locked = useDesignLocked()
  const { readOnly } = useDesignHint()

  if (!showHardwarePanel) return null

  const items: HardwareItem[] = activeCategory !== 'custom' ? getHardwareByCategory(activeCategory) : []
  const canAdd = !locked && selectedBoardIds.length === 1 && selectedAssemblyId !== null

  const tabClass = (active: boolean) =>
    `-mb-px rounded-t border-b-2 px-3 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-action ${
      active ? 'border-accent font-medium text-chrome-text' : 'border-transparent text-chrome-muted hover:text-chrome-text'
    }`

  return (
    <Dialog
      title={t('hardware.title')}
      titleId="hardware-title"
      onClose={() => setShowHardwarePanel(false)}
      className="w-[760px]"
      bodyClassName="flex flex-col"
      footer={<>
        <span className="mr-auto text-xs text-chrome-muted">{locked ? readOnly : canAdd ? t('dlg.hardwareTarget') : t('dlg.hardwareSelectBoard')}</span>
        <Button onClick={() => setShowHardwarePanel(false)}>{t('ui.close')}</Button>
      </>}
    >
      {/* Category tabs + Custom tab */}
      <div role="tablist" className="flex shrink-0 flex-wrap gap-1 border-b border-chrome-border px-4 pt-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={activeCategory === cat}
            onClick={() => setActiveCategory(cat)}
            className={tabClass(activeCategory === cat)}
          >
            {t(`hardware.${cat}`)}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={activeCategory === 'custom'}
          onClick={() => setActiveCategory('custom')}
          className={tabClass(activeCategory === 'custom')}
        >
          {lang === 'de' ? 'Eigene' : 'Custom'}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {activeCategory === 'custom' ? (
          <CustomHardwareSection
            lang={lang}
            canAdd={canAdd}
            onAdd={(id) => addHardwareToBoard(selectedAssemblyId!, selectedBoardIds[0], id, 1)}
          />
        ) : items.length === 0 ? (
          <p className="text-xs italic text-chrome-hint">{t('hardware.noItems')}</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={TH_CLASS}>{t('hardware.name')}</th>
                <th className={TH_CLASS}>{t('hardware.manufacturer')}</th>
                {items.some((i) => i.drillingDiameter !== undefined) && (
                  <th className={`${TH_CLASS} text-right`}>{t('hardware.drillingDiameter')}</th>
                )}
                {items.some((i) => i.openingAngle !== undefined) && (
                  <th className={`${TH_CLASS} text-right`}>{t('hardware.openingAngle')}</th>
                )}
                {items.some((i) => i.length !== undefined) && (
                  <th className={`${TH_CLASS} text-right`}>{t('hardware.length')}</th>
                )}
                {items.some((i) => i.loadCapacityKg !== undefined) && (
                  <th className={`${TH_CLASS} text-right`}>{t('hardware.loadCapacityKg')}</th>
                )}
                <th className={TH_CLASS} title={t('hardware.bridgesHint')}>{t('hardware.bridges')}</th>
                <th className={`${TH_CLASS} text-right`}>{t('hardware.unitPrice')}</th>
                <th className={`${TH_CLASS} w-8`}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <HardwareRow
                  key={item.id}
                  item={item}
                  lang={lang}
                  canAdd={canAdd}
                  onAdd={() => addHardwareToBoard(selectedAssemblyId!, selectedBoardIds[0], item.id, 1)}
                  columns={{
                    drilling: items.some((i) => i.drillingDiameter !== undefined),
                    angle: items.some((i) => i.openingAngle !== undefined),
                    length: items.some((i) => i.length !== undefined),
                    load: items.some((i) => i.loadCapacityKg !== undefined)
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

    </Dialog>
  )
}
