import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import { useProjectStore } from '../../store/useProjectStore'
import { fetchVisionModels, type OpenRouterModel } from '../../services/openrouter'
import { loadEnvConfig } from '../../config/env'
import { Dialog, Button, FIELD_CLASS, segmentClass } from '../ui/Dialog'
import { INPUT_DEVICES, ALT_KEY, type InputDevice } from '../../utils/canvasInput'

const STORAGE_KEY = 'abrichten-settings'

interface Settings {
  apiKey: string
  modelId: string
  csvDelimiter: ';' | ',' | '\t'
}

const CSV_DELIMITERS: Settings['csvDelimiter'][] = [';', ',', '\t']

function loadSettings(): Settings {
  let saved: Partial<Record<keyof Settings, unknown>> = {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) saved = JSON.parse(raw) ?? {}
  } catch { /* ignore */ }
  // Older versions stored more (colour scheme, default values, tips) that nothing read:
  // keep only the settings that still exist, each checked
  const d = defaultSettings()
  const merged: Settings = {
    apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : d.apiKey,
    modelId: typeof saved.modelId === 'string' ? saved.modelId : d.modelId,
    csvDelimiter: CSV_DELIMITERS.includes(saved.csvDelimiter as Settings['csvDelimiter'])
      ? (saved.csvDelimiter as Settings['csvDelimiter'])
      : d.csvDelimiter
  }

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
    csvDelimiter: ';'
  }
}

function saveSettings(s: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

export function getApiKey(): string {
  return loadSettings().apiKey
}

export function getModelId(): string {
  return loadSettings().modelId
}

export function getCsvDelimiter(): Settings['csvDelimiter'] {
  return loadSettings().csvDelimiter
}

type SectionId = 'general' | 'export' | 'ai' | 'shortcuts'

const INPUT_LABEL: Record<InputDevice, string> = {
  auto: 'settings.inputAuto', mouse: 'settings.inputMouse', trackpad: 'settings.inputTrackpad'
}
const INPUT_HINT: Record<InputDevice, string> = {
  auto: 'settings.inputHintAuto', mouse: 'settings.inputHintMouse', trackpad: 'settings.inputHintTrackpad'
}

const SHORTCUTS = [
  { key: 'Ctrl+Z / Ctrl+Shift+Z', actionDe: 'Rückgängig / Wiederholen', actionEn: 'Undo / Redo' },
  { key: 'Ctrl+S', actionDe: 'Speichern', actionEn: 'Save' },
  { key: 'Ctrl+O', actionDe: 'Öffnen', actionEn: 'Open' },
  { key: 'D / Ctrl+D', actionDe: 'Duplizieren', actionEn: 'Duplicate' },
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
  const inputDevice = useUIStore((s) => s.inputDevice)
  const setInputDevice = useUIStore((s) => s.setInputDevice)

  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [loading, setLoading] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState<SectionId>('general')

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

  const sections: { id: SectionId; label: string }[] = [
    { id: 'general', label: t('dlg.general') },
    { id: 'export', label: 'Export' },
    { id: 'ai', label: lang === 'de' ? 'KI / API' : 'AI / API' },
    { id: 'shortcuts', label: lang === 'de' ? 'Tastenkürzel' : 'Keyboard Shortcuts' },
  ]

  const fieldLabel = 'mb-1.5 block text-xs font-medium text-chrome-secondary'

  return (
    <Dialog
      title={t('settings.title')}
      titleId="settings-title"
      onClose={() => setSettingsOpen(false)}
      className="h-[520px] w-[640px]"
      bodyClassName="flex"
      footer={<>
        <Button onClick={() => setSettingsOpen(false)}>{t('actions.cancel')}</Button>
        <Button variant="primary" onClick={handleSave}>{t('actions.apply')}</Button>
      </>}
    >
      {/* Left nav */}
      <nav aria-label={t('settings.title')} className="w-44 shrink-0 border-r border-chrome-border py-2">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={activeSection === s.id ? 'page' : undefined}
            onClick={() => setActiveSection(s.id)}
            className={`w-full border-l-2 px-4 py-2 text-left text-sm outline-none transition-colors focus-visible:bg-chrome-hover ${
              activeSection === s.id
                ? 'border-accent bg-chrome-surface/60 font-medium text-chrome-text'
                : 'border-transparent text-chrome-muted hover:bg-chrome-hover/40 hover:text-chrome-text'
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        {activeSection === 'general' && (
          <div className="space-y-5">
            {/* Language */}
            <div>
              <span className={fieldLabel}>{t('settings.language')}</span>
              <div className="flex gap-2">
                {(['de', 'en'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => handleLanguageChange(l)}
                    aria-pressed={lang === l}
                    className={segmentClass(lang === l)}
                  >
                    {l === 'de' ? 'Deutsch' : 'English'}
                  </button>
                ))}
              </div>
            </div>

            {/* Input device: how wheel and ⌥-drag move the camera (applies at once, like the language) */}
            <div>
              <span className={fieldLabel}>{t('settings.inputDevice')}</span>
              <div className="flex gap-2" role="group" aria-label={t('settings.inputDevice')}>
                {INPUT_DEVICES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setInputDevice(d)}
                    aria-pressed={inputDevice === d}
                    className={segmentClass(inputDevice === d)}
                  >
                    {t(INPUT_LABEL[d])}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-chrome-hint">{t(INPUT_HINT[inputDevice], { alt: ALT_KEY })}</p>
            </div>

          </div>
        )}

        {activeSection === 'export' && (
          <div>
            <span className={fieldLabel}>{lang === 'de' ? 'CSV-Trennzeichen' : 'CSV Delimiter'}</span>
            <div className="flex gap-2">
              {[
                { v: ';' as const, label: lang === 'de' ? 'Semikolon ;' : 'Semicolon ;' },
                { v: ',' as const, label: lang === 'de' ? 'Komma ,' : 'Comma ,' },
                { v: '\t' as const, label: lang === 'de' ? 'Tabulator ⇥' : 'Tab ⇥' }
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  aria-pressed={settings.csvDelimiter === opt.v}
                  onClick={() => update({ csvDelimiter: opt.v })}
                  className={segmentClass(settings.csvDelimiter === opt.v)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-chrome-hint">
              {lang === 'de'
                ? 'Für deutsche Excel-Versionen: Semikolon empfohlen'
                : 'For European Excel: Semicolon recommended'}
            </p>
          </div>
        )}

        {activeSection === 'ai' && (
          <div className="space-y-4">
            <label className="block">
              <span className={fieldLabel}>{t('settings.apiKey')}</span>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => update({ apiKey: e.target.value })}
                placeholder="sk-or-..."
                className={`${FIELD_CLASS} w-full py-1.5 text-sm`}
              />
            </label>
            <p className="-mt-2 text-xs text-chrome-hint">
              {t('ai.noApiKey')}{' '}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="text-info underline hover:text-info-text"
              >
                openrouter.ai/keys
              </a>
            </p>

            <div className="flex items-center gap-3">
              <Button onClick={handleFetchModels} disabled={!settings.apiKey.trim() || loading}>
                {loading
                  ? t('settings.loadingModels')
                  : lang === 'de' ? 'Verbindung testen & Modelle laden' : 'Test connection & load models'}
              </Button>
              {testStatus === 'ok' && (
                <span className="text-sm text-success">✓ {lang === 'de' ? 'Verbunden' : 'Connected'}</span>
              )}
              {testStatus === 'error' && (
                <span className="text-sm text-danger">✗ {lang === 'de' ? 'Fehler' : 'Error'}</span>
              )}
            </div>
            {error && <p role="alert" className="text-xs text-danger">{error}</p>}

            {models.length > 0 && (
              <label className="block">
                <span className={fieldLabel}>{t('settings.model')}</span>
                <select
                  value={settings.modelId}
                  onChange={(e) => update({ modelId: e.target.value })}
                  className={`${FIELD_CLASS} w-full py-1.5 text-sm`}
                >
                  <option value="">-- {t('ai.selectModel')} --</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {activeSection === 'shortcuts' && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-chrome-border text-left text-chrome-muted">
                <th className="pb-1.5 pr-4 font-medium">
                  {lang === 'de' ? 'Tastenkürzel' : 'Shortcut'}
                </th>
                <th className="pb-1.5 font-medium">
                  {lang === 'de' ? 'Aktion' : 'Action'}
                </th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map((s) => (
                <tr key={s.key} className="border-b border-chrome-border/60">
                  <td className="py-1.5 pr-4">
                    <kbd className="rounded border border-chrome-border bg-chrome-deep px-1.5 py-0.5 font-mono text-[10px] text-chrome-text">
                      {s.key}
                    </kbd>
                  </td>
                  <td className="py-1.5 text-chrome-secondary">
                    {lang === 'de' ? s.actionDe : s.actionEn}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Dialog>
  )
}
