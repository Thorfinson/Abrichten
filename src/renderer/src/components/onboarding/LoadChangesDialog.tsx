import { useTranslation } from 'react-i18next'
import { create } from 'zustand'
import { Dialog, Button } from '../ui/Dialog'

/**
 * What loading changed in the file, in words, one line per change (services/projectFile reportLoadChanges).
 * It stays until it is closed and can be copied: a toast that fades, or sits behind the startup question,
 * was easy to miss (review 24.11.).
 */
export const useLoadReport = create<{ lines: string[] | null; show: (lines: string[]) => void; close: () => void }>((set) => ({
  lines: null,
  show: (lines) => set({ lines }),
  close: () => set({ lines: null })
}))

export function LoadChangesDialog() {
  const { t } = useTranslation()
  const lines = useLoadReport((s) => s.lines)
  const close = useLoadReport((s) => s.close)
  if (!lines) return null
  const copy = () => { navigator.clipboard?.writeText(lines.join('\n')).catch(() => {}) }
  return (
    <div className="relative z-[60]" data-testid="load-changes">
      <Dialog
        title={t('actions.loadChangesTitle', { count: lines.length })}
        onClose={close}
        footer={
          <>
            <Button onClick={copy}>{t('actions.loadChangesCopy')}</Button>
            <Button variant="primary" onClick={close}>{t('actions.loadChangesOk')}</Button>
          </>
        }
      >
        <p className="text-xs text-chrome-secondary mb-2">{t('actions.loadChangesIntro')}</p>
        <ul className="text-xs space-y-1 list-disc pl-4 select-text">
          {lines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </Dialog>
    </div>
  )
}
