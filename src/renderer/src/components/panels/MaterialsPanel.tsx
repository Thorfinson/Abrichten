import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { materials as builtinMaterials } from '../../data/materials'
import type { Material, MaterialCategory } from '../../types/furniture'

const CATEGORY_LABELS: Record<MaterialCategory, { de: string; en: string }> = {
  solid_wood: { de: 'Massivholz',  en: 'Solid Wood' },
  panel:      { de: 'Platte',      en: 'Panel'      },
  stone:      { de: 'Stein',       en: 'Stone'      },
  glass:      { de: 'Glas',        en: 'Glass'      },
  metal:      { de: 'Metall',      en: 'Metal'      }
}

const CATEGORIES: MaterialCategory[] = ['solid_wood', 'panel', 'stone', 'glass', 'metal']

const DEFAULT_NEW: Omit<Material, 'id'> = {
  name: '',
  nameEn: '',
  category: 'panel',
  density: 750,
  eModul: 10000,
  bendingStrength: 80,
  defaultThickness: [18, 22, 25],
  color: '#C8A882',
  grain: false
}

interface FormState {
  name: string
  nameEn: string
  category: MaterialCategory
  density: string
  eModul: string
  bendingStrength: string
  thicknesses: string
  color: string
  grain: boolean
}

function formDefaults(mat?: Partial<Material>): FormState {
  return {
    name:            mat?.name ?? '',
    nameEn:          mat?.nameEn ?? '',
    category:        mat?.category ?? 'panel',
    density:         String(mat?.density ?? 750),
    eModul:          String(mat?.eModul ?? 10000),
    bendingStrength: String(mat?.bendingStrength ?? 80),
    thicknesses:     (mat?.defaultThickness ?? [18, 22, 25]).join(', '),
    color:           mat?.color ?? '#C8A882',
    grain:           mat?.grain ?? false
  }
}

function parseThicknesses(raw: string): number[] {
  return raw.split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n) && n > 0)
}

export function MaterialsPanel() {
  const { i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'

  const showMaterialsPanel = useUIStore((s) => s.showMaterialsPanel)
  const setShowMaterialsPanel = useUIStore((s) => s.setShowMaterialsPanel)

  const customMaterialsRaw = useProjectStore((s) => s.project.customMaterials)
  const customMaterials = customMaterialsRaw ?? []
  const addCustomMaterial = useProjectStore((s) => s.addCustomMaterial)
  const removeCustomMaterial = useProjectStore((s) => s.removeCustomMaterial)
  const updateCustomMaterial = useProjectStore((s) => s.updateCustomMaterial)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState<FormState>(formDefaults())
  const [error, setError] = useState('')

  if (!showMaterialsPanel) return null

  const handleClose = () => {
    setShowMaterialsPanel(false)
    setEditingId(null)
    setIsCreating(false)
    setError('')
  }

  const startCreate = () => {
    setForm(formDefaults())
    setIsCreating(true)
    setEditingId(null)
    setError('')
  }

  const startEdit = (mat: Material) => {
    setForm(formDefaults(mat))
    setEditingId(mat.id)
    setIsCreating(false)
    setError('')
  }

  const cancelForm = () => {
    setIsCreating(false)
    setEditingId(null)
    setError('')
  }

  const validateForm = (): boolean => {
    if (!form.name.trim()) { setError(lang === 'de' ? 'Name erforderlich' : 'Name required'); return false }
    if (parseThicknesses(form.thicknesses).length === 0) { setError(lang === 'de' ? 'Mind. eine Dicke' : 'At least one thickness'); return false }
    setError('')
    return true
  }

  const buildMaterial = (): Omit<Material, 'id'> => ({
    name:            form.name.trim(),
    nameEn:          form.nameEn.trim() || form.name.trim(),
    category:        form.category,
    density:         parseFloat(form.density) || 750,
    eModul:          parseFloat(form.eModul) || 10000,
    bendingStrength: parseFloat(form.bendingStrength) || 80,
    defaultThickness: parseThicknesses(form.thicknesses),
    color:           form.color,
    grain:           form.grain
  })

  const handleCreate = () => {
    if (!validateForm()) return
    addCustomMaterial(buildMaterial())
    setIsCreating(false)
    setError('')
  }

  const handleUpdate = () => {
    if (!validateForm() || !editingId) return
    updateCustomMaterial(editingId, buildMaterial())
    setEditingId(null)
    setError('')
  }

  const setF = (key: keyof FormState, val: any) => setForm((f) => ({ ...f, [key]: val }))

  const MaterialForm = (
    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">{lang === 'de' ? 'Name (DE)' : 'Name'}</label>
          <input
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            value={form.name}
            onChange={(e) => setF('name', e.target.value)}
            placeholder={lang === 'de' ? 'z.B. Spanplatte Spezial' : 'e.g. Special Particleboard'}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">Name (EN)</label>
          <input
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            value={form.nameEn}
            onChange={(e) => setF('nameEn', e.target.value)}
            placeholder="e.g. Special Particleboard"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">{lang === 'de' ? 'Kategorie' : 'Category'}</label>
          <select
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            value={form.category}
            onChange={(e) => setF('category', e.target.value as MaterialCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c][lang]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">{lang === 'de' ? 'Farbe' : 'Color'}</label>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={form.color}
              onChange={(e) => setF('color', e.target.value)}
              className="w-8 h-7 border border-gray-300 rounded cursor-pointer p-0.5"
            />
            <input
              className="flex-1 text-xs border border-gray-300 rounded px-1 py-1 bg-white font-mono"
              value={form.color}
              onChange={(e) => setF('color', e.target.value)}
              maxLength={7}
            />
          </div>
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={form.grain}
              onChange={(e) => setF('grain', e.target.checked)}
              className="w-3 h-3"
            />
            {lang === 'de' ? 'Maserung' : 'Grain'}
          </label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">{lang === 'de' ? 'Dichte (kg/m³)' : 'Density (kg/m³)'}</label>
          <input
            type="number"
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            value={form.density}
            onChange={(e) => setF('density', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">E-Modul (N/mm²)</label>
          <input
            type="number"
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            value={form.eModul}
            onChange={(e) => setF('eModul', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">{lang === 'de' ? 'Biegefestigkeit' : 'Bending Str.'} (N/mm²)</label>
          <input
            type="number"
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            value={form.bendingStrength}
            onChange={(e) => setF('bendingStrength', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-0.5">
          {lang === 'de' ? 'Standard-Dicken (mm, kommagetrennt)' : 'Default Thicknesses (mm, comma-separated)'}
        </label>
        <input
          className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
          value={form.thicknesses}
          onChange={(e) => setF('thicknesses', e.target.value)}
          placeholder="18, 22, 25"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={cancelForm} className="text-xs px-3 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">
          {lang === 'de' ? 'Abbrechen' : 'Cancel'}
        </button>
        <button
          onClick={editingId ? handleUpdate : handleCreate}
          className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          {editingId
            ? (lang === 'de' ? 'Speichern' : 'Save')
            : (lang === 'de' ? 'Hinzufügen' : 'Add')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowMaterialsPanel(false) }}>
      <div className="bg-white rounded-lg shadow-xl w-[680px] max-h-[85vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-gray-800">
            {lang === 'de' ? 'Materialien' : 'Materials'}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={startCreate}
              disabled={isCreating}
              className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              + {lang === 'de' ? 'Neues Material' : 'New Material'}
            </button>
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Create form */}
          {isCreating && MaterialForm}

          {/* Custom materials */}
          {customMaterials.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                {lang === 'de' ? 'Eigene Materialien' : 'Custom Materials'}
              </h3>
              <div className="flex flex-col gap-1">
                {customMaterials.map((mat) => (
                  <div key={mat.id}>
                    {editingId === mat.id ? (
                      MaterialForm
                    ) : (
                      <div className="flex items-center gap-2 p-2 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100">
                        <div
                          className="w-5 h-5 rounded shrink-0 border border-gray-300"
                          style={{ background: mat.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-gray-800">{lang === 'de' ? mat.name : mat.nameEn}</span>
                          <span className="text-xs text-gray-500 ml-2">{CATEGORY_LABELS[mat.category][lang]}</span>
                          <span className="text-xs text-gray-400 ml-2">{mat.defaultThickness.join(', ')}mm</span>
                        </div>
                        <button
                          onClick={() => startEdit(mat)}
                          className="text-xs text-blue-600 hover:text-blue-800 px-1"
                          title={lang === 'de' ? 'Bearbeiten' : 'Edit'}
                        >✎</button>
                        <button
                          onClick={() => removeCustomMaterial(mat.id)}
                          className="text-xs text-gray-400 hover:text-red-500 px-1"
                          title={lang === 'de' ? 'Löschen' : 'Delete'}
                        >×</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Built-in materials (read-only) */}
          <div>
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              {lang === 'de' ? 'Standard-Materialien' : 'Built-in Materials'} ({builtinMaterials.length})
            </h3>
            <div className="flex flex-col gap-0.5">
              {builtinMaterials.map((mat) => (
                <div key={mat.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50">
                  <div
                    className="w-4 h-4 rounded shrink-0 border border-gray-200"
                    style={{ background: mat.color }}
                  />
                  <span className="text-xs text-gray-700 flex-1">{lang === 'de' ? mat.name : mat.nameEn}</span>
                  <span className="text-xs text-gray-400">{CATEGORY_LABELS[mat.category][lang]}</span>
                  <span className="text-xs text-gray-300">{mat.defaultThickness.join(', ')}mm</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-100 flex justify-between items-center shrink-0">
          <span className="text-xs text-gray-400">
            {customMaterials.length} {lang === 'de' ? 'eigene' : 'custom'} · {builtinMaterials.length} {lang === 'de' ? 'Standard' : 'built-in'}
          </span>
          <button
            onClick={handleClose}
            className="text-sm px-4 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {lang === 'de' ? 'Schließen' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
