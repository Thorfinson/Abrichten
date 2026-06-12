import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import { useProjectStore } from '../../store/useProjectStore'
import { fetchVisionModels, type OpenRouterModel } from '../../services/openrouter'
import { loadEnvConfig } from '../../config/env'
import { materials } from '../../data/materials'
import type { Unit } from '../../types/furniture'

const STORAGE_KEY = 'abrichten-settings'

interface Settings {
  apiKey: string
  modelId: string
  theme: 'light' | 'dark' | 'system'
  defaultMaterialId: string
  defaultSnapSize: number
  defaultUnit: Unit
  csvDelimiter: ';' | ',' | '\t'
  tooltipsEnabled: boolean
}

function loadSettings(): Settings {
  let saved: Partial<Settings> = {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) saved = JSON.parse(raw)
  } catch { /* ignore */ }
  const merged = { ...defaultSettings(), ...saved }

  // .env values fill in when nothing is configured via the dialog
  const env = loadEnvConfig()
  return {
    ...merged,
    apiKey: merged.apiKey || env.openRouterApiKey,
    modelId: merged.modelId || env.openRouterModelId
  }
}

function defaultSettings(): Settings {
  return {
    apiKey: '',
    modelId: '',
    theme: 'system',
    defaultMaterialId: 'spanplatte-melamin',
    defaultSnapSize: 10,
    defaultUnit: 'mm',
    csvDelimiter: ';',
    tooltipsEnabled: false
  }
}

function saveSettings(s: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  // Apply theme immediately
  applyTheme(s.theme)
}

function applyTheme(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    // system
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}

export function getApiKey(): string {
  return loadSettings().apiKey
}

export function getModelId(): string {
  return loadSettings().modelId
}

export function getDefaultMaterialId(): string {
  return loadSettings().defaultMaterialId
}

export function getCsvDelimiter(): string {
  return loadSettings().csvDelimiter
}

type SectionId = 'appearance' | 'defaults' | 'export' | 'ai' | 'shortcuts'

const SHORTCUTS = [
  { key: 'Ctrl+Z / Ctrl+Shift+Z', actionDe: 'Rückgängig / Wiederholen', actionEn: 'Undo / Redo' },
  { key: 'Ctrl+S', actionDe: 'Speichern', actionEn: 'Save' },
  { key: 'Ctrl+O', actionDe: 'Öffnen', actionEn: 'Open' },
  { key: 'Ctrl+D', actionDe: 'Duplizieren', actionEn: 'Duplicate' },
  { key: 'Ctrl+A', actionDe: 'Alles auswählen', actionEn: 'Select all' },
  { key: 'F', actionDe: 'Ansicht einpassen', actionEn: 'Fit view' },
  { key: 'Ctrl+K', actionDe: 'Befehlspalette', actionEn: 'Command palette' },
  { key: 'Alt+1/2/3/4', actionDe: 'Ansicht wechseln (Front/Seite/Oben/3D)', actionEn: 'Switch view (Front/Side/Top/3D)' },
  { key: '1/2/3/4', actionDe: 'Werkzeug wählen (Auswahl/Maß/Winkel/Fläche)', actionEn: 'Tool (Select/Measure/Angle/Area)' },
  { key: 'Delete / Backspace', actionDe: 'Ausgewählte löschen', actionEn: 'Delete selected' },
  { key: 'Arrow keys', actionDe: 'Bauteile verschieben (±1mm, Shift: ±10mm)', actionEn: 'Nudge boards (±1mm, Shift: ±10mm)' },
  { key: 'J', actionDe: 'Verbindung erstellen (2 Bauteile gewählt)', actionEn: 'Create joint (2 boards selected)' },
  { key: 'S', actionDe: 'Raster-Snap umschalten', actionEn: 'Toggle snap' },
  { key: 'G / R', actionDe: 'Verschieben / Drehen (3D)', actionEn: 'Translate / Rotate (3D)' },
  { key: 'Esc', actionDe: 'Auswahl aufheben', actionEn: 'Deselect' },
]

export function SettingsDialog() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const settingsOpen = useUIStore((s) => s.settingsOpen)
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen)
  const setLanguage = useProjectStore((s) => s.setLanguage)
  const project = useProjectStore((s) => s.project)

  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [loading, setLoading] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState<SectionId>('appearance')

  useEffect(() => {
    if (settingsOpen) {
      setSettings(loadSettings())
      setTestStatus('idle')
      setError('')
    }
  }, [settingsOpen])

  const handleFetchModels = async () => {
    if (!settings.apiKey.trim()) return
    setLoading(true)
    setError('')
    setTestStatus('idle')
    try {
      const m = await fetchVisionModels(settings.apiKey.trim())
      setModels(m)
      setTestStatus('ok')
    } catch (e: any) {
      setError(e.message || t('settings.fetchError'))
      setTestStatus('error')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = () => {
    saveSettings(settings)
    setLanguage(project.language) // keep project lang
    setSettingsOpen(false)
  }

  const handleLanguageChange = (l: 'de' | 'en') => {
    i18n.changeLanguage(l)
    setLanguage(l)
  }

  const update = (partial: Partial<Settings>) => setSettings((s) => ({ ...s, ...partial }))

  if (!settingsOpen) return null

  const sections: { id: SectionId; labelDe: string; labelEn: string }[] = [
    { id: 'appearance', labelDe: 'Darstellung', labelEn: 'Appearance' },
    { id: 'defaults', labelDe: 'Standard-Werte', labelEn: 'Defaults' },
    { id: 'export', labelDe: 'Export', labelEn: 'Export' },
    { id: 'ai', labelDe: 'KI / API', labelEn: 'AI / API' },
    { id: 'shortcuts', labelDe: 'Tastenkürzel', labelEn: 'Keyboard Shortcuts' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false) }}>
      <div className="bg-white rounded-lg shadow-xl w-[600px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-200">
          <h2 className="text-base font-bold text-gray-800">{t('settings.title')}</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >×</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left nav */}
          <div className="w-40 border-r border-gray-100 py-2 shrink-0">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full text-left px-4 py-2 text-sm rounded-none transition-colors ${
                  activeSection === s.id
                    ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {lang === 'de' ? s.labelDe : s.labelEn}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">

            {activeSection === 'appearance' && (
              <div className="space-y-4">
                {/* Language */}
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    {t('settings.language')}
                  </label>
                  <div className="flex gap-2">
                    {(['de', 'en'] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => handleLanguageChange(l)}
                        className={`px-3 py-1.5 text-sm rounded ${
                          project.language === l
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {l === 'de' ? 'Deutsch' : 'English'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme */}
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    {lang === 'de' ? 'Farbschema' : 'Theme'}
                  </label>
                  <div className="flex gap-2">
                    {([
                      { v: 'light', labelDe: 'Hell', labelEn: 'Light' },
                      { v: 'dark', labelDe: 'Dunkel', labelEn: 'Dark' },
                      { v: 'system', labelDe: 'System', labelEn: 'System' }
                    ] as const).map((opt) => (
                      <button
                        key={opt.v}
                        onClick={() => update({ theme: opt.v })}
                        className={`px-3 py-1.5 text-sm rounded ${
                          settings.theme === opt.v
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {lang === 'de' ? opt.labelDe : opt.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Discovery tooltips */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-700">
                      {lang === 'de' ? 'Lern-Hinweise' : 'Discovery Tooltips'}
                    </div>
                    <div className="text-xs text-gray-400">
                      {lang === 'de' ? 'Kontextuelle Tipps für neue Benutzer' : 'Contextual tips for new users'}
                    </div>
                  </div>
                  <button
                    onClick={() => update({ tooltipsEnabled: !settings.tooltipsEnabled })}
                    className={`w-10 h-5 rounded-full transition-colors ${settings.tooltipsEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full mx-0.5 transition-transform ${settings.tooltipsEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            )}

            {activeSection === 'defaults' && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    {lang === 'de' ? 'Standard-Material' : 'Default Material'}
                  </label>
                  <select
                    value={settings.defaultMaterialId}
                    onChange={(e) => update({ defaultMaterialId: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded px-3 py-2"
                  >
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {lang === 'de' ? m.name : m.nameEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    {lang === 'de' ? 'Standard-Raster (mm)' : 'Default Snap Size (mm)'}
                  </label>
                  <div className="flex gap-2">
                    {[1, 5, 10, 25, 50, 100].map((v) => (
                      <button
                        key={v}
                        onClick={() => update({ defaultSnapSize: v })}
                        className={`px-2.5 py-1 text-sm rounded ${
                          settings.defaultSnapSize === v
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    {lang === 'de' ? 'Standard-Einheit' : 'Default Unit'}
                  </label>
                  <div className="flex gap-2">
                    {(['mm', 'cm', 'm'] as Unit[]).map((u) => (
                      <button
                        key={u}
                        onClick={() => update({ defaultUnit: u })}
                        className={`px-3 py-1.5 text-sm rounded ${
                          settings.defaultUnit === u
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'export' && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    {lang === 'de' ? 'CSV-Trennzeichen' : 'CSV Delimiter'}
                  </label>
                  <div className="flex gap-2">
                    {[
                      { v: ';' as const, label: lang === 'de' ? 'Semikolon ;' : 'Semicolon ;' },
                      { v: ',' as const, label: lang === 'de' ? 'Komma ,' : 'Comma ,' },
                      { v: '\t' as const, label: lang === 'de' ? 'Tabulator ⇥' : 'Tab ⇥' }
                    ].map((opt) => (
                      <button
                        key={opt.v}
                        onClick={() => update({ csvDelimiter: opt.v })}
                        className={`px-3 py-1.5 text-sm rounded ${
                          settings.csvDelimiter === opt.v
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {lang === 'de'
                      ? 'Für deutsche Excel-Versionen: Semikolon empfohlen'
                      : 'For European Excel: Semicolon recommended'}
                  </p>
                </div>
              </div>
            )}

            {activeSection === 'ai' && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    {t('settings.apiKey')}
                  </label>
                  <input
                    type="password"
                    value={settings.apiKey}
                    onChange={(e) => update({ apiKey: e.target.value })}
                    placeholder="sk-or-..."
                    className="w-full text-sm border border-gray-300 rounded px-3 py-2"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {t('ai.noApiKey')}{' '}
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-500 underline"
                    >
                      openrouter.ai/keys
                    </a>
                  </p>
                </div>

                <div className="flex gap-2 items-center">
                  <button
                    onClick={handleFetchModels}
                    disabled={!settings.apiKey.trim() || loading}
                    className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading
                      ? t('settings.loadingModels')
                      : lang === 'de' ? 'Verbindung testen & Modelle laden' : 'Test connection & load models'}
                  </button>
                  {testStatus === 'ok' && (
                    <span className="text-sm text-green-600">✓ {lang === 'de' ? 'Verbunden' : 'Connected'}</span>
                  )}
                  {testStatus === 'error' && (
                    <span className="text-sm text-red-500">✗ {lang === 'de' ? 'Fehler' : 'Error'}</span>
                  )}
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}

                {models.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      {t('settings.model')}
                    </label>
                    <select
                      value={settings.modelId}
                      onChange={(e) => update({ modelId: e.target.value })}
                      className="w-full text-sm border border-gray-300 rounded px-3 py-2"
                    >
                      <option value="">-- {t('ai.selectModel')} --</option>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'shortcuts' && (
              <div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="pb-1 font-medium pr-4">
                        {lang === 'de' ? 'Tastenkürzel' : 'Shortcut'}
                      </th>
                      <th className="pb-1 font-medium">
                        {lang === 'de' ? 'Aktion' : 'Action'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {SHORTCUTS.map((s) => (
                      <tr key={s.key} className="border-b border-gray-50">
                        <td className="py-1.5 pr-4">
                          <kbd className="font-mono text-[10px] bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                            {s.key}
                          </kbd>
                        </td>
                        <td className="py-1.5 text-gray-600">
                          {lang === 'de' ? s.actionDe : s.actionEn}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button
            onClick={() => setSettingsOpen(false)}
            className="text-sm px-4 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {t('actions.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="text-sm px-4 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            {t('actions.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
