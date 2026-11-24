import { useTranslation } from 'react-i18next'
import { useUIStore, WORKSPACES, type Workspace } from '../../store/useUIStore'
import { keyCombo } from '../../utils/shortcutKeys'
import { Icon } from './Icon'

const ICON: Record<Workspace, 'cabinet' | 'assembly'> = {
  design: 'cabinet',
  assembly: 'assembly'
}

/** Colour of the chosen workspace: design blue, assembly amber */
const ACTIVE: Record<Workspace, string> = {
  design: 'bg-action text-action-text',
  assembly: 'bg-ws-assembly text-ws-assembly-text'
}

/**
 * The workspaces as one segmented control in the toolbar: one model, two ways to
 * work on it. ⌘1 / ⌘2 switch too (hooks/useKeyboard).
 */
export function WorkspaceSwitcher() {
  const { t } = useTranslation()
  const workspace = useUIStore((s) => s.workspace)
  const setWorkspace = useUIStore((s) => s.setWorkspace)
  return (
    <div
      role="group"
      aria-label={t('workspace.label')}
      className="flex items-center gap-0.5 p-0.5 rounded-lg border border-chrome-divider bg-chrome-deep"
    >
      {WORKSPACES.map((w, i) => {
        const on = w === workspace
        return (
          <button
            key={w}
            type="button"
            onClick={() => setWorkspace(w)}
            aria-pressed={on}
            aria-label={t(`workspace.${w}`)}
            data-testid={`workspace-${w}`}
            title={`${t(`workspace.${w}Desc`)} (${keyCombo(String(i + 1), ['cmd'])})`}
            className={`h-6 flex items-center gap-1.5 px-2 xl:px-3 rounded-md text-xs font-medium transition-colors ${
              on ? ACTIVE[w] : 'text-chrome-secondary hover:bg-chrome-surface hover:text-chrome-text'
            }`}
          >
            <Icon name={ICON[w]} className="w-3.5 h-3.5" />
            {/* narrow windows: icons only, the name stays in the tooltip and the accessible name */}
            <span className="hidden xl:inline">{t(`workspace.${w}`)}</span>
          </button>
        )
      })}
    </div>
  )
}
