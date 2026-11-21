import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import { useProjectStore, isProjectDirty } from '../../store/useProjectStore'
import { answerChangedFile } from '../../services/projectFile'
import { fileNameOf, folderOf } from '../../utils/changedFile'
import { Dialog, Button } from '../ui/Dialog'

/**
 * Startup question: the start restores the auto-save, but the file last opened
 * or saved was changed outside the app since (services/projectFile.ts). Load the
 * file, or keep the app's state; either way the app won't ask about this version
 * again. × / Esc leave it undecided: the next start asks again.
 */
export function ChangedFileDialog() {
  const { t, i18n } = useTranslation()
  const file = useUIStore((s) => s.changedFile)
  const unsaved = useProjectStore(isProjectDirty)
  if (!file) return null

  const locale = i18n.language === 'en' ? 'en-GB' : 'de-DE'
  const when = new Date(file.modifiedAt)
  const date = when.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const folder = folderOf(file.path)

  return (
    <Dialog
      title={t('fileChanged.title')}
      role="alertdialog"
      closeOnBackdrop={false}
      onClose={() => useUIStore.getState().setChangedFile(null)}
      className="w-[520px]"
      footer={<>
        <Button onClick={() => answerChangedFile(false)}>{t('fileChanged.keep')}</Button>
        <Button variant="primary" onClick={() => answerChangedFile(true)}>{t('fileChanged.load')}</Button>
      </>}
    >
      <div className="space-y-3 text-sm" data-testid="changed-file-dialog">
        <p className="font-medium">{t('fileChanged.question')}</p>
        <p className="text-chrome-secondary">
          {t('fileChanged.changedAt', { name: fileNameOf(file.path), date, time })}
        </p>
        {folder && (
          <p className="break-all text-xs text-chrome-hint" title={file.path}>{folder}</p>
        )}
        {unsaved && (
          <p className="rounded border border-accent/40 bg-accent-dim/40 px-3 py-2 text-accent-text">
            {t('fileChanged.unsavedWarning')}
          </p>
        )}
      </div>
    </Dialog>
  )
}
