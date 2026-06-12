import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'

/** Count how many boards reference a parameter in their formula strings */
function countUsage(paramName: string, assemblies: { boards: { widthFormula?: string; heightFormula?: string; depthFormula?: string }[] }[]): number {
  let count = 0
  const re = new RegExp(`\\b${paramName}\\b`)
  for (const asm of assemblies) {
    for (const b of asm.boards) {
      if ((b.widthFormula && re.test(b.widthFormula)) ||
          (b.heightFormula && re.test(b.heightFormula)) ||
          (b.depthFormula && re.test(b.depthFormula))) {
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

  if (!showParametersPanel) return null

  const handleAdd = () => {
    const name = newName.trim()
    const val = parseFloat(newValue)
    if (!name || isNaN(val)) return
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return
    setParameter(name, val)
    setNewName('')
    setNewValue('')
  }

  const startRename = (name: string) => {
    setRenamingParam(name)
    setRenameText(name)
  }

  const commitRename = (oldName: string) => {
    const newN = renameText.trim()
    if (newN && newN !== oldName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(newN)) {
      renameParameter(oldName, newN)
    }
    setRenamingParam(null)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowParametersPanel(false) }}>
      <div className="bg-white rounded-lg shadow-xl w-[480px] max-h-[70vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">{t('parameters.title')}</h2>
          <button
            onClick={() => setShowParametersPanel(false)}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-xs text-gray-500 mb-3 italic">{t('parameters.hint')}</p>

          {entries.length === 0 ? (
            <p className="text-xs text-gray-400 italic">{t('parameters.noParams')}</p>
          ) : (
            <table className="w-full text-xs border-collapse mb-3">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-1 text-left">{t('parameters.name')}</th>
                  <th className="border border-gray-300 px-2 py-1 text-right">{t('parameters.value')}</th>
                  <th className="border border-gray-300 px-2 py-1 text-center text-xs">
                    {lang === 'de' ? 'Bauteile' : 'Boards'}
                  </th>
                  <th className="border border-gray-300 px-2 py-1 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map(([name, value]) => (
                  <tr key={name} className="hover:bg-gray-50">
                    {/* Name — double-click to rename inline */}
                    <td className="border border-gray-300 px-2 py-1 font-mono font-bold text-blue-700">
                      {renamingParam === name ? (
                        <input
                          autoFocus
                          type="text"
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onBlur={() => commitRename(name)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(name)
                            if (e.key === 'Escape') setRenamingParam(null)
                          }}
                          className="w-full text-xs font-mono border border-blue-400 rounded px-1 py-0.5 bg-blue-50"
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
                    <td className="border border-gray-300 px-2 py-1 text-right">
                      <input
                        type="number"
                        defaultValue={value}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value)
                          if (!isNaN(v)) setParameter(name, v)
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        className="w-full text-right text-xs border border-gray-300 rounded px-1 py-0.5"
                      />
                    </td>
                    {/* Usage badge */}
                    <td className="border border-gray-300 px-2 py-1 text-center">
                      {usageCounts[name] > 0 ? (
                        <span
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold"
                          title={`${lang === 'de' ? 'Verwendet in' : 'Used in'} ${usageCounts[name]} ${lang === 'de' ? 'Bauteil(en)' : 'board(s)'}`}
                        >
                          {usageCounts[name]}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 text-center">
                      <button
                        onClick={() => removeParameter(name)}
                        className="text-red-500 hover:text-red-700 text-xs"
                        title={t('parameters.delete')}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Add new parameter */}
          <div className="flex gap-2 items-end border-t border-gray-200 pt-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500 block mb-1">{t('parameters.name')}</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. H, B, TIEFE"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1 font-mono"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              />
            </div>
            <div className="w-24">
              <label className="text-xs text-gray-500 block mb-1">{t('parameters.value')}</label>
              <input
                type="number"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="720"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || !newValue}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 mb-0.5"
            >
              {t('parameters.add')}
            </button>
          </div>

          {entries.length > 0 && (
            <p className="text-xs text-gray-400 italic mt-2">
              {lang === 'de'
                ? 'Doppelklick auf den Namen zum Umbenennen — alle Formeln werden aktualisiert.'
                : 'Double-click a name to rename — all formulas update automatically.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
