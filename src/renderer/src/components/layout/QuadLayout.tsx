import { useTranslation } from 'react-i18next'
import { UnifiedCanvas } from '../UnifiedCanvas'
import type { ViewMode } from '../../types/measurement'

const QUAD_VIEWS: ViewMode[] = ['front', 'side', 'top', '3d']

const VIEW_LABEL_KEY: Record<ViewMode, string> = {
  front: 'views.front',
  side:  'views.side',
  top:   'views.top',
  '3d':  'views.3d',
}

/**
 * 2×2 quad split showing all four views simultaneously.
 * Each quadrant runs its own CameraController with a forced view.
 */
export function QuadLayout() {
  const { t } = useTranslation()

  return (
    <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px bg-chrome-border">
      {QUAD_VIEWS.map((view, idx) => (
        <div key={view} className="relative overflow-hidden bg-canvas">
          <UnifiedCanvas forceView={view} />
          {/* View label — the left column clears the tool strip */}
          <div className={`absolute top-2 z-10 px-1.5 py-0.5 rounded bg-chrome-deep/70 text-[10px] font-medium uppercase tracking-wider text-chrome-muted pointer-events-none select-none ${
            idx % 2 === 0 ? 'left-16' : 'left-2'
          }`}>
            {t(VIEW_LABEL_KEY[view])}
          </div>
        </div>
      ))}
    </div>
  )
}
