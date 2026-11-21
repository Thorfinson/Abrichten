import i18n from '../i18n'
import { useProjectStore } from '../store/useProjectStore'
import { useUIStore } from '../store/useUIStore'
import { keyCombo } from '../utils/shortcutKeys'

/**
 * "Teilenummern neu vergeben" (cutting list, command palette): asks first, because
 * parts already labelled in the workshop no longer match afterwards. One undo step.
 */
export function renumberPartsAsked(): boolean {
  if (!window.confirm(i18n.t('partLabel.renumberConfirm'))) return false
  useProjectStore.getState().renumberParts()
  useUIStore.getState().setExportStatus(i18n.t('partLabel.renumbered', { undo: keyCombo('Z', ['cmd']) }))
  return true
}

/** Change an assembly's short word; a word another assembly already uses is refused with a message. */
export function setShortNameTold(assemblyId: string, value: string): boolean {
  const ok = useProjectStore.getState().setAssemblyShortName(assemblyId, value)
  if (!ok) useUIStore.getState().setExportStatus(i18n.t('partLabel.taken', { word: value.trim() }))
  return ok
}
