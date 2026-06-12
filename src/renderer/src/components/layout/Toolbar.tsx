import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from 'zustand'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { getApiKey } from './SettingsDialog'

function Sep() {
  return <div className="w-px h-4 bg-chrome-divider shrink-0" />
}

function Btn({
  onClick, title, children, className = '', disabled = false
}: {
  onClick: () => void; title?: string; children: React.ReactNode
  className?: string; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`h-7 px-2.5 rounded text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  )
}

export function Toolbar() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'

  const project              = useProjectStore((s) => s.project)
  const setProjectName       = useProjectStore((s) => s.setProjectName)
  const resetProject         = useProjectStore((s) => s.resetProject)
  const setSettingsOpen      = useUIStore((s) => s.setSettingsOpen)
  const showChatPanel        = useUIStore((s) => s.showChatPanel)
  const setShowChatPanel     = useUIStore((s) => s.setShowChatPanel)
  const setShowCommandPalette = useUIStore((s) => s.setShowCommandPalette)
  const showAssemblyDrawer   = useUIStore((s) => s.showAssemblyDrawer)
  const setShowAssemblyDrawer = useUIStore((s) => s.setShowAssemblyDrawer)

  const [editingName, setEditingName] = useState(false)

  const temporalStore = useProjectStore.temporal
  const undoCount = useStore(temporalStore, (s) => s.pastStates.length)
  const redoCount = useStore(temporalStore, (s) => s.futureStates.length)
  const undo = useStore(temporalStore, (s) => s.undo)
  const redo = useStore(temporalStore, (s) => s.redo)

  const handleNew = () => {
    const hasBoards = project.assemblies.some((a) => a.boards.length > 0)
    if (hasBoards && !window.confirm(t('actions.confirmNew'))) return
    resetProject()
    useUIStore.getState().deselectAll()
  }

  const handleOpen = async () => {
    const hasBoards = project.assemblies.some((a) => a.boards.length > 0)
    if (hasBoards && !window.confirm(t('actions.confirmOpen'))) return
    try {
      const result = await (window as any).electronAPI?.fileOpen()
      if (result) useProjectStore.getState().loadProject(JSON.parse(result.content))
    } catch (err) { console.error('Failed to open project:', err) }
  }

  const handleSave = async () => {
    try {
      await (window as any).electronAPI?.fileSave(
        JSON.stringify(project, null, 2), `${project.name}.abrichten.json`
      )
    } catch (err) { console.error('Failed to save project:', err) }
  }

  const apiKeyConfigured = !!getApiKey()

  return (
    <div className="h-9 bg-chrome-bg border-b border-chrome-border text-chrome-text flex items-center px-3 gap-1.5 shrink-0">

      {/* Assembly drawer toggle */}
      <button
        onClick={() => setShowAssemblyDrawer(!showAssemblyDrawer)}
        title={lang === 'de' ? 'Baugruppen (B)' : 'Assembly tree (B)'}
        className={`h-7 w-7 flex items-center justify-center rounded text-sm transition-colors ${
          showAssemblyDrawer
            ? 'bg-action text-action-text'
            : 'text-chrome-muted hover:bg-chrome-surface hover:text-chrome-text'
        }`}
      >
        ◧
      </button>

      {/* Brand */}
      <span className="font-semibold text-info text-sm tracking-tight shrink-0">
        {t('app.title')}
      </span>

      <Sep />

      {/* Project new + name */}
      <Btn
        onClick={handleNew}
        title={t('actions.new')}
        className="bg-chrome-surface text-chrome-secondary hover:bg-chrome-hover hover:text-chrome-text"
      >
        {t('actions.new')}
      </Btn>

      {editingName ? (
        <input
          autoFocus
          type="text"
          defaultValue={project.name}
          className="h-7 text-xs bg-chrome-surface text-chrome-text border border-action rounded px-2 w-40 outline-none"
          onBlur={(e) => { const v = e.target.value.trim(); if (v) setProjectName(v); setEditingName(false) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditingName(false)
          }}
        />
      ) : (
        <span
          className="text-chrome-secondary cursor-pointer hover:text-chrome-text text-xs max-w-[160px] truncate px-1 py-0.5 rounded hover:bg-chrome-surface"
          title={lang === 'de' ? 'Doppelklick zum Umbenennen' : 'Double-click to rename'}
          onDoubleClick={() => setEditingName(true)}
        >
          {project.name}
        </span>
      )}

      <Sep />

      {/* Undo / Redo */}
      <button
        onClick={() => undo()}
        disabled={undoCount === 0}
        title={`${t('actions.undo')} (Ctrl+Z) — ${undoCount} ${lang === 'de' ? 'Schritte' : 'steps'}`}
        className="h-7 w-8 flex items-center justify-center rounded text-sm text-chrome-secondary hover:bg-chrome-surface hover:text-chrome-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors relative"
      >
        ↩
        {undoCount > 0 && (
          <sup className="absolute top-0.5 right-0.5 text-[8px] leading-none text-chrome-muted font-mono">
            {undoCount > 9 ? '9+' : undoCount}
          </sup>
        )}
      </button>
      <button
        onClick={() => redo()}
        disabled={redoCount === 0}
        title={`${t('actions.redo')} (Ctrl+Shift+Z) — ${redoCount} ${lang === 'de' ? 'Schritte' : 'steps'}`}
        className="h-7 w-8 flex items-center justify-center rounded text-sm text-chrome-secondary hover:bg-chrome-surface hover:text-chrome-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors relative"
      >
        ↪
        {redoCount > 0 && (
          <sup className="absolute top-0.5 right-0.5 text-[8px] leading-none text-chrome-muted font-mono">
            {redoCount > 9 ? '9+' : redoCount}
          </sup>
        )}
      </button>

      <Sep />

      {/* File ops */}
      <Btn
        onClick={handleOpen}
        title={`${t('actions.open')} (Ctrl+O)`}
        className="bg-chrome-surface text-chrome-secondary hover:bg-chrome-hover hover:text-chrome-text"
      >
        {t('actions.open')}
      </Btn>
      <Btn
        onClick={handleSave}
        title={`${t('actions.save')} (Ctrl+S)`}
        className="border border-chrome-divider text-chrome-secondary hover:bg-chrome-surface hover:text-chrome-text hover:border-chrome-hover"
      >
        {t('actions.save')}
      </Btn>

      <Sep />

      {/* ⌘K Search pill */}
      <button
        onClick={() => setShowCommandPalette(true)}
        title={lang === 'de' ? 'Werkzeuge & Panels suchen (Ctrl+K)' : 'Search tools & panels (Ctrl+K)'}
        className="h-7 flex items-center gap-2 px-3 rounded-full border border-chrome-divider bg-chrome-surface text-chrome-muted hover:border-chrome-hover hover:text-chrome-secondary hover:bg-chrome-hover transition-colors min-w-[140px] cursor-pointer"
      >
        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 16 16">
          <path d="M10.5 10.5L14 14M6.5 12a5.5 5.5 0 100-11 5.5 5.5 0 000 11z"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="flex-1 text-left text-[11px]">
          {lang === 'de' ? 'Suchen …' : 'Search …'}
        </span>
        <kbd className="text-[9px] bg-chrome-bg border border-chrome-divider px-1.5 py-0.5 rounded text-chrome-muted">
          Ctrl K
        </kbd>
      </button>

      <Sep />

      {/* AI */}
      <Btn
        onClick={() => setShowChatPanel(!showChatPanel)}
        className={showChatPanel
          ? 'bg-ai text-ai-text'
          : 'bg-chrome-surface text-ai-text hover:bg-ai-dim hover:text-ai-text'
        }
        title={!apiKeyConfigured ? (lang === 'de' ? 'API-Schlüssel konfigurieren' : 'Configure API key') : undefined}
      >
        {t('ai.title')}
      </Btn>

      {/* Settings */}
      <button
        onClick={() => setSettingsOpen(true)}
        title={t('settings.title')}
        className="h-7 w-7 flex items-center justify-center rounded text-chrome-muted hover:text-chrome-text hover:bg-chrome-surface transition-colors"
      >
        ⚙
      </button>

    </div>
  )
}
