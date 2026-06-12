import { useTranslation } from 'react-i18next'
import { UnifiedCanvas } from '../UnifiedCanvas'
import type { ViewMode } from '../../types/measurement'

const QUAD_VIEWS: ViewMode[] = ['front', 'side', 'top', '3d']

const VIEW_LABEL: Record<ViewMode, { de: string; en: string }> = {
  front: { de: 'Front',  en: 'Front' },
  side:  { de: 'Seite',  en: 'Side' },
  top:   { de: 'Oben',   en: 'Top' },
  '3d':  { de: '3D',     en: '3D' },
}

/**
 * 2×2 quad split showing all four views simultaneously.
 * Each quadrant runs its own CameraController with a forced view.
 */
export function QuadLayout() {
  const { i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'

  return (
    <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-[1px] bg-gray-400">
      {QUAD_VIEWS.map((view) => (
        <div key={view} className="relative overflow-hidden bg-white">
          <UnifiedCanvas forceView={view} />
          {/* View label badge */}
          <div className="absolute top-1.5 left-2 z-10 text-[9px] font-mono uppercase tracking-widest text-gray-400 pointer-events-none select-none">
            {VIEW_LABEL[view][lang]}
          </div>
        </div>
      ))}
    </div>
  )
}
