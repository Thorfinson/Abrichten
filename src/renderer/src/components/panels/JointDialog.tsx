import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { create } from 'zustand'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { computeJointPosition } from '../../utils/geometry'
import { MAX_QUANTITY } from '../../utils/validateProject'
import { useDialogFocus } from '../../hooks/useKeyboard'
import { usePartLabels } from '../../hooks/usePartLabels'
import { partTitle } from '../../utils/partLabel'
import { PartName } from '../ui/PartName'
import type { Board, Fastener, FastenerType, Joint, JointType } from '../../types/furniture'

const JOINT_TYPES: JointType[] = ['butt', 'miter', 'dado', 'rabbet', 'dowel', 'biscuit', 'screw', 'pocket_screw', 'lap', 'glued']

/** Fastener kinds with a typical size (diameter × length in mm) to start a new row with. */
const FASTENER_DEFAULTS: Record<FastenerType, { diameter: number; length: number }> = {
  wood_screw: { diameter: 4, length: 40 },
  confirmat: { diameter: 7, length: 50 },
  dowel_pin: { diameter: 8, length: 35 },
  biscuit: { diameter: 4, length: 56 },
  pocket_screw: { diameter: 4, length: 32 },
  angle_bracket: { diameter: 40, length: 40 },
  joist_hanger: { diameter: 60, length: 100 },
  nail: { diameter: 1.2, length: 25 }
}
const FASTENER_TYPES = Object.keys(FASTENER_DEFAULTS) as FastenerType[]

/** Upper bound for a fastener size; the file validator accepts up to MAX_MM. */
const MAX_FASTENER_MM = 1000

const INPUT = 'bg-chrome-deep border border-chrome-border text-chrome-text rounded px-2 py-1.5 text-xs outline-none focus:border-action'

// Edit mode lives here, not in the UI store: the card's joint list opens a joint
// with openJointEditor(); the dialog itself still shows via showJointDialog, so
// Esc and the modal stack treat it like any other dialog.
const useJointEdit = create<{ target: { assemblyId: string; jointId: string } | null }>(() => ({ target: null }))

/** Open the joint dialog for an existing joint (type, fasteners, note). */
export function openJointEditor(assemblyId: string, jointId: string): void {
  useJointEdit.setState({ target: { assemblyId, jointId } })
  useUIStore.getState().setShowJointDialog(true)
}

function newFastener(type: FastenerType = 'wood_screw'): Fastener {
  return { id: crypto.randomUUID(), type, ...FASTENER_DEFAULTS[type], quantity: 4, headType: 'countersunk', material: 'steel' }
}

/** A fastener row as the user left it, brought into the bounds the project file accepts. */
function cleanFastener(f: Fastener): Fastener {
  const size = (v: number, fallback: number): number =>
    Number.isFinite(v) && v > 0 ? Math.min(MAX_FASTENER_MM, Math.round(v * 10) / 10) : fallback
  const d = FASTENER_DEFAULTS[f.type]
  return {
    ...f,
    diameter: size(f.diameter, d.diameter),
    length: size(f.length, d.length),
    quantity: Number.isFinite(f.quantity) ? Math.min(MAX_QUANTITY, Math.max(1, Math.round(f.quantity))) : 1
  }
}

/**
 * Modal dialog for creating a joint between two boards, or editing one
 * (opened from the properties card's joint list via openJointEditor).
 * Controlled by UIStore.showJointDialog.
 * Create: boardA = first selected board; boardB = second selected or user-picked.
 */
export function JointDialog() {
  const showJointDialog    = useUIStore((s) => s.showJointDialog)
  const setShowJointDialog = useUIStore((s) => s.setShowJointDialog)
  const selectedAssemblyId = useUIStore((s) => s.selectedAssemblyId)
  const selectedBoardIds   = useUIStore((s) => s.selectedBoardIds)
  const editTarget         = useJointEdit((s) => s.target)
  const project            = useProjectStore((s) => s.project)

  // Closed by any route (Esc, backdrop, save): the next opening is a create again
  useEffect(() => {
    if (!showJointDialog) useJointEdit.setState({ target: null })
  }, [showJointDialog])

  const owner = editTarget ? project.assemblies.find((a) => a.id === editTarget.assemblyId) : undefined
  const joint = editTarget ? owner?.joints.find((j) => j.id === editTarget.jointId) : undefined
  const assembly = project.assemblies.find((a) => a.id === selectedAssemblyId)
  const boardA = assembly?.boards.find((b) => b.id === selectedBoardIds[0])

  // The joint or selection it was opened for is gone (deselected, deleted, undone):
  // close for real, or it would pop up again on the next board click
  const stale = showJointDialog && (editTarget ? !joint : !boardA)
  useEffect(() => {
    if (stale) setShowJointDialog(false)
  }, [stale, setShowJointDialog])

  if (!showJointDialog || stale) return null
  // Fresh form state on every opening: the form unmounts while the dialog is closed
  if (editTarget && owner && joint) {
    return <JointForm key={joint.id} ownerId={owner.id} joint={joint} />
  }
  return <JointForm key="new" ownerId={assembly!.id} />
}

interface JointFormProps {
  /** Assembly that holds (or will hold) the joint */
  ownerId: string
  /** Existing joint in edit mode; absent when creating */
  joint?: Joint
}

function JointForm({ ownerId, joint }: JointFormProps) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const setShowJointDialog = useUIStore((s) => s.setShowJointDialog)
  const selectedBoardIds   = useUIStore((s) => s.selectedBoardIds)
  const project     = useProjectStore((s) => s.project)
  const labels      = usePartLabels()
  const addJoint    = useProjectStore((s) => s.addJoint)
  const updateJoint = useProjectStore((s) => s.updateJoint)
  const removeJoint = useProjectStore((s) => s.removeJoint)

  const [jointType, setJointType] = useState<JointType>(joint?.type ?? 'butt')
  const [fasteners, setFasteners] = useState<Fastener[]>(joint?.fasteners ?? [])
  const [note, setNote] = useState(joint?.note ?? '')
  const [partnerBoardId, setPartnerBoardId] = useState('')
  const dialogRef = useDialogFocus<HTMLDivElement>(true)

  const editing = joint !== undefined
  const owner = project.assemblies.find((a) => a.id === ownerId)
  const allBoards = project.assemblies.flatMap((a) => a.boards)
  const byId = (id: string | undefined): Board | undefined => allBoards.find((b) => b.id === id)

  // Create: A is the first selected board; B the second selected one or picked here
  const boardA = editing ? byId(joint.boardA) : owner?.boards.find((b) => b.id === selectedBoardIds[0])
  const preselectedB = !editing && selectedBoardIds.length === 2
    ? owner?.boards.find((b) => b.id === selectedBoardIds[1])
    : undefined
  const boardB = editing ? byId(joint.boardB) : preselectedB ?? owner?.boards.find((b) => b.id === partnerBoardId)
  const otherBoards = owner?.boards.filter((b) => b.id !== boardA?.id) ?? []

  const close = () => setShowJointDialog(false)

  const updateFastener = (id: string, updates: Partial<Fastener>) =>
    setFasteners((list) => list.map((f) => (f.id === id ? { ...f, ...updates } : f)))

  const handleSave = () => {
    const values = {
      type: jointType,
      fasteners: fasteners.map(cleanFastener),
      note: note.trim() || undefined
    }
    if (editing) {
      updateJoint(ownerId, joint.id, values)
    } else {
      if (!boardA || !boardB) return
      addJoint(ownerId, { ...values, boardA: boardA.id, boardB: boardB.id, position: computeJointPosition(boardA, boardB) })
    }
    close()
  }

  const handleDelete = () => {
    if (!editing) return
    removeJoint(ownerId, joint.id)
    close()
  }

  const title = editing ? t('func.jointEditTitle') : (lang === 'de' ? 'Verbindung hinzufügen' : 'Add Joint')
  const readonlyBoard = 'text-xs text-chrome-text bg-chrome-surface border border-chrome-border rounded px-2 py-1.5 truncate'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      // pointer-down, not click: a text selection dragged out of the dialog must not close it
      onPointerDown={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="joint-dialog-title"
        tabIndex={-1}
        className="w-[26rem] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] flex flex-col bg-chrome-bg text-chrome-text border border-chrome-border rounded-lg shadow-2xl overflow-hidden outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-chrome-border shrink-0">
          <span id="joint-dialog-title" className="text-sm font-semibold">{title}</span>
          <button
            onClick={close}
            aria-label={t('ui.close')}
            title={t('ui.close')}
            className="text-chrome-muted hover:text-chrome-text text-lg leading-none"
          >×</button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <div className="text-xs text-chrome-secondary mb-1">{lang === 'de' ? 'Bauteil A' : 'Board A'}</div>
              <div className={readonlyBoard}>{boardA ? <PartName label={labels.get(boardA.id)} name={boardA.name} /> : '?'}</div>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-chrome-secondary mb-1">{lang === 'de' ? 'Bauteil B' : 'Board B'}</div>
              {editing || preselectedB ? (
                <div className={readonlyBoard}>{boardB ? <PartName label={labels.get(boardB.id)} name={boardB.name} /> : '?'}</div>
              ) : (
                <select
                  value={partnerBoardId}
                  onChange={(e) => setPartnerBoardId(e.target.value)}
                  className={`w-full ${INPUT}`}
                  aria-label={lang === 'de' ? 'Bauteil B' : 'Board B'}
                >
                  <option value="">{lang === 'de' ? '— Bauteil wählen —' : '— Select board —'}</option>
                  {otherBoards.map((b) => (
                    <option key={b.id} value={b.id}>{partTitle(labels.get(b.id), b.name)}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Joint type */}
          <label className="block">
            <span className="block text-xs text-chrome-secondary mb-1">{lang === 'de' ? 'Verbindungstyp' : 'Joint type'}</span>
            <select
              value={jointType}
              onChange={(e) => setJointType(e.target.value as JointType)}
              className={`w-full ${INPUT}`}
            >
              {JOINT_TYPES.map((type) => (
                <option key={type} value={type}>{t(`joints.${type}`)}</option>
              ))}
            </select>
          </label>

          {/* Fasteners */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-chrome-secondary">{t('joints.fastener')}</span>
              <button
                type="button"
                onClick={() => setFasteners((list) => [...list, newFastener()])}
                className="h-6 px-2 rounded text-[11px] bg-chrome-surface hover:bg-chrome-hover text-chrome-text"
              >
                + {t('func.addFastener')}
              </button>
            </div>
            {fasteners.length === 0 ? (
              <div className="text-[11px] text-chrome-muted">{t('func.noFasteners')}</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-[1fr_3rem_0.6rem_3rem_3rem_1.25rem] gap-1 text-[10px] text-chrome-muted px-0.5">
                  <span>{t('func.fastenerType')}</span>
                  <span>⌀ mm</span>
                  <span />
                  <span>{t('joints.length')}</span>
                  <span>{t('joints.quantity')}</span>
                  <span />
                </div>
                {fasteners.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-[1fr_3rem_0.6rem_3rem_3rem_1.25rem] gap-1 items-center">
                    <select
                      value={f.type}
                      onChange={(e) => {
                        const type = e.target.value as FastenerType
                        updateFastener(f.id, { type, ...FASTENER_DEFAULTS[type] })
                      }}
                      className={`min-w-0 ${INPUT} px-1`}
                      aria-label={`${t('func.fastenerType')} ${i + 1}`}
                    >
                      {FASTENER_TYPES.map((type) => (
                        <option key={type} value={type}>{t(`joints.f_${type}`)}</option>
                      ))}
                    </select>
                    <input
                      type="number" min={0.1} step={0.1} value={Number.isFinite(f.diameter) ? f.diameter : ''}
                      onChange={(e) => updateFastener(f.id, { diameter: e.target.valueAsNumber })}
                      className={`min-w-0 ${INPUT} px-1`}
                      aria-label={`${t('joints.diameter')} ${i + 1}`}
                    />
                    <span className="text-[10px] text-chrome-muted text-center">×</span>
                    <input
                      type="number" min={1} step={1} value={Number.isFinite(f.length) ? f.length : ''}
                      onChange={(e) => updateFastener(f.id, { length: e.target.valueAsNumber })}
                      className={`min-w-0 ${INPUT} px-1`}
                      aria-label={`${t('joints.length')} ${i + 1}`}
                    />
                    <input
                      type="number" min={1} max={MAX_QUANTITY} step={1} value={Number.isFinite(f.quantity) ? f.quantity : ''}
                      onChange={(e) => updateFastener(f.id, { quantity: e.target.valueAsNumber })}
                      className={`min-w-0 ${INPUT} px-1`}
                      aria-label={`${t('joints.quantity')} ${i + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => setFasteners((list) => list.filter((x) => x.id !== f.id))}
                      className="text-chrome-muted hover:text-danger text-sm leading-none"
                      title={t('func.removeFastener')}
                      aria-label={`${t('func.removeFastener')} ${i + 1}`}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Note */}
          <label className="block">
            <span className="block text-xs text-chrome-secondary mb-1">{t('joints.note')}</span>
            <input
              type="text"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('func.notePlaceholder')}
              className={`w-full ${INPUT} placeholder:text-chrome-hint`}
            />
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-chrome-border shrink-0">
          {editing && (
            <button
              onClick={handleDelete}
              className="h-7 px-3 rounded text-xs text-danger hover:bg-chrome-surface transition-colors mr-auto"
            >
              {t('joints.delete')}
            </button>
          )}
          <button
            onClick={close}
            className={`h-7 px-3 rounded text-xs bg-chrome-surface hover:bg-chrome-hover text-chrome-text transition-colors ${editing ? '' : 'ml-auto'}`}
          >
            {lang === 'de' ? 'Abbrechen' : 'Cancel'}
          </button>
          <button
            onClick={handleSave}
            disabled={!boardA || !boardB}
            className="h-7 px-3 rounded text-xs bg-action text-action-text hover:bg-action-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {editing ? t('func.save') : (lang === 'de' ? 'Verbindung erstellen' : 'Create Joint')}
          </button>
        </div>
      </div>
    </div>
  )
}
