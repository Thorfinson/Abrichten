import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { formulaParams, isParamName } from '../../utils/formulaEval'
import { Dialog, Button, FIELD_CLASS, LABEL_CLASS, TH_CLASS, TD_CLASS } from '../ui/Dialog'
import { useDesignLocked } from '../../hooks/useDesignLocked'

/** Count how many boards reference a parameter in their formula strings */
function countUsage(paramName: string, assemblies: { boards: { widthFormula?: string; heightFormula?: string; depthFormula?: string }[] }[]): number {
  let count = 0
  const uses = (f?: string) => !!f && formulaParams(f).includes(paramName)
  for (const asm of assemblies) {
    for (const b of asm.boards) {
      if (uses(b.widthFormula) || uses(b.heightFormula) || uses(b.depthFormula)) {
        count++
      }
    }
  }
  return count
}

export function ParametersPanel() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const project = useProjectStore((s) => s.project)
  const setParameter = useProjectStore((s) => s.setParameter)
  const removeParameter = useProjectStore((s) => s.removeParameter)
  const renameParameter = useProjectStore((s) => s.renameParameter)
  const showParametersPanel = useUIStore((s) => s.showParametersPanel)
  const setShowParametersPanel = useUIStore((s) => s.setShowParametersPanel)

  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [renamingParam, setRenamingParam] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  const params = project.parameters ?? {}
  const entries = Object.entries(params)

  // Usage counts: how many boards use each parameter in formulas
  const usageCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const [name] of entries) {
      map[name] = countUsage(name, project.assemblies)
    }
    return map
  }, [entries, project.assemblies])

  // a tool of the design: not in the assembly workspace (store/designLock.ts)
  const locked = useDesignLocked()
  if (locked || !showParametersPanel) return null

  const handleAdd = () => {
    const name = newName.trim()
    const val = parseFloat(newValue)
    if (!name || isNaN(val)) return
    if (!isParamName(name)) { setNameError(t('store.paramInvalidName')); return }
    setNameError(null)
    setParameter(name, val)
    setNewName('')
    setNewValue('')
  }

  const startRename = (name: string) => {
    setRenamingParam(name)
    setRenameText(name)
    setNameError(null)
  }

  const commitRename = (oldName: string) => {
    const newN = renameText.trim()
    if (!newN || newN === oldName) { setRenamingParam(null); return }
    // keep the field open so the name can be corrected
    if (!isParamName(newN)) { setNameError(t('store.paramInvalidName')); return }
    if (Object.hasOwn(params, newN)) { setNameError(t('store.paramExists', { name: newN })); return }
    renameParameter(oldName, newN)
    setNameError(null)
    setRenamingParam(null)
  }

  return (
    <Dialog
      title={t('parameters.title')}
      titleId="parameters-title"
      onClose={() => setShowParametersPanel(false)}
      className="w-[520px]"
      footer={<Button onClick={() => setShowParametersPanel(false)}>{t('ui.close')}</Button>}
    >
      <p className="mb-3 text-xs leading-relaxed text-chrome-secondary">
        {t('dlg.paramsHint')}{' '}
        <code className="rounded bg-chrome-deep px-1 py-px font-mono text-accent">=H-18</code>{' '}
        <code className="rounded bg-chrome-deep px-1 py-px font-mono text-accent">=B/2</code>
      </p>

      {entries.length === 0 ? (
        <p className="mb-3 text-xs italic text-chrome-hint">{t('parameters.noParams')}</p>
      ) : (
        <table className="mb-3 w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={TH_CLASS}>{t('parameters.name')}</th>
              <th className={`${TH_CLASS} text-right`}>{t('parameters.value')}</th>
              <th className={`${TH_CLASS} text-center`}>
                {lang === 'de' ? 'Bauteile' : 'Boards'}
              </th>
              <th className={`${TH_CLASS} w-8`}><span className="sr-only">{t('parameters.delete')}</span></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([name, value]) => (
              <tr key={name} className="hover:bg-chrome-surface/40">
                {/* Name — double-click to rename inline */}
                <td className={`${TD_CLASS} font-mono font-bold text-accent`}>
                  {renamingParam === name ? (
                    <input
                      autoFocus
                      type="text"
                      value={renameText}
                      aria-label={t('actions.rename')}
                      onChange={(e) => setRenameText(e.target.value)}
                      onBlur={() => commitRename(name)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(name)
                        // preventDefault: Esc cancels the rename only, the global handler keeps the panel open
                        if (e.key === 'Escape') { e.preventDefault(); setRenamingParam(null); setNameError(null) }
                      }}
                      className={`${FIELD_CLASS} w-full font-mono`}
                    />
                  ) : (
                    <span
                      onDoubleClick={() => startRename(name)}
                      className="cursor-text select-none"
                      title={lang === 'de' ? 'Doppelklick zum Umbenennen' : 'Double-click to rename'}
                    >
                      {name}
                    </span>
                  )}
                </td>
                <td className={`${TD_CLASS} text-right`}>
                  <input
                    type="number"
                    key={value} /* remount so undo shows the restored value */
                    defaultValue={value}
                    aria-label={`${t('parameters.value')} ${name}`}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value)
                      if (!isNaN(v)) setParameter(name, v)
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    className={`${FIELD_CLASS} w-full text-right font-mono`}
                  />
                </td>
                {/* Usage badge */}
                <td className={`${TD_CLASS} text-center`}>
                  {usageCounts[name] > 0 ? (
                    <span
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-chrome-surface px-1.5 text-xs font-bold text-chrome-text"
                      title={`${lang === 'de' ? 'Verwendet in' : 'Used in'} ${usageCounts[name]} ${lang === 'de' ? 'Bauteil(en)' : 'board(s)'}`}
                    >
                      {usageCounts[name]}
                    </span>
                  ) : (
                    <span className="text-xs text-chrome-hint">—</span>
                  )}
                </td>
                <td className={`${TD_CLASS} text-center`}>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => removeParameter(name)}
                    aria-label={`${t('parameters.delete')} ${name}`}
                    title={usageCounts[name] > 0 ? t('store.paramRemoveUnlinks', { name, count: usageCounts[name] }) : t('parameters.delete')}
                  >
                    ×
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {nameError && <p role="alert" className="mb-2 text-xs text-danger">{nameError}</p>}

      {/* Add new parameter */}
      <div className="flex items-end gap-2 border-t border-chrome-border pt-3">
        <label className="flex-1">
          <span className={LABEL_CLASS}>{t('parameters.name')}</span>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('dlg.paramNamePlaceholder')}
            className={`${FIELD_CLASS} w-full font-mono`}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          />
        </label>
        <label className="w-28">
          <span className={LABEL_CLASS}>{t('parameters.value')}</span>
          <input
            type="number"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="720"
            className={`${FIELD_CLASS} w-full text-right`}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          />
        </label>
        <Button variant="primary" onClick={handleAdd} disabled={!newName.trim() || !newValue}>
          {t('parameters.add')}
        </Button>
      </div>

      {entries.length > 0 && (
        <p className="mt-2 text-[11px] text-chrome-hint">
          {lang === 'de'
            ? 'Doppelklick auf den Namen zum Umbenennen — alle Formeln werden aktualisiert.'
            : 'Double-click a name to rename — all formulas update automatically.'}
        </p>
      )}
    </Dialog>
  )
}
