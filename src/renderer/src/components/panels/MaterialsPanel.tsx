import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { Dialog, Button, FIELD_CLASS, LABEL_CLASS, SECTION_LABEL_CLASS, CHECK_CLASS } from '../ui/Dialog'
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
  const { t, i18n } = useTranslation()
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

  const formOpen = isCreating || editingId !== null
  const field = `${FIELD_CLASS} w-full`

  const MaterialForm = (
    <div className="flex flex-col gap-2.5 rounded border border-action/50 bg-chrome-deep/60 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className={LABEL_CLASS}>{lang === 'de' ? 'Name (DE)' : 'Name'}</span>
          <input
            className={field}
            value={form.name}
            onChange={(e) => setF('name', e.target.value)}
            placeholder={lang === 'de' ? 'z. B. Spanplatte Spezial' : 'e.g. Special Particleboard'}
          />
        </label>
        <label>
          <span className={LABEL_CLASS}>Name (EN)</span>
          <input
            className={field}
            value={form.nameEn}
            onChange={(e) => setF('nameEn', e.target.value)}
            placeholder="e.g. Special Particleboard"
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label>
          <span className={LABEL_CLASS}>{lang === 'de' ? 'Kategorie' : 'Category'}</span>
          <select
            className={field}
            value={form.category}
            onChange={(e) => setF('category', e.target.value as MaterialCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c][lang]}</option>
            ))}
          </select>
        </label>
        <div>
          <span className={LABEL_CLASS}>{lang === 'de' ? 'Farbe' : 'Color'}</span>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={form.color}
              aria-label={lang === 'de' ? 'Farbe' : 'Color'}
              onChange={(e) => setF('color', e.target.value)}
              className="h-7 w-8 cursor-pointer rounded border border-chrome-border bg-chrome-deep p-0.5"
            />
            <input
              className={`${FIELD_CLASS} min-w-0 flex-1 font-mono`}
              value={form.color}
              aria-label={lang === 'de' ? 'Farbe (Hex)' : 'Color (hex)'}
              onChange={(e) => setF('color', e.target.value)}
              maxLength={7}
            />
          </div>
        </div>
        <div className="flex items-end pb-1.5">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-chrome-secondary">
            <input
              type="checkbox"
              checked={form.grain}
              onChange={(e) => setF('grain', e.target.checked)}
              className={CHECK_CLASS}
            />
            {lang === 'de' ? 'Maserung' : 'Grain'}
          </label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label>
          <span className={LABEL_CLASS}>{lang === 'de' ? 'Dichte (kg/m³)' : 'Density (kg/m³)'}</span>
          <input type="number" className={field} value={form.density} onChange={(e) => setF('density', e.target.value)} />
        </label>
        <label>
          <span className={LABEL_CLASS}>E-Modul (N/mm²)</span>
          <input type="number" className={field} value={form.eModul} onChange={(e) => setF('eModul', e.target.value)} />
        </label>
        <label>
          <span className={LABEL_CLASS}>{lang === 'de' ? 'Biegefestigkeit' : 'Bending Str.'} (N/mm²)</span>
          <input type="number" className={field} value={form.bendingStrength} onChange={(e) => setF('bendingStrength', e.target.value)} />
        </label>
      </div>

      <label>
        <span className={LABEL_CLASS}>
          {lang === 'de' ? 'Standard-Dicken (mm, kommagetrennt)' : 'Default Thicknesses (mm, comma-separated)'}
        </span>
        <input
          className={field}
          value={form.thicknesses}
          onChange={(e) => setF('thicknesses', e.target.value)}
          placeholder="18, 22, 25"
        />
      </label>

      {error && <p role="alert" className="text-xs text-danger">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" onClick={cancelForm}>{lang === 'de' ? 'Abbrechen' : 'Cancel'}</Button>
        <Button size="sm" variant="primary" onClick={editingId ? handleUpdate : handleCreate}>
          {editingId
            ? (lang === 'de' ? 'Speichern' : 'Save')
            : (lang === 'de' ? 'Hinzufügen' : 'Add')}
        </Button>
      </div>
    </div>
  )

  return (
    <Dialog
      title={lang === 'de' ? 'Materialien' : 'Materials'}
      titleId="materials-title"
      onClose={handleClose}
      className="w-[700px]"
      headerExtra={
        // the main action until a form is open; then the form's Save is
        <Button size="sm" variant={formOpen ? 'secondary' : 'primary'} onClick={startCreate} disabled={isCreating}>
          + {lang === 'de' ? 'Neues Material' : 'New Material'}
        </Button>
      }
      footer={<>
        <span className="mr-auto text-xs text-chrome-muted">
          {customMaterials.length} {lang === 'de' ? 'eigene' : 'custom'} · {builtinMaterials.length} {lang === 'de' ? 'Standard' : 'built-in'}
        </span>
        <Button onClick={handleClose}>{t('ui.close')}</Button>
      </>}
    >
      <div className="flex flex-col gap-5">
        {/* Create form */}
        {isCreating && MaterialForm}

        {/* Custom materials */}
        {customMaterials.length > 0 && (
          <section>
            <h3 className={`${SECTION_LABEL_CLASS} mb-2`}>
              {lang === 'de' ? 'Eigene Materialien' : 'Custom Materials'}
            </h3>
            <div className="flex flex-col gap-1">
              {customMaterials.map((mat) => (
                <div key={mat.id}>
                  {editingId === mat.id ? (
                    MaterialForm
                  ) : (
                    <div className="flex items-center gap-2 rounded border border-chrome-border bg-chrome-surface/40 px-2 py-1.5">
                      <div
                        className="h-5 w-5 shrink-0 rounded border border-chrome-divider"
                        style={{ background: mat.color }}
                      />
                      <div className="min-w-0 flex-1 text-xs">
                        <span className="font-medium text-chrome-text">{lang === 'de' ? mat.name : mat.nameEn}</span>
                        <span className="ml-2 text-chrome-muted">{CATEGORY_LABELS[mat.category][lang]}</span>
                        <span className="ml-2 font-mono text-chrome-hint">{mat.defaultThickness.join(', ')} mm</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(mat)}
                        title={lang === 'de' ? 'Bearbeiten' : 'Edit'}
                        aria-label={lang === 'de' ? 'Bearbeiten' : 'Edit'}
                      >✎</Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => removeCustomMaterial(mat.id)}
                        title={lang === 'de' ? 'Löschen' : 'Delete'}
                        aria-label={lang === 'de' ? 'Löschen' : 'Delete'}
                      >×</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Built-in materials (read-only) */}
        <section>
          <h3 className={`${SECTION_LABEL_CLASS} mb-2`}>
            {lang === 'de' ? 'Standard-Materialien' : 'Built-in Materials'} ({builtinMaterials.length})
          </h3>
          <div className="flex flex-col">
            {builtinMaterials.map((mat) => (
              <div key={mat.id} className="grid grid-cols-[0.875rem_minmax(0,1fr)_6rem_17.5rem] items-center gap-2 border-b border-chrome-border px-1 py-1 text-xs">
                <div
                  className="h-3.5 w-3.5 shrink-0 rounded-sm border border-chrome-divider"
                  style={{ background: mat.color }}
                />
                <span className="truncate text-chrome-text">{lang === 'de' ? mat.name : mat.nameEn}</span>
                <span className="text-chrome-muted">{CATEGORY_LABELS[mat.category][lang]}</span>
                <span className="whitespace-nowrap text-right font-mono text-chrome-hint">{mat.defaultThickness.join(', ')} mm</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Dialog>
  )
}
