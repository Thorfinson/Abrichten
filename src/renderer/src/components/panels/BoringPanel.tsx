import { useState } from 'react'
import { activeAssemblies } from '../../utils/activeParts'
import { assemblyPath } from '../../utils/assemblyTree'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { inferBoringFromHardware, systemBoringRows } from '../../services/boring-calc'
import { uprightFace, boardFace } from '../../utils/boardFace'
import { worldAligned } from '../../utils/projection'
import type { Board } from '../../types/furniture'
import { csvCell } from '../../utils/textSafety'
import { partLabels } from '../../utils/partLabel'
import { getCsvDelimiter } from '../layout/SettingsDialog'
import { Dialog, Button, FIELD_CLASS, LABEL_CLASS, TH_CLASS, TD_CLASS, CHECK_CLASS } from '../ui/Dialog'

/** Which hole row: the system rows at the left / right edge of the face, or a hardware bore */
type HoleRow = 'left' | 'right' | 'hardware'

interface BoringHole {
  boardId: string
  boardName: string
  /** Part label, "Herd 2" (utils/partLabel) */
  label: string
  assemblyName: string
  row: HoleRow
  x: number  // mm from left edge of the board face
  y: number  // mm from bottom of the board face
  diameter: number
  depth: number
}

/** Hole colours, shared by the previews and the legend */
const ROW_COLOR: Record<HoleRow, string> = {
  left: '#60a5fa',      // info
  right: '#f59e0b',     // accent
  hardware: '#10b981'   // success
}

/** Height of the tallest preview in px; every board uses the same scale */
const PREVIEW_HEIGHT_PX = 120
const PREVIEW_PAD = 6

function BoardBoringPreview({ board, holes, scale }: {
  board: { id: string; name: string; label: string; width: number; height: number; depth: number }
  holes: BoringHole[]
  scale: number
}) {
  const face = uprightFace(board)
  const w = face.x * scale
  const h = face.y * scale
  const boardHoles = holes.filter((ho) => ho.boardId === board.id)
  return (
    <figure className="flex shrink-0 flex-col items-center gap-1">
      <svg width={w + 2 * PREVIEW_PAD} height={h + 2 * PREVIEW_PAD} role="img" aria-label={`${board.name}: ${boardHoles.length}`}>
        <rect x={PREVIEW_PAD} y={PREVIEW_PAD} width={w} height={h} rx={1} fill="#d9c6a5" stroke="#a1a1aa" strokeWidth={0.75} />
        {boardHoles.map((ho, i) => (
          <circle key={i}
            cx={PREVIEW_PAD + ho.x * scale}
            cy={PREVIEW_PAD + (face.y - ho.y) * scale}
            r={Math.max(1.75, (ho.diameter * scale) / 2)}
            fill={ROW_COLOR[ho.row]}
            stroke="#18181b"
            strokeWidth={0.5}
          />
        ))}
      </svg>
      <figcaption className="max-w-[140px] text-center text-[11px] leading-tight">
        <div className="truncate text-chrome-text" title={board.name}><span className="font-mono font-semibold">{board.label}</span> {board.name}</div>
        <div className="font-mono text-chrome-muted">{face.x} × {face.y}</div>
      </figcaption>
    </figure>
  )
}

export function BoringPanel() {
  const { t, i18n } = useTranslation()
  const project = useProjectStore((s) => s.project)
  const showBoringPanel = useUIStore((s) => s.showBoringPanel)
  const setShowBoringPanel = useUIStore((s) => s.setShowBoringPanel)

  const [spacing, setSpacing] = useState(32)
  const [startOffset, setStartOffset] = useState(37)
  const [sideInset, setSideInset] = useState(37)
  const [minHeight, setMinHeight] = useState(400)
  const [diameter, setDiameter] = useState(5)
  const [depth, setDepth] = useState(12)
  // null = automatic: on as soon as any board carries hardware (e.g. hinges from the calculator)
  const [autoChoice, setAutoFromHardware] = useState<boolean | null>(null)
  const autoFromHardware = autoChoice ?? project.assemblies.some((a) => a.boards.some((b) => b.hardware?.length))

  if (!showBoringPanel) return null

  const rowLabel = (row: HoleRow): string =>
    t(row === 'left' ? 'dlg.rowLeft' : row === 'right' ? 'dlg.rowRight' : 'dlg.rowHardware')

  // Side panels only: standing at least minHeight tall with their thickness across x
  // (a back panel stands too, but its thickness runs front to back — no shelf pins there)
  const isSidePanel = (b: Board): boolean => {
    const w = worldAligned(b)
    return w.height >= minHeight && boardFace(w).thicknessAxis === 'width'
  }
  const labels = partLabels(project.assemblies)
  const allBoards = activeAssemblies(project).flatMap((a) =>
    a.boards
      .filter(isSidePanel)
      .map((b) => ({ ...b, assemblyName: assemblyPath(project.assemblies, a.id), label: labels.get(b.id) ?? '' }))
  )

  const allHoles: BoringHole[] = allBoards.flatMap((b) => {
    // spacing is clamped and the row count capped in systemBoringRows (an empty field is 0)
    const grid: BoringHole[] = systemBoringRows(b, { spacing, startOffset, sideInset, diameter, depth })
      .map(({ side, ...h }) => ({ ...h, row: side, boardId: b.id, boardName: b.name, label: b.label, assemblyName: b.assemblyName }))
    if (!autoFromHardware) return grid

    // Add hardware-inferred holes
    const inferred = inferBoringFromHardware(b).map((ih): BoringHole => ({
      boardId: b.id,
      boardName: b.name,
      label: b.label,
      assemblyName: b.assemblyName,
      row: 'hardware',
      x: ih.x,
      y: ih.y,
      diameter: ih.diameter,
      depth: ih.depth
    }))
    return [...grid, ...inferred]
  })

  // One scale for all previews, so their sizes compare
  const tallest = Math.max(1, ...allBoards.map((b) => uprightFace(b).y))
  const previewScale = PREVIEW_HEIGHT_PX / tallest

  const handleExport = () => {
    const sep = getCsvDelimiter()
    const headers = [t('partLabel.nr'), t('cutting.assembly'), t('board.name'), t('boring.side'), 'X (mm)', 'Y (mm)', 'Ø (mm)', t('boring.depth')]
    const rows = allHoles.map((h) =>
      [h.label, h.assemblyName, h.boardName, rowLabel(h.row), h.x, h.y, h.diameter, h.depth].map(csvCell).join(sep)
    )
    const csv = [headers.map(csvCell).join(sep), ...rows].join('\n')
    const filename = `${project.name}_boring.csv`
    if ((window as any).electronAPI?.fileExport) {
      ;(window as any).electronAPI.fileExport(csv, filename)
    } else {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  const field = (label: string, value: number, set: (v: number) => void, min?: number) => (
    <label>
      <span className={LABEL_CLASS}>{label}</span>
      <input type="number" min={min} value={value} onChange={(e) => set(Number(e.target.value))}
        className={`${FIELD_CLASS} w-24 text-right`} />
    </label>
  )
  const num = `${TD_CLASS} text-right font-mono tabular-nums`

  return (
    <Dialog
      title={t('boring.title')}
      titleId="boring-panel-title"
      onClose={() => setShowBoringPanel(false)}
      className="w-[820px]"
      footer={<>
        <span className="mr-auto text-xs text-chrome-muted">
          {t('cutting.total')}: <span className="font-mono text-chrome-text">{allHoles.length}</span> {t('dlg.holes')}
        </span>
        <Button variant="primary" onClick={handleExport} disabled={allHoles.length === 0}>{t('boring.export')}</Button>
        <Button onClick={() => setShowBoringPanel(false)}>{t('ui.close')}</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          {field(t('boring.spacing'), spacing, setSpacing, 1)}
          {field(t('boring.startOffset'), startOffset, setStartOffset)}
          {field(t('boring.sideInset'), sideInset, setSideInset)}
          {field(t('boring.diameter'), diameter, setDiameter)}
          {field(t('boring.depth'), depth, setDepth)}
          {field(t('dlg.minHeight'), minHeight, setMinHeight)}
          <label className="flex cursor-pointer items-center gap-1.5 pb-1.5 text-xs text-chrome-secondary">
            <input
              type="checkbox"
              checked={autoFromHardware}
              onChange={(e) => setAutoFromHardware(e.target.checked)}
              className={CHECK_CLASS}
            />
            {i18n.language === 'de' ? 'Auto aus Beschlägen' : 'Auto from hardware'}
          </label>
        </div>

        {allBoards.length > 0 && (
          <section className="rounded border border-chrome-border bg-chrome-deep/60 p-3">
            <div className="flex gap-5 overflow-x-auto pb-1">
              {allBoards.map((b) => (
                <BoardBoringPreview key={b.id} board={b} holes={allHoles} scale={previewScale} />
              ))}
            </div>
            <div className="mt-2 flex gap-4 text-[11px] text-chrome-muted">
              {(['left', 'right', ...(autoFromHardware ? ['hardware' as const] : [])] as HoleRow[]).map((row) => (
                <span key={row} className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: ROW_COLOR[row] }} />
                  {rowLabel(row)}
                </span>
              ))}
              <span className="ml-auto text-chrome-hint">{t('dlg.boringFaceHint')}</span>
            </div>
          </section>
        )}

        {allHoles.length === 0 ? (
          <p className="text-xs italic text-chrome-hint">{t('dlg.boringNoBoards', { min: minHeight })}</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={TH_CLASS}>{t('partLabel.nr')}</th>
                <th className={TH_CLASS}>{t('cutting.assembly')}</th>
                <th className={TH_CLASS}>{t('board.name')}</th>
                <th className={TH_CLASS}>{t('boring.side')}</th>
                <th className={`${TH_CLASS} text-right`}>X (mm)</th>
                <th className={`${TH_CLASS} text-right`}>Y (mm)</th>
                <th className={`${TH_CLASS} text-right`}>Ø (mm)</th>
              </tr>
            </thead>
            <tbody>
              {allHoles.map((h, i) => (
                <tr key={i} className="hover:bg-chrome-surface/40">
                  <td className={`${TD_CLASS} whitespace-nowrap font-mono`}>{h.label}</td>
                  <td className={`${TD_CLASS} text-chrome-secondary`}>{h.assemblyName}</td>
                  <td className={TD_CLASS}>{h.boardName}</td>
                  <td className={TD_CLASS}>
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: ROW_COLOR[h.row] }} aria-hidden="true" />
                    {rowLabel(h.row)}
                  </td>
                  <td className={num}>{h.x}</td>
                  <td className={num}>{h.y}</td>
                  <td className={num}>{h.diameter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Dialog>
  )
}
