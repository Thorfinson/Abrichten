import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import { useProjectStore } from '../../store/useProjectStore'
import { Dialog, Button } from '../ui/Dialog'
import sampleProject from '../../assets/sample-project.json'
import type { Project } from '../../types/furniture'

/** 24 × 24 line icon, drawn with the current text colour */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

interface FeatureCard {
  icon: ReactNode
  /** Tile colour: accent for the craft features, AI purple for the assistant */
  tone: string
  titleDe: string
  titleEn: string
  descDe: string
  descEn: string
}

const FEATURES: FeatureCard[] = [
  {
    // dimension line between two extension lines
    icon: <Icon><path d="M4 6v12M20 6v12M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3" /></Icon>,
    tone: 'bg-accent-dim/60 text-accent',
    titleDe: 'Parametrisches Design',
    titleEn: 'Parametric Design',
    descDe: 'Definiere Parameter wie H, B, T und verwende Formeln wie =H-18 in Bauteilmaßen. Alle abhängigen Maße aktualisieren sich automatisch.',
    descEn: 'Define parameters like H, W, D and use formulas like =H-18 in board dimensions. All dependent dimensions update automatically.'
  },
  {
    // a sheet split into parts
    icon: <Icon><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 11h18M10 11v9M15 4v7" /></Icon>,
    tone: 'bg-accent-dim/60 text-accent',
    titleDe: 'Produktionsbereit',
    titleEn: 'Production Ready',
    descDe: 'Generiere Zuschnittlisten, optimiere Plattenzuschnitt (Nesting), exportiere DXF und erstelle Bohrpläne.',
    descEn: 'Generate cutting lists, optimize sheet layout (nesting), export DXF files, and create boring patterns.'
  },
  {
    // sparkles
    icon: <Icon><path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z" /><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></Icon>,
    tone: 'bg-ai-dim/60 text-ai',
    titleDe: 'KI-Assistent',
    titleEn: 'AI Assistant',
    descDe: 'Beschreibe dein Möbelstück in natürlicher Sprache oder lade eine Skizze hoch. Der KI-Assistent erstellt Bauteile automatisch.',
    descEn: 'Describe your furniture in plain language or upload a sketch. The AI assistant creates boards automatically.'
  }
]

export function WelcomeDialog() {
  const hasSeenWelcome = useUIStore((s) => s.hasSeenWelcome)
  const setHasSeenWelcome = useUIStore((s) => s.setHasSeenWelcome)
  const setShowShortcutsOverlay = useUIStore((s) => s.setShowShortcutsOverlay)
  const loadProject = useProjectStore((s) => s.loadProject)
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'de'

  if (hasSeenWelcome) return null

  // Every way out marks the welcome as seen: it shows once, on the first start
  const dismiss = () => setHasSeenWelcome()

  const handleSample = () => {
    loadProject(sampleProject as unknown as Project)
    useUIStore.getState().setActiveView('3d')   // the cabinet reads best in 3D; App fits the view on load
    dismiss()
  }

  const handleShortcuts = () => {
    dismiss()
    setShowShortcutsOverlay(true)
  }

  return (
    <Dialog
      title={t('dlg.welcomeTitle')}
      titleId="welcome-title"
      onClose={dismiss}
      closeOnBackdrop={false}
      className="w-[600px]"
      footer={<>
        <span className="mr-auto text-xs text-chrome-hint">{t('dlg.welcomePaletteHint')}</span>
        <Button variant="ghost" size="sm" onClick={handleShortcuts}>
          {t('dlg.welcomeShortcuts')}
          <kbd className="rounded border border-chrome-border bg-chrome-deep px-1 font-mono text-[10px] text-chrome-muted">?</kbd>
        </Button>
      </>}
    >
      <div className="space-y-5">
        <p className="text-base text-chrome-secondary">{t('dlg.welcomeTagline')}</p>

        {/* Feature cards */}
        <ul className="space-y-2">
          {FEATURES.map((f) => (
            <li key={f.titleEn} className="flex items-start gap-3 rounded-lg border border-chrome-border bg-chrome-deep/50 p-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${f.tone}`}>{f.icon}</span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-chrome-text">
                  {lang === 'de' ? f.titleDe : f.titleEn}
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-chrome-muted">
                  {lang === 'de' ? f.descDe : f.descEn}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {/* Actions */}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button variant="primary" onClick={handleSample} className="justify-start gap-3 px-4 py-2.5 text-left">
            <Icon><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" /></Icon>
            <span>
              <span className="block font-semibold">{lang === 'de' ? 'Beispielprojekt laden' : 'Load Sample Project'}</span>
              <span className="block text-xs font-normal text-action-text/75">
                {lang === 'de'
                  ? 'Wandschrank mit 6 Bauteilen, Verbindungen und Parametern'
                  : 'Wall cabinet with 6 boards, joints, and parameters'}
              </span>
            </span>
          </Button>
          <Button onClick={dismiss} className="px-4">
            {t('dlg.welcomeEmpty')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
