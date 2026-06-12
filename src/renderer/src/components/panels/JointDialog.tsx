import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { computeJointPosition } from '../../utils/geometry'
import type { JointType } from '../../types/furniture'

const JOINT_TYPES: JointType[] = ['butt', 'miter', 'dado', 'rabbet', 'dowel', 'biscuit', 'screw', 'pocket_screw']

/**
 * Modal dialog for creating a joint between two boards.
 * Controlled by UIStore.showJointDialog.
 * boardA = first selected board; boardB = second selected or user-picked.
 */
export function JointDialog() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'

  const showJointDialog   = useUIStore((s) => s.showJointDialog)
  const setShowJointDialog = useUIStore((s) => s.setShowJointDialog)
  const selectedAssemblyId = useUIStore((s) => s.selectedAssemblyId)
  const selectedBoardIds   = useUIStore((s) => s.selectedBoardIds)

  const project    = useProjectStore((s) => s.project)
  const addJoint   = useProjectStore((s) => s.addJoint)

  const [jointType, setJointType] = useState<JointType>('butt')
  const [partnerBoardId, setPartnerBoardId] = useState('')

  if (!showJointDialog) return null

  const assembly = project.assemblies.find((a) => a.id === selectedAssemblyId)
  if (!assembly) return null

  const boardA = assembly.boards.find((b) => b.id === selectedBoardIds[0])
  if (!boardA) return null

  // If 2 boards selected, boardB is pre-determined
  const preselectedBoardB = selectedBoardIds.length === 2
    ? assembly.boards.find((b) => b.id === selectedBoardIds[1])
    : undefined

  const effectiveBoardBId = preselectedBoardB ? preselectedBoardB.id : partnerBoardId
  const boardB = assembly.boards.find((b) => b.id === effectiveBoardBId)

  const otherBoards = assembly.boards.filter((b) => b.id !== boardA.id)

  const jointTypeLabel = (type: JointType): string => {
    const labels: Record<JointType, Record<'de' | 'en', string>> = {
      butt:         { de: 'Stumpf',          en: 'Butt' },
      miter:        { de: 'Gehrung',          en: 'Miter' },
      dado:         { de: 'Nut',              en: 'Dado' },
      rabbet:       { de: 'Falz',             en: 'Rabbet' },
      dowel:        { de: 'Dübel',            en: 'Dowel' },
      biscuit:      { de: 'Lamello',          en: 'Biscuit' },
      screw:        { de: 'Verschraubt',      en: 'Screw' },
      pocket_screw: { de: 'Taschenschraube',  en: 'Pocket Screw' },
    }
    return labels[type][lang]
  }

  const handleAdd = () => {
    if (!boardB) return
    const position = computeJointPosition(boardA, boardB)
    addJoint(assembly.id, {
      type: jointType,
      boardA: boardA.id,
      boardB: boardB.id,
      position,
      fasteners: []
    })
    setShowJointDialog(false)
    setPartnerBoardId('')
  }

  const handleClose = () => {
    setShowJointDialog(false)
    setPartnerBoardId('')
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={handleClose} />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div
          className="pointer-events-auto w-80 bg-chrome-bg border border-chrome-border rounded-lg shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-chrome-border">
            <span className="text-sm font-semibold text-chrome-text">
              {lang === 'de' ? 'Verbindung hinzufügen' : 'Add Joint'}
            </span>
            <button
              onClick={handleClose}
              className="text-chrome-muted hover:text-chrome-text text-lg leading-none"
            >×</button>
          </div>

          {/* Body */}
          <div className="p-4 flex flex-col gap-3">
            {/* Board A (fixed) */}
            <div>
              <label className="block text-xs text-chrome-muted mb-1">
                {lang === 'de' ? 'Bauteil A' : 'Board A'}
              </label>
              <div className="text-xs text-chrome-text bg-chrome-surface border border-chrome-border rounded px-2 py-1.5">
                {boardA.name}
              </div>
            </div>

            {/* Board B (pre-selected or dropdown) */}
            <div>
              <label className="block text-xs text-chrome-muted mb-1">
                {lang === 'de' ? 'Bauteil B' : 'Board B'}
              </label>
              {preselectedBoardB ? (
                <div className="text-xs text-chrome-text bg-chrome-surface border border-chrome-border rounded px-2 py-1.5">
                  {preselectedBoardB.name}
                </div>
              ) : (
                <select
                  value={partnerBoardId}
                  onChange={(e) => setPartnerBoardId(e.target.value)}
                  className="w-full text-xs bg-chrome-surface border border-chrome-border text-chrome-text rounded px-2 py-1.5 outline-none focus:border-action"
                >
                  <option value="">
                    {lang === 'de' ? '— Bauteil wählen —' : '— Select board —'}
                  </option>
                  {otherBoards.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Joint type */}
            <div>
              <label className="block text-xs text-chrome-muted mb-1">
                {lang === 'de' ? 'Verbindungstyp' : 'Joint type'}
              </label>
              <select
                value={jointType}
                onChange={(e) => setJointType(e.target.value as JointType)}
                className="w-full text-xs bg-chrome-surface border border-chrome-border text-chrome-text rounded px-2 py-1.5 outline-none focus:border-action"
              >
                {JOINT_TYPES.map((type) => (
                  <option key={type} value={type}>{jointTypeLabel(type)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-chrome-border bg-chrome-surface">
            <button
              onClick={handleClose}
              className="h-7 px-3 rounded text-xs text-chrome-secondary hover:bg-chrome-hover transition-colors"
            >
              {lang === 'de' ? 'Abbrechen' : 'Cancel'}
            </button>
            <button
              onClick={handleAdd}
              disabled={!boardB}
              className="h-7 px-3 rounded text-xs bg-action text-action-text hover:bg-action-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {lang === 'de' ? 'Verbindung erstellen' : 'Create Joint'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
