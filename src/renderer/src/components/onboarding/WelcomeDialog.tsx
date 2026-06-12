import { useState } from 'react'
import { useUIStore } from '../../store/useUIStore'
import { useProjectStore } from '../../store/useProjectStore'
import sampleProject from '../../assets/sample-project.json'
import type { Project } from '../../types/furniture'

interface FeatureCard {
  icon: string
  titleDe: string
  titleEn: string
  descDe: string
  descEn: string
}

const FEATURES: FeatureCard[] = [
  {
    icon: '⚙',
    titleDe: 'Parametrisches Design',
    titleEn: 'Parametric Design',
    descDe: 'Definiere Parameter wie H, B, T und verwende Formeln in Bauteilmaßen. Alle abhängigen Maße aktualisieren sich automatisch.',
    descEn: 'Define parameters like H, W, D and use formulas in board dimensions. All dependent dimensions update automatically.'
  },
  {
    icon: '🔨',
    titleDe: 'Produktionsbereit',
    titleEn: 'Production Ready',
    descDe: 'Generiere Zuschnittlisten, optimiere Plattenzuschnitt (Nesting), exportiere DXF und erstelle Bohrpläne.',
    descEn: 'Generate cutting lists, optimize sheet layout (nesting), export DXF files, and create boring patterns.'
  },
  {
    icon: '✦',
    titleDe: 'KI-Assistent',
    titleEn: 'AI Assistant',
    descDe: 'Beschreibe dein Möbelstück in natürlicher Sprache oder lade eine Skizze hoch. Der KI-Assistent erstellt Bauteile automatisch.',
    descEn: 'Describe your furniture in plain language or upload a sketch. The AI assistant creates boards automatically.'
  }
]

export function WelcomeDialog() {
  const hasSeenWelcome = useUIStore((s) => s.hasSeenWelcome)
  const setHasSeenWelcome = useUIStore((s) => s.setHasSeenWelcome)
  const setTooltipsEnabled = useUIStore((s) => s.setTooltipsEnabled)
  const loadProject = useProjectStore((s) => s.loadProject)
  const i18nLang = typeof localStorage !== 'undefined'
    ? (localStorage.getItem('i18nextLng') ?? 'de')
    : 'de'
  const lang = i18nLang.startsWith('de') ? 'de' : 'en'

  const [dontShow, setDontShow] = useState(false)

  if (hasSeenWelcome) return null

  const dismiss = () => {
    if (dontShow) setHasSeenWelcome()
    else setHasSeenWelcome() // Always mark as seen on any action
  }

  const handleSample = () => {
    loadProject(sampleProject as unknown as Project)
    dismiss()
  }

  const handleScratch = () => {
    dismiss()
  }

  const handleTooltips = () => {
    setTooltipsEnabled(true)
    dismiss()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-xl shadow-2xl w-[640px] max-h-[85vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-5 text-white">
          <h1 className="text-xl font-bold">
            {lang === 'de' ? 'Willkommen bei Abrichten' : 'Welcome to Abrichten'}
          </h1>
          <p className="text-sm text-blue-200 mt-1">
            {lang === 'de'
              ? 'CAD-Software für den modernen Schreiner'
              : 'CAD software for the modern woodworker'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Feature cards */}
          <div className="grid grid-cols-1 gap-3 mb-6">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 transition-colors">
                <span className="text-2xl shrink-0 mt-0.5">{f.icon}</span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-0.5">
                    {lang === 'de' ? f.titleDe : f.titleEn}
                  </h3>
                  <p className="text-xs text-gray-600">
                    {lang === 'de' ? f.descDe : f.descEn}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleSample}
              className="w-full py-3 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <span className="text-lg">📂</span>
              <div className="text-left">
                <div className="font-semibold">
                  {lang === 'de' ? 'Beispielprojekt laden' : 'Load Sample Project'}
                </div>
                <div className="text-xs text-blue-200">
                  {lang === 'de'
                    ? 'Wandschrank mit 6 Bauteilen, Verbindungen und Parametern'
                    : 'Wall cabinet with 6 boards, joints, and parameters'}
                </div>
              </div>
            </button>

            <button
              onClick={handleScratch}
              className="w-full py-2.5 px-4 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              {lang === 'de' ? 'Von Null beginnen' : 'Start from Scratch'}
            </button>

            <button
              onClick={handleTooltips}
              className="w-full py-2.5 px-4 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              {lang === 'de' ? 'Mit Hinweisen lernen' : 'Learn with Tips'}
              <span className="text-xs text-blue-500 ml-1">
                {lang === 'de' ? '(zeigt kontextuelle Tipps)' : '(shows contextual tips)'}
              </span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="w-3 h-3"
            />
            {lang === 'de' ? 'Nicht mehr anzeigen' : "Don't show again"}
          </label>
          <button
            onClick={handleScratch}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            {lang === 'de' ? 'Schließen' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
