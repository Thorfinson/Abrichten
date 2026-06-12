import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'

interface PanelItem {
  labelDe: string
  labelEn: string
  descDe: string
  descEn: string
  icon: string
  action: () => void
  active?: boolean
}

interface PanelGroup {
  titleDe: string
  titleEn: string
  items: PanelItem[]
}

export function PanelHub() {
  const { i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'

  const showPanelHub          = useUIStore((s) => s.showPanelHub)
  const setShowPanelHub       = useUIStore((s) => s.setShowPanelHub)
  const showStaticOverlay     = useUIStore((s) => s.showStaticOverlay)
  const toggleStaticOverlay   = useUIStore((s) => s.toggleStaticOverlay)
  const showCollisionOverlay  = useUIStore((s) => s.showCollisionOverlay)
  const toggleCollisionOverlay = useUIStore((s) => s.toggleCollisionOverlay)
  const showBoringOverlay     = useUIStore((s) => s.showBoringOverlay)
  const toggleBoringOverlay   = useUIStore((s) => s.toggleBoringOverlay)

  const setShowKorpus         = useUIStore((s) => s.setShowKorpusPanel)
  const setShowDrawerCalc     = useUIStore((s) => s.setShowDrawerCalcPanel)
  const setShowHingeCalc      = useUIStore((s) => s.setShowHingeCalcPanel)
  const setShowTolerance      = useUIStore((s) => s.setShowTolerancePanel)
  const setShowParameters     = useUIStore((s) => s.setShowParametersPanel)
  const setShowStaticSummary  = useUIStore((s) => s.setShowStaticSummary)
  const setShowMeasurement    = useUIStore((s) => s.setShowMeasurementPanel)
  const setShowNesting        = useUIStore((s) => s.setShowNestingPanel)
  const setShowBoring         = useUIStore((s) => s.setShowBoringPanel)
  const setShowHardware       = useUIStore((s) => s.setShowHardwarePanel)
  const setShowMaterials      = useUIStore((s) => s.setShowMaterialsPanel)
  const setShowCost           = useUIStore((s) => s.setShowCostPanel)
  const setShowShopDrawings   = useUIStore((s) => s.setShowShopDrawingsPanel)
  const setShowChatPanel      = useUIStore((s) => s.setShowChatPanel)

  const open = (fn: (v: boolean) => void) => {
    fn(true)
    setShowPanelHub(false)
  }

  const groups: PanelGroup[] = [
    {
      titleDe: 'Entwurf',
      titleEn: 'Design Tools',
      items: [
        {
          icon: '🗄',
          labelDe: 'Korpus-Generator',
          labelEn: 'Cabinet Generator',
          descDe: 'Schrank aus Außenmaßen erzeugen',
          descEn: 'Generate cabinet from outer dimensions',
          action: () => open(setShowKorpus)
        },
        {
          icon: '▭',
          labelDe: 'Schubladen-Rechner',
          labelEn: 'Drawer Calculator',
          descDe: 'Zargenmaße für Schubladenführungen',
          descEn: 'Box dimensions for drawer slides',
          action: () => open(setShowDrawerCalc)
        },
        {
          icon: '⌒',
          labelDe: 'Scharnier-Rechner',
          labelEn: 'Hinge Calculator',
          descDe: 'Bohrpositionen für Topfscharniere',
          descEn: 'Cup bore positions for hinges',
          action: () => open(setShowHingeCalc)
        },
        {
          icon: '↔',
          labelDe: 'Toleranz-Referenz',
          labelEn: 'Tolerance Reference',
          descDe: 'Standardmaße und Luft-Werte',
          descEn: 'Standard clearances and nudge',
          action: () => open(setShowTolerance)
        },
        {
          icon: '{ }',
          labelDe: 'Parameter',
          labelEn: 'Parameters',
          descDe: 'Maßparameter für Formeln verwalten',
          descEn: 'Manage dimensional parameters for formulas',
          action: () => open(setShowParameters)
        },
        {
          icon: '🎨',
          labelDe: 'Materialien',
          labelEn: 'Materials',
          descDe: 'Eigene Materialien erstellen',
          descEn: 'Create custom materials',
          action: () => open(setShowMaterials)
        }
      ]
    },
    {
      titleDe: 'Analyse',
      titleEn: 'Analysis',
      items: [
        {
          icon: '📐',
          labelDe: 'Statik-Übersicht',
          labelEn: 'Static Summary',
          descDe: 'Durchbiegung aller Bauteile',
          descEn: 'Deflection table for all boards',
          action: () => open(setShowStaticSummary)
        },
        {
          icon: showStaticOverlay ? '🟢' : '⬜',
          labelDe: 'Statik-Overlay',
          labelEn: 'Static Overlay',
          descDe: 'Farb-Overlay für Durchbiegung ein/aus',
          descEn: 'Toggle color overlay for deflection',
          active: showStaticOverlay,
          action: () => { toggleStaticOverlay(); setShowPanelHub(false) }
        },
        {
          icon: showCollisionOverlay ? '🔴' : '⬜',
          labelDe: 'Kollisions-Overlay',
          labelEn: 'Collision Overlay',
          descDe: 'Überlappungen in 3D anzeigen',
          descEn: 'Show 3D collision overlaps',
          active: showCollisionOverlay,
          action: () => { toggleCollisionOverlay(); setShowPanelHub(false) }
        },
        {
          icon: '📏',
          labelDe: 'Messungen',
          labelEn: 'Measurements',
          descDe: 'Alle Messungen verwalten',
          descEn: 'Manage all measurements',
          action: () => open(setShowMeasurement)
        }
      ]
    },
    {
      titleDe: 'Produktion',
      titleEn: 'Production',
      items: [
        {
          icon: '⬚',
          labelDe: 'Nesting / Zuschnitt',
          labelEn: 'Nesting / Layout',
          descDe: 'Zuschnittoptimierung mit SVG-Export',
          descEn: 'Cutting optimization with SVG export',
          action: () => open(setShowNesting)
        },
        {
          icon: '⊙',
          labelDe: 'Bohrbild (32mm)',
          labelEn: 'Boring Pattern (32mm)',
          descDe: 'Europäisches 32mm-Bohrraster',
          descEn: 'European 32mm boring grid',
          action: () => open(setShowBoring)
        },
        {
          icon: showBoringOverlay ? '🔵' : '⬜',
          labelDe: 'Bohrungen anzeigen',
          labelEn: 'Show Borings',
          descDe: '3D-Overlay für Bohrpositionen',
          descEn: '3D overlay for bore positions',
          active: showBoringOverlay,
          action: () => { toggleBoringOverlay(); setShowPanelHub(false) }
        },
        {
          icon: '⚙',
          labelDe: 'Beschläge-Katalog',
          labelEn: 'Hardware Catalog',
          descDe: 'Scharniere, Schubladen, Griffe',
          descEn: 'Hinges, slides, handles',
          action: () => open(setShowHardware)
        }
      ]
    },
    {
      titleDe: 'Export & Berichte',
      titleEn: 'Export & Reports',
      items: [
        {
          icon: '€',
          labelDe: 'Kostenkalkulation',
          labelEn: 'Cost Calculator',
          descDe: 'Material- und Beschlagskosten',
          descEn: 'Material and hardware costs',
          action: () => open(setShowCost)
        },
        {
          icon: '📄',
          labelDe: 'Werkstattzeichnungen',
          labelEn: 'Shop Drawings',
          descDe: 'Druckfertige Bauteil-Zeichnungen',
          descEn: 'Print-ready part drawings',
          action: () => open(setShowShopDrawings)
        }
      ]
    }
  ]

  if (!showPanelHub) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={() => setShowPanelHub(false)}
      />
      {/* Drawer */}
      <div className="fixed top-10 right-0 bottom-0 w-72 bg-chrome-bg border-l border-chrome-border z-50 flex flex-col shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-chrome-border">
          <span className="text-xs font-semibold text-chrome-text uppercase tracking-widest">
            {lang === 'de' ? 'Werkzeuge & Panels' : 'Tools & Panels'}
          </span>
          <button
            onClick={() => setShowPanelHub(false)}
            className="text-chrome-muted hover:text-chrome-text text-lg leading-none"
          >×</button>
        </div>

        <div className="flex-1 py-2">
          {groups.map((group) => (
            <div key={group.titleEn} className="mb-4">
              <div className="px-4 py-1.5 text-[10px] font-semibold text-chrome-muted uppercase tracking-widest">
                {lang === 'de' ? group.titleDe : group.titleEn}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.labelEn}
                  onClick={item.action}
                  className={`w-full flex items-start gap-3 px-4 py-2 hover:bg-chrome-surface transition-colors text-left ${
                    item.active ? 'bg-chrome-surface' : ''
                  }`}
                >
                  <span className="text-base w-5 text-center shrink-0 mt-0.5">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium ${item.active ? 'text-action' : 'text-chrome-text'}`}>
                      {lang === 'de' ? item.labelDe : item.labelEn}
                    </div>
                    <div className="text-[10px] text-chrome-muted truncate">
                      {lang === 'de' ? item.descDe : item.descEn}
                    </div>
                  </div>
                  {item.active && (
                    <span className="w-1.5 h-1.5 rounded-full bg-action shrink-0 mt-1.5" />
                  )}
                </button>
              ))}
            </div>
          ))}

          {/* AI section */}
          <div className="border-t border-chrome-border mt-2 pt-2">
            <button
              onClick={() => { setShowChatPanel(true); setShowPanelHub(false) }}
              className="w-full flex items-start gap-3 px-4 py-2 hover:bg-chrome-surface transition-colors text-left"
            >
              <span className="text-base w-5 text-center shrink-0 mt-0.5">🤖</span>
              <div>
                <div className="text-xs font-medium text-ai-text">
                  {lang === 'de' ? 'KI-Assistent' : 'AI Assistant'}
                </div>
                <div className="text-[10px] text-chrome-muted">
                  {lang === 'de' ? 'Bauteile per Sprache generieren' : 'Generate boards by description'}
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
