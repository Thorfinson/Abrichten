import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { openProjectFile, saveProjectFile, confirmDiscardChanges } from '../../services/projectFile'
import { renumberPartsAsked } from '../../services/partNumbers'
import { useUIStore, topModal } from '../../store/useUIStore'
import { useProjectStore } from '../../store/useProjectStore'
import { boardPresets, presetToBoard, type BoardPreset } from '../../data/board-presets'
import { getApiKey } from './SettingsDialog'
import { useDialogFocus } from '../../hooks/useKeyboard'
import { isDragActive } from '../../utils/transformLock'
import { isCmdKey, keyName, keyCombo } from '../../utils/shortcutKeys'

// ── Command definition ────────────────────────────────────────────────────────

type Category = 'board' | 'create' | 'calc' | 'analyse' | 'export' | 'view' | 'file'

interface Command {
  id: string
  label: string
  description: string
  category: Category
  keywords?: string[]
  shortcut?: string
  action: () => void
}

const CATEGORY_LABELS: Record<Category, { de: string; en: string; color: string }> = {
  board:   { de: 'Auswahl',     en: 'Selection', color: 'text-blue-300' },
  create:  { de: 'Erstellen',  en: 'Create',   color: 'text-blue-400' },
  calc:    { de: 'Rechner',    en: 'Calc',      color: 'text-violet-400' },
  analyse: { de: 'Analyse',    en: 'Analyse',   color: 'text-orange-400' },
  export:  { de: 'Exportieren',en: 'Export',    color: 'text-teal-400' },
  view:    { de: 'Ansicht',    en: 'View',      color: 'text-emerald-400' },
  file:    { de: 'Datei',      en: 'File',      color: 'text-chrome-muted' },
}

// ── Palette ──────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const show = useUIStore((s) => s.showCommandPalette)
  const setShow = useUIStore((s) => s.setShowCommandPalette)
  const selectedBoardIds   = useUIStore((s) => s.selectedBoardIds)
  const selectedAssemblyId = useUIStore((s) => s.selectedAssemblyId)

  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const dialogRef = useDialogFocus<HTMLDivElement>(show)

  // Open on Ctrl+K / ⌘K — not on top of another modal or mid-drag
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isCmdKey(e) && keyName(e) === 'k') {
        e.preventDefault()
        const top = topModal(useUIStore.getState())
        if ((top && top !== 'showCommandPalette') || isDragActive()) return
        setShow(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setShow])

  // Global Escape — closes palette regardless of which element has focus
  useEffect(() => {
    if (!show) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setShow(false) }
    }
    window.addEventListener('keydown', handler, true) // capture so it beats input's own onKeyDown
    return () => window.removeEventListener('keydown', handler, true)
  }, [show, setShow])

  // Focus input when opened
  useEffect(() => {
    if (show) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [show])

  // ── Build command list ──────────────────────────────────────────────────────
  // Actions read the store when they run: the list is memoized per opening,
  // so a snapshot taken at render time would be stale (e.g. showChatPanel).
  const ui = () => useUIStore.getState()
  const handleOpen = async () => {
    setShow(false)
    if (!confirmDiscardChanges('open')) return
    await openProjectFile()
  }
  const handleSave = async () => {
    setShow(false)
    await saveProjectFile()
  }

  const addPresetBoard = (presetId: string) => {
    setShow(false)
    const preset = boardPresets.find((p) => p.id === presetId)
    if (!preset) return
    const proj = useProjectStore.getState()
    const uiState = useUIStore.getState()

    // Pick target assembly: current selection → first existing → create new
    let aId = uiState.selectedAssemblyId
    if (!aId || !proj.project.assemblies.some((a) => a.id === aId)) {
      aId = proj.project.assemblies[0]?.id ?? null
    }
    if (!aId) {
      aId = proj.addAssembly(t('sidebar.newAssemblyName') + ' 1')
    }

    const boardData = presetToBoard(preset)
    boardData.name = t(preset.labelKey)
    const newId = proj.addBoard(aId, boardData)
    uiState.selectBoard(aId, newId)
  }

  // Every board preset is surfaced as a palette command
  const PALETTE_PRESET_IDS = boardPresets.map((p) => p.id)
  const presetCommands: Command[] = PALETTE_PRESET_IDS
    .map((id) => boardPresets.find((p) => p.id === id))
    .filter((p): p is BoardPreset => !!p)
    .map((p) => ({
      id: `add-${p.id}`,
      category: 'create' as Category,
      label: t(p.labelKey),
      description: `${p.width} × ${p.height} × ${p.depth} mm`,
      keywords: [p.id, p.labelKey, 'board', 'brett', 'platte', 'add', 'einfügen', 'hinzufügen', 'einzeln'],
      action: () => addPresetBoard(p.id),
    }))

  const commands: Command[] = useMemo(() => [
    // Create — single boards from presets
    ...presetCommands,
    { id: 'korpus', category: 'create',
      label: t('korpus.title'),
      description: lang === 'de' ? 'Korpusschrank aus Außenmaßen generieren' : 'Generate carcass from outer dimensions',
      keywords: ['schrank', 'cabinet', 'korpus', 'carcass', 'box', 'generate'],
      action: () => { setShow(false); ui().setShowKorpusPanel(true) } },

    // Calc
    { id: 'drawer', category: 'calc',
      label: t('drawer.title'),
      description: 'Blum TANDEM · Grass Nova Pro · Hettich ArciTech',
      keywords: ['schublade', 'drawer', 'blum', 'tandem', 'legrabox', 'slide'],
      action: () => { setShow(false); ui().setShowDrawerCalcPanel(true) } },
    { id: 'hinge', category: 'calc',
      label: t('hinge.title'),
      description: 'CLIP top · Sensys · Tiomos · Bohrbild',
      keywords: ['scharnier', 'hinge', 'blum', 'clip', 'topf', 'boring'],
      action: () => { setShow(false); ui().setShowHingeCalcPanel(true) } },
    { id: 'tolerance', category: 'calc',
      label: t('tolerance.title'),
      description: lang === 'de' ? '10 Einstellmaße mit Nudge' : '10 standard clearances with nudge',
      keywords: ['toleranz', 'tolerance', 'spiel', 'clearance', 'luft', 'gap'],
      action: () => { setShow(false); ui().setShowTolerancePanel(true) } },

    // Analyse
    { id: 'cost', category: 'analyse',
      label: t('cost.title'),
      description: lang === 'de' ? 'Material + Beschläge Kalkulation' : 'Material + hardware cost breakdown',
      keywords: ['kosten', 'cost', 'preis', 'price', 'kalkulation', 'budget'],
      action: () => { setShow(false); ui().setShowCostPanel(true) } },
    { id: 'boring', category: 'analyse',
      label: t('boring.title'),
      description: lang === 'de' ? '32mm Systembohrungen exportieren' : 'Export 32mm system drilling pattern',
      keywords: ['bohren', 'boring', 'drilling', '32mm', 'export', 'cnc'],
      action: () => { setShow(false); ui().setShowBoringPanel(true) } },
    { id: 'hardware', category: 'analyse',
      label: t('hardware.title'),
      description: lang === 'de' ? 'Beschlagskatalog und Mengenermittlung' : 'Hardware catalogue and quantities',
      keywords: ['beschlag', 'hardware', 'fitting', 'catalogue', 'katalog'],
      action: () => { setShow(false); ui().setShowHardwarePanel(true) } },
    { id: 'parameters', category: 'analyse',
      label: t('parameters.title'),
      description: lang === 'de' ? 'Parametrische Maßreferenzen definieren' : 'Define parametric dimension references',
      keywords: ['parameter', 'parametric', 'formel', 'formula', 'variable'],
      action: () => { setShow(false); ui().setShowParametersPanel(true) } },

    // Export
    { id: 'cutting', category: 'export',
      label: t('cutting.title'),
      description: lang === 'de' ? 'Zuschnitteliste aller Bauteile' : 'Cutting list for all parts',
      keywords: ['zuschnitt', 'cutting', 'list', 'liste', 'teile', 'parts'],
      action: () => { setShow(false); ui().setShowCuttingList(true) } },
    { id: 'nesting', category: 'export',
      label: t('nesting.title'),
      description: lang === 'de' ? 'Optimierte Plattenbelegung / DXF' : 'Optimised sheet nesting / DXF export',
      keywords: ['nesting', 'platte', 'sheet', 'verschnitt', 'dxf', 'optimize'],
      action: () => { setShow(false); ui().setShowNestingPanel(true) } },
    { id: 'assembly', category: 'export',
      label: t('montage.modeTitle'),
      description: t('montage.modeDesc'),
      keywords: ['montage', 'assembly', 'anleitung', 'instructions', 'schritte', 'steps', 'aufbau', 'ikea'],
      action: () => { setShow(false); ui().setWorkspace('assembly') } },
    { id: 'workspace-design', category: 'view',
      label: `${t('workspace.label')}: ${t('workspace.design')}`,
      description: t('workspace.designDesc'),
      keywords: ['entwurf', 'design', 'modell', 'model', 'arbeitsbereich', 'workspace'],
      action: () => { setShow(false); ui().setWorkspace('design') } },
    { id: 'drawings', category: 'export',
      label: t('shopDrawings.title'),
      description: lang === 'de' ? 'Werkstattzeichnungen (DXF/PDF)' : 'Shop drawings export (DXF/PDF)',
      keywords: ['zeichnung', 'drawing', 'plan', 'werkstatt', 'shop', 'dxf', 'pdf'],
      action: () => { setShow(false); ui().setShowShopDrawingsPanel(true) } },
    { id: 'renumber-parts', category: 'export',
      label: t('partLabel.renumber'),
      description: t('partLabel.renumberHint'),
      keywords: ['nummer', 'nummern', 'teilenummer', 'number', 'renumber', 'kurzwort', 'werkstatt', 'etikett', 'label'],
      action: () => { setShow(false); renumberPartsAsked() } },

    // View
    { id: 'toggle-static', category: 'view',
      label: lang === 'de' ? 'Statik-Overlay umschalten' : 'Toggle static overlay',
      description: lang === 'de' ? 'Durchbiegungs-Ampel ein/aus' : 'Deflection indicator on/off',
      keywords: ['statik', 'static', 'overlay', 'deflection', 'durchbiegung'],
      action: () => { setShow(false); ui().toggleStaticOverlay() } },
    { id: 'toggle-collision', category: 'view',
      label: lang === 'de' ? 'Kollisions-Overlay umschalten' : 'Toggle collision overlay',
      description: lang === 'de' ? 'Kollisionsvisualisierung ein/aus' : 'Collision visualisation on/off',
      keywords: ['kollision', 'collision', 'overlap', 'intersect'],
      action: () => { setShow(false); ui().toggleCollisionOverlay() } },
    { id: 'toggle-joints', category: 'view',
      label: lang === 'de' ? 'Verbindungs-Overlay umschalten' : 'Toggle joint markers',
      description: lang === 'de' ? 'Verbindungsmarker ein/aus' : 'Joint markers on/off',
      keywords: ['verbindung', 'joint', 'dado', 'rabbet', 'marker'],
      action: () => { setShow(false); ui().toggleJointMarkers() } },
    { id: 'fit-view', category: 'view',
      label: lang === 'de' ? 'Ansicht einpassen' : 'Fit view',
      description: lang === 'de' ? 'Alle Bauteile in den Viewport einpassen' : 'Fit all parts in viewport',
      keywords: ['fit', 'zoom', 'view', 'ansicht', 'einpassen', 'alle'],
      shortcut: 'F',
      action: () => { setShow(false); ui().triggerFitView() } },

    // File
    { id: 'open', category: 'file',
      label: t('actions.open'),
      description: lang === 'de' ? 'Projekt öffnen' : 'Open project',
      keywords: ['open', 'öffnen', 'load', 'laden', 'file', 'datei'],
      shortcut: keyCombo('O', ['cmd']),
      action: handleOpen },
    { id: 'save', category: 'file',
      label: t('actions.save'),
      description: lang === 'de' ? 'Projekt speichern' : 'Save project',
      keywords: ['save', 'speichern', 'export', 'file', 'datei'],
      shortcut: keyCombo('S', ['cmd']),
      action: handleSave },
    ...(getApiKey() ? [{
      id: 'ai', category: 'file' as Category,
      label: t('ai.title'),
      description: lang === 'de' ? 'KI-Assistent öffnen' : 'Open AI assistant',
      keywords: ['ai', 'ki', 'chat', 'assistant', 'claude', 'gpt'],
      action: () => { setShow(false); ui().setShowChatPanel(!ui().showChatPanel) }
    }] : []),
    { id: 'settings', category: 'file',
      label: t('settings.title'),
      description: lang === 'de' ? 'Sprache, API-Schlüssel, Einstellungen' : 'Language, API key, preferences',
      keywords: ['settings', 'einstellungen', 'preferences', 'language', 'sprache', 'api'],
      action: () => { setShow(false); ui().setSettingsOpen(true) } },
  // Rebuilt on every opening so e.g. the AI command appears once an API key is set
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [lang, show])

  // Board-context commands — depend on selection state
  const boardCommands: Command[] = useMemo(() => {
    if (selectedBoardIds.length === 0 || !selectedAssemblyId) return []
    const aId = selectedAssemblyId
    const bIds = selectedBoardIds
    const proj = useProjectStore.getState()
    const cmds: Command[] = [
      { id: 'sel-dup', category: 'board',
        label: lang === 'de' ? 'Duplizieren' : 'Duplicate',
        description: lang === 'de' ? `${bIds.length} Teil(e) duplizieren` : `Duplicate ${bIds.length} part(s)`,
        shortcut: 'D',
        action: () => {
          setShow(false)
          if (bIds.length === 1) proj.duplicateBoard(aId, bIds[0])
          else proj.duplicateBoards(aId, bIds)
        } },
      { id: 'sel-del', category: 'board',
        label: lang === 'de' ? 'Löschen' : 'Delete',
        description: lang === 'de' ? `${bIds.length} Teil(e) löschen` : `Delete ${bIds.length} part(s)`,
        shortcut: 'Del',
        action: () => {
          setShow(false)
          if (bIds.length === 1) proj.removeBoard(aId, bIds[0])
          else proj.removeBoards(aId, bIds)
          useUIStore.getState().deselectAll()
        } },
    ]
    if (bIds.length === 2) {
      cmds.push({
        id: 'sel-join', category: 'board',
        label: lang === 'de' ? 'Verbinden' : 'Join boards',
        description: lang === 'de' ? 'Verbindung zwischen 2 Teilen erstellen' : 'Create a joint between the 2 selected boards',
        shortcut: 'J',
        action: () => { setShow(false); ui().setShowJointDialog(true) },
      })
    }
    return cmds
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBoardIds, selectedAssemblyId, lang])

  // Filter
  const allCommands = [...boardCommands, ...commands]
  const q = query.toLowerCase().trim()
  const filtered = q === ''
    ? allCommands
    : allCommands.filter((c) => {
        const haystack = [c.label, c.description, ...(c.keywords ?? [])].join(' ').toLowerCase()
        return q.split(/\s+/).every((token) => haystack.includes(token))
      })

  // Reset active index when results change
  useEffect(() => { setActiveIdx(0) }, [q])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setShow(false); return }
    // Focus stays in the search field; the list is navigated with the arrows
    if (e.key === 'Tab') { e.preventDefault(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[activeIdx]?.action()
    }
  }

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  if (!show) return null

  // Group results by category (board commands appear first because allCommands starts with them)
  const grouped: Partial<Record<Category, Command[]>> = {}
  for (const cmd of filtered) {
    if (!grouped[cmd.category]) grouped[cmd.category] = []
    grouped[cmd.category]!.push(cmd)
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-start justify-center pt-[12vh]">
      {/* Backdrop — a click outside just closes the palette */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onMouseDown={() => setShow(false)}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('ui.commandPalette')}
        tabIndex={-1}
        className="relative w-full max-w-[560px] bg-chrome-deep border border-chrome-border rounded-xl shadow-2xl overflow-hidden outline-none"
      >

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-chrome-border">
          <svg className="w-4 h-4 text-chrome-muted shrink-0" fill="none" viewBox="0 0 20 20">
            <path d="M13 13l3.5 3.5M8.5 15a6.5 6.5 0 100-13 6.5 6.5 0 000 13z"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={t('ui.commandPalette')}
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            aria-activedescendant={filtered[activeIdx] ? `command-${filtered[activeIdx].id}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={lang === 'de' ? 'Werkzeuge, Rechner, Einstellungen …' : 'Tools, calculators, settings …'}
            className="flex-1 bg-transparent text-sm text-chrome-text placeholder-chrome-hint outline-none"
          />
          <kbd className="text-[10px] bg-chrome-bg border border-chrome-border px-1.5 py-0.5 rounded text-chrome-muted shrink-0">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} id="command-palette-list" role="listbox" aria-label={t('ui.commandPalette')} className="max-h-[60vh] overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-chrome-hint">
              {lang === 'de' ? 'Keine Ergebnisse.' : 'No results.'}
            </div>
          ) : (
            Object.entries(grouped).map(([cat, cmds]) => {
              const meta = CATEGORY_LABELS[cat as Category]
              return (
                <div key={cat} role="group" aria-label={lang === 'de' ? meta.de : meta.en}>
                  <div aria-hidden="true" className={`px-4 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-widest ${meta.color} opacity-70`}>
                    {lang === 'de' ? meta.de : meta.en}
                  </div>
                  {cmds!.map((cmd) => {
                    const globalIdx = filtered.indexOf(cmd)
                    const isActive = globalIdx === activeIdx
                    return (
                      <button
                        key={cmd.id}
                        id={`command-${cmd.id}`}
                        role="option"
                        aria-selected={isActive}
                        tabIndex={-1}
                        data-idx={globalIdx}
                        onClick={cmd.action}
                        onMouseEnter={() => setActiveIdx(globalIdx)}
                        className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors ${
                          isActive ? 'bg-chrome-surface' : 'hover:bg-chrome-bg'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium ${isActive ? 'text-chrome-text' : 'text-chrome-secondary'}`}>
                            {cmd.label}
                          </div>
                          <div className={`text-xs mt-0.5 truncate ${isActive ? 'text-chrome-muted' : 'text-chrome-hint'}`}>
                            {cmd.description}
                          </div>
                        </div>
                        {cmd.shortcut && (
                          <span className="ml-auto text-[10px] font-mono text-chrome-hint bg-chrome-surface px-1.5 py-0.5 rounded border border-chrome-border shrink-0">
                            {cmd.shortcut}
                          </span>
                        )}
                        {isActive && (
                          <kbd className="text-[10px] bg-chrome-hover border border-chrome-divider px-1.5 py-0.5 rounded text-chrome-muted shrink-0">
                            ↵
                          </kbd>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
