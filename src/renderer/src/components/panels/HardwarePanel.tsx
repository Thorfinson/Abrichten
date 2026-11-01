import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import { Dialog, Button, FIELD_CLASS, TH_CLASS, TD_CLASS } from '../ui/Dialog'
import { useProjectStore } from '../../store/useProjectStore'
import { hardwareItems, getHardwareByCategory } from '../../data/hardware'
import type { HardwareCategory, HardwareItem } from '../../data/hardware'
import type { CustomHardwareItem } from '../../types/furniture'

const CATEGORIES: HardwareCategory[] = ['hinges', 'slides', 'shelfPins', 'handles', 'camLocks']
type TabType = HardwareCategory | 'custom'
const NUM = `${TD_CLASS} text-right font-mono tabular-nums`

function HardwareRow({
  item, lang, canAdd, onAdd
}: {
  item: HardwareItem
  lang: 'de' | 'en'
  canAdd: boolean
  onAdd: () => void
}) {
  const { t } = useTranslation()
  const name = lang === 'de' ? item.name : item.nameEn

  return (
    <tr className="text-xs hover:bg-chrome-surface/40">
      <td className={TD_CLASS}>{name}</td>
      <td className={`${TD_CLASS} text-chrome-muted`}>{item.manufacturer}</td>
      {item.drillingDiameter !== undefined && (
        <td className={NUM}>{item.drillingDiameter}mm</td>
      )}
      {item.openingAngle !== undefined && (
        <td className={NUM}>{item.openingAngle}°</td>
      )}
      {item.length !== undefined && (
        <td className={NUM}>{item.length}mm</td>
      )}
      {item.loadCapacityKg !== undefined && (
        <td className={NUM}>{item.loadCapacityKg}kg</td>
      )}
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
          title={canAdd ? t('hardware.addToBoard') : (lang === 'de' ? 'Brett auswählen' : 'Select a board first')}
        >+</Button>
      </td>
    </tr>
  )
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

  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [drillingDiam, setDrillingDiam] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [category, setCategory] = useState<HardwareCategory>('hinges')
  const [showForm, setShowForm] = useState(false)

  const { t } = useTranslation()

  const handleCreate = () => {
    if (!name.trim()) return
    const item: Omit<CustomHardwareItem, 'id'> = {
      name: name.trim(),
      nameEn: nameEn.trim() || name.trim(),
      category,
      manufacturer: manufacturer.trim() || undefined,
      drillingDiameter: drillingDiam ? Number(drillingDiam) : undefined,
      unitPrice: unitPrice ? Number(unitPrice) : 0
    }
    addCustomHardware(item)
    setName(''); setNameEn(''); setManufacturer(''); setDrillingDiam(''); setUnitPrice('')
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
                <td className={NUM}>{t('cost.currency')}{item.unitPrice.toFixed(2)}</td>
                <td className={`${TD_CLASS} text-center`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canAdd}
                    onClick={() => onAdd(item.id)}
                    className="font-bold"
                    title={canAdd ? t('hardware.addToBoard') : (lang === 'de' ? 'Brett auswählen' : 'Select a board first')}
                    aria-label={t('hardware.addToBoard')}
                  >+</Button>
                </td>
                <td className={`${TD_CLASS} text-center`}>
                  <Button
                    variant="danger"
                    size="sm"
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
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setShowForm(false)}>{t('actions.cancel')}</Button>
            <Button size="sm" variant="primary" onClick={handleCreate} disabled={!name.trim()}>
              {lang === 'de' ? 'Anlegen' : 'Create'}
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowForm(true)}
          className="w-full rounded border border-dashed border-chrome-divider px-3 py-1.5 text-xs text-chrome-secondary outline-none hover:border-action hover:text-chrome-text focus-visible:ring-2 focus-visible:ring-action">
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

  if (!showHardwarePanel) return null

  const items: HardwareItem[] = activeCategory !== 'custom' ? getHardwareByCategory(activeCategory) : []
  const canAdd = selectedBoardIds.length === 1 && selectedAssemblyId !== null

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
        <span className="mr-auto text-xs text-chrome-muted">{canAdd ? t('dlg.hardwareTarget') : t('dlg.hardwareSelectBoard')}</span>
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
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

    </Dialog>
  )
}
