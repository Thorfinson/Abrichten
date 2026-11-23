import { useTranslation } from 'react-i18next'
import { designLockedIn, useUIStore } from '../store/useUIStore'
import { keyCombo } from '../utils/shortcutKeys'

/** The shortcut back to the design workspace (⌘1), named in every hint. */
export const designKey = (): string => keyCombo('1', ['cmd'])

/**
 * The design is read-only now (the assembly workspace, store/designLock.ts). A control
 * that would change the design is left out or greyed while this is true; the project
 * store refuses such a change anyway, this keeps the screen honest about it.
 */
export function useDesignLocked(): boolean {
  return useUIStore(designLockedIn)
}

/** "im Entwurf (⌘1)" and the longer read-only tooltip, in the current language. */
export function useDesignHint(): { inDesign: string; readOnly: string; hint: string } {
  const { t } = useTranslation()
  const key = designKey()
  return { inDesign: t('designLock.inDesign', { key }), readOnly: t('designLock.readOnly', { key }), hint: t('designLock.hint', { key }) }
}
