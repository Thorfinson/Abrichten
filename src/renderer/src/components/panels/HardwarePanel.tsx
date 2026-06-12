import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import { useProjectStore } from '../../store/useProjectStore'
import { hardwareItems, getHardwareByCategory } from '../../data/hardware'
import type { HardwareCategory, HardwareItem } from '../../data/hardware'
import type { CustomHardwareItem } from '../../types/furniture'

const CATEGORIES: HardwareCategory[] = ['hinges', 'slides', 'shelfPins', 'handles', 'camLocks']
type TabType = HardwareCategory | 'custom'

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
    <tr className="hover:bg-blue-50 text-xs">
      <td className="border border-gray-200 px-2 py-1">{name}</td>
      <td className="border border-gray-200 px-2 py-1 text-gray-500">{item.manufacturer}</td>
      {item.drillingDiameter !== undefined && (
        <td className="border border-gray-200 px-2 py-1 text-right">{item.drillingDiameter}mm</td>
      )}
      {item.openingAngle !== undefined && (
        <td className="border border-gray-200 px-2 py-1 text-right">{item.openingAngle}°</td>
      )}
      {item.length !== undefined && (
        <td className="border border-gray-200 px-2 py-1 text-right">{item.length}mm</td>
      )}
      {item.loadCapacityKg !== undefined && (
        <td className="border border-gray-200 px-2 py-1 text-right">{item.loadCapacityKg}kg</td>
      )}
      <td className="border border-gray-200 px-2 py-1 text-right text-green-700 font-medium">
        {t('cost.currency')}{item.unitPrice.toFixed(2)}
      </td>
      <td className="border border-gray-200 px-2 py-1 text-center">
        <button
          disabled={!canAdd}
          onClick={onAdd}
          className="text-blue-600 hover:text-blue-800 disabled:text-gray-300 disabled:cursor-not-allowed font-bold text-sm leading-none"
          title={canAdd ? t('hardware.addToBoard') : (lang === 'de' ? 'Brett auswählen' : 'Select a board first')}
        >+</button>
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
        <p className="text-xs text-gray-400 italic">
          {lang === 'de' ? 'Keine eigenen Beschläge.' : 'No custom hardware items.'}
        </p>
      )}

      {customHardware.length > 0 && (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-200 px-2 py-1 text-left">{t('hardware.name')}</th>
              <th className="border border-gray-200 px-2 py-1 text-left">{t('hardware.manufacturer')}</th>
              <th className="border border-gray-200 px-2 py-1 text-right">{t('hardware.unitPrice')}</th>
              <th className="border border-gray-200 px-2 py-1 text-center w-8"></th>
              <th className="border border-gray-200 px-2 py-1 text-center w-8"></th>
            </tr>
          </thead>
          <tbody>
            {customHardware.map((item) => (
              <tr key={item.id} className="hover:bg-blue-50">
                <td className="border border-gray-200 px-2 py-1">
                  {lang === 'de' ? item.name : item.nameEn}
                </td>
                <td className="border border-gray-200 px-2 py-1 text-gray-500">{item.manufacturer ?? '—'}</td>
                <td className="border border-gray-200 px-2 py-1 text-right text-green-700">{t('cost.currency')}{item.unitPrice.toFixed(2)}</td>
                <td className="border border-gray-200 px-2 py-1 text-center">
                  <button
                    disabled={!canAdd}
                    onClick={() => onAdd(item.id)}
                    className="text-blue-600 hover:text-blue-800 disabled:text-gray-300 disabled:cursor-not-allowed font-bold text-sm"
                    title={canAdd ? t('hardware.addToBoard') : (lang === 'de' ? 'Brett auswählen' : 'Select a board first')}
                  >+</button>
                </td>
                <td className="border border-gray-200 px-2 py-1 text-center">
                  <button
                    onClick={() => removeCustomHardware(item.id)}
                    className="text-red-400 hover:text-red-600 text-sm"
                  >×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm ? (
        <div className="border border-blue-200 rounded p-3 bg-blue-50 space-y-2">
          <p className="text-xs font-bold text-blue-700">{lang === 'de' ? 'Neuer Beschlag' : 'New Custom Item'}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 block">{lang === 'de' ? 'Name (DE)' : 'Name'}</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded px-1.5 py-0.5" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block">{lang === 'de' ? 'Name (EN)' : 'Name (optional alt.)'}</label>
              <input value={nameEn} onChange={(e) => setNameEn(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded px-1.5 py-0.5" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block">{t('hardware.manufacturer')}</label>
              <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded px-1.5 py-0.5" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block">{t('hardware.category')}</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as HardwareCategory)}
                className="w-full text-xs border border-gray-300 rounded px-1 py-0.5 bg-white">
                {CATEGORIES.map((c) => <option key={c} value={c}>{t(`hardware.${c}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block">{t('hardware.drillingDiameter')} (opt.)</label>
              <input type="number" value={drillingDiam} onChange={(e) => setDrillingDiam(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded px-1.5 py-0.5" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block">{t('hardware.unitPrice')}</label>
              <input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded px-1.5 py-0.5" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!name.trim()}
              className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
              {lang === 'de' ? 'Anlegen' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="text-xs px-3 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="text-xs px-3 py-1.5 rounded border border-dashed border-blue-400 text-blue-600 hover:bg-blue-50 w-full">
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowHardwarePanel(false) }}>
      <div className="bg-white rounded-lg shadow-xl w-[700px] max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">{t('hardware.title')}</h2>
          <button
            onClick={() => setShowHardwarePanel(false)}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Category tabs + Custom tab */}
        <div className="flex border-b border-gray-200 px-4 gap-1 pt-2 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 text-xs rounded-t border-b-2 -mb-px ${
                activeCategory === cat
                  ? 'border-blue-500 text-blue-700 font-medium bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t(`hardware.${cat}`)}
            </button>
          ))}
          <button
            onClick={() => setActiveCategory('custom')}
            className={`px-3 py-1 text-xs rounded-t border-b-2 -mb-px ${
              activeCategory === 'custom'
                ? 'border-blue-500 text-blue-700 font-medium bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {lang === 'de' ? 'Eigene' : 'Custom'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeCategory === 'custom' ? (
            <CustomHardwareSection
              lang={lang}
              canAdd={canAdd}
              onAdd={(id) => addHardwareToBoard(selectedAssemblyId!, selectedBoardIds[0], id, 1)}
            />
          ) : items.length === 0 ? (
            <p className="text-xs text-gray-400 italic">{t('hardware.noItems')}</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-200 px-2 py-1 text-left">{t('hardware.name')}</th>
                  <th className="border border-gray-200 px-2 py-1 text-left">{t('hardware.manufacturer')}</th>
                  {items.some((i) => i.drillingDiameter !== undefined) && (
                    <th className="border border-gray-200 px-2 py-1 text-right">{t('hardware.drillingDiameter')}</th>
                  )}
                  {items.some((i) => i.openingAngle !== undefined) && (
                    <th className="border border-gray-200 px-2 py-1 text-right">{t('hardware.openingAngle')}</th>
                  )}
                  {items.some((i) => i.length !== undefined) && (
                    <th className="border border-gray-200 px-2 py-1 text-right">{t('hardware.length')}</th>
                  )}
                  {items.some((i) => i.loadCapacityKg !== undefined) && (
                    <th className="border border-gray-200 px-2 py-1 text-right">{t('hardware.loadCapacityKg')}</th>
                  )}
                  <th className="border border-gray-200 px-2 py-1 text-right">{t('hardware.unitPrice')}</th>
                  <th className="border border-gray-200 px-2 py-1 text-center w-8"></th>
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

        <div className="p-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={() => setShowHardwarePanel(false)}
            className="text-sm px-4 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {t('actions.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
