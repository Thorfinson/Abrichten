import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'

interface SlideSystem {
  id: string
  name: string
  manufacturer: string
  sideClearancePerSide: number   // mm each side
  heightOptions: { label: string; h: number }[]
  heightClearanceAbove: number   // mm above drawer box
}

const SLIDE_SYSTEMS: SlideSystem[] = [
  {
    id: 'blum-tandem',
    name: 'Blum TANDEM / Legrabox',
    manufacturer: 'Blum',
    sideClearancePerSide: 12.5,
    heightClearanceAbove: 15,
    heightOptions: [
      { label: 'M – 83mm', h: 83 },
      { label: 'C – 128mm', h: 128 },
      { label: 'D – 193mm', h: 193 },
      { label: 'F – 250mm', h: 250 }
    ]
  },
  {
    id: 'grass-nova-pro',
    name: 'Grass Nova Pro / Vionaro',
    manufacturer: 'Grass',
    sideClearancePerSide: 17,
    heightClearanceAbove: 12,
    heightOptions: [
      { label: '68mm', h: 68 },
      { label: '85mm', h: 85 },
      { label: '112mm', h: 112 },
      { label: '176mm', h: 176 }
    ]
  },
  {
    id: 'hettich-arcitec',
    name: 'Hettich ArciTech',
    manufacturer: 'Hettich',
    sideClearancePerSide: 12.5,
    heightClearanceAbove: 15,
    heightOptions: [
      { label: '95mm', h: 95 },
      { label: '118mm', h: 118 },
      { label: '176mm', h: 176 },
      { label: '218mm', h: 218 }
    ]
  },
  {
    id: 'generic-undermount',
    name: 'Generic Undermount',
    manufacturer: 'Generic',
    sideClearancePerSide: 10,
    heightClearanceAbove: 10,
    heightOptions: [
      { label: '80mm', h: 80 },
      { label: '100mm', h: 100 },
      { label: '150mm', h: 150 }
    ]
  }
]

export function DrawerCalcPanel() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const showDrawerCalcPanel = useUIStore((s) => s.showDrawerCalcPanel)
  const setShowDrawerCalcPanel = useUIStore((s) => s.setShowDrawerCalcPanel)

  const [openingW, setOpeningW] = useState(500)
  const [openingH, setOpeningH] = useState(150)
  const [slideId, setSlideId] = useState('blum-tandem')

  if (!showDrawerCalcPanel) return null

  const sys = SLIDE_SYSTEMS.find((s) => s.id === slideId) ?? SLIDE_SYSTEMS[0]

  const boxWidth = openingW - 2 * sys.sideClearancePerSide
  const maxBoxHeight = openingH - sys.heightClearanceAbove

  // Find all height options that fit
  const fittingHeights = sys.heightOptions.filter((o) => o.h <= maxBoxHeight)
  const recommendedH = fittingHeights.at(-1) // largest that fits

  const copy = (text: string) => navigator.clipboard?.writeText(text)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowDrawerCalcPanel(false) }}>
      <div className="bg-white rounded-lg shadow-xl w-[460px] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">{t('drawer.title')}</h2>
          <button onClick={() => setShowDrawerCalcPanel(false)} className="text-gray-400 hover:text-gray-700 text-lg">×</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Inputs */}
          <div className="bg-gray-50 rounded p-3 space-y-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-1">
              {lang === 'de' ? 'Lichte Öffnung' : 'Clear Opening'}
            </h3>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-32">{t('drawer.openingWidth')}</label>
              <input
                type="number"
                value={openingW}
                onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) setOpeningW(v) }}
                className="w-24 text-xs border border-gray-300 rounded px-2 py-1"
              />
              <span className="text-xs text-gray-400">mm</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-32">{t('drawer.openingHeight')}</label>
              <input
                type="number"
                value={openingH}
                onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) setOpeningH(v) }}
                className="w-24 text-xs border border-gray-300 rounded px-2 py-1"
              />
              <span className="text-xs text-gray-400">mm</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-32">{t('drawer.slideSystem')}</label>
              <select
                value={slideId}
                onChange={(e) => setSlideId(e.target.value)}
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white"
              >
                {SLIDE_SYSTEMS.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Results */}
          <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
            <h3 className="text-xs font-bold text-blue-700 uppercase mb-1">
              {lang === 'de' ? 'Schubladenkasten' : 'Drawer Box'}
            </h3>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-600">{t('drawer.boxWidth')}: </span>
                <span className="text-sm font-bold text-blue-800">{boxWidth.toFixed(1)} mm</span>
                <span className="text-xs text-gray-400 ml-1">
                  ({openingW} − 2×{sys.sideClearancePerSide})
                </span>
              </div>
              <button
                onClick={() => copy(`${boxWidth.toFixed(1)}`)}
                className="text-[10px] px-2 py-0.5 rounded bg-blue-200 text-blue-700 hover:bg-blue-300"
              >
                {lang === 'de' ? 'Kopieren' : 'Copy'}
              </button>
            </div>

            {recommendedH ? (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-gray-600">{t('drawer.boxHeight')}: </span>
                  <span className="text-sm font-bold text-blue-800">{recommendedH.h} mm</span>
                  <span className="text-xs text-gray-400 ml-1">({t('drawer.heightClass')}: {recommendedH.label})</span>
                </div>
                <button
                  onClick={() => copy(`${recommendedH.h}`)}
                  className="text-[10px] px-2 py-0.5 rounded bg-blue-200 text-blue-700 hover:bg-blue-300"
                >
                  {lang === 'de' ? 'Kopieren' : 'Copy'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-red-600">
                {lang === 'de'
                  ? `Öffnungshöhe zu gering für ${sys.name}. Min. ${sys.heightOptions[0]?.h + sys.heightClearanceAbove}mm benötigt.`
                  : `Opening too low for ${sys.name}. Min. ${sys.heightOptions[0]?.h + sys.heightClearanceAbove}mm required.`}
              </p>
            )}

            <div className="text-xs text-gray-500 mt-1 pt-1 border-t border-blue-200">
              {lang === 'de' ? 'Seitenspiel' : 'Side clearance'}: {sys.sideClearancePerSide}mm {lang === 'de' ? 'pro Seite' : 'per side'} ·{' '}
              {lang === 'de' ? 'Höhenspiel' : 'Height clearance'}: {sys.heightClearanceAbove}mm
            </div>
          </div>

          {/* All height options */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-1">
              {lang === 'de' ? 'Alle Höhenklassen' : 'All Height Classes'}
            </h3>
            <div className="grid grid-cols-2 gap-1">
              {sys.heightOptions.map((o) => {
                const fits = o.h <= maxBoxHeight
                return (
                  <div
                    key={o.label}
                    className={`text-xs px-2 py-1 rounded border ${
                      fits
                        ? o === recommendedH
                          ? 'bg-blue-600 text-white border-blue-600 font-bold'
                          : 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-red-50 text-red-400 border-red-200 line-through'
                    }`}
                  >
                    {o.label}
                    {fits && <span className="ml-1 opacity-70">✓</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={() => setShowDrawerCalcPanel(false)}
            className="text-sm px-4 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {t('actions.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
