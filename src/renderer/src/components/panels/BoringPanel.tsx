import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { inferBoringFromHardware } from '../../services/boring-calc'

interface BoringHole {
  boardName: string
  assemblyName: string
  side: 'left' | 'right'
  x: number  // mm from left edge of board
  y: number  // mm from bottom of board
  diameter: number
  depth: number
  inferred?: boolean  // true = from hardware
}

function computeBoringHoles(
  boardName: string,
  assemblyName: string,
  boardWidth: number,
  boardHeight: number,
  spacing: number,
  startOffset: number,
  sideInset: number,
  diameter: number,
  depth: number
): BoringHole[] {
  const holes: BoringHole[] = []
  let y = startOffset
  while (y <= boardHeight - startOffset) {
    holes.push({ boardName, assemblyName, side: 'left',  x: sideInset, y, diameter, depth })
    holes.push({ boardName, assemblyName, side: 'right', x: boardWidth - sideInset, y, diameter, depth })
    y += spacing
  }
  return holes
}

function BoardBoringPreview({ board, holes }: {
  board: { name: string; width: number; height: number }
  holes: BoringHole[]
}) {
  const S = 0.12
  const w = board.width * S
  const h = board.height * S
  const boardHoles = holes.filter((ho) => ho.boardName === board.name)
  return (
    <div className="flex flex-col items-center shrink-0">
      <svg width={w + 8} height={h + 8} className="border border-gray-200 rounded bg-[#f5f0e8]">
        <rect x="4" y="4" width={w} height={h} fill="none" stroke="#999" strokeWidth="0.5"/>
        {boardHoles.map((ho, i) => (
          <circle key={i}
            cx={4 + ho.x * S}
            cy={4 + (board.height - ho.y) * S}
            r={Math.max(1.5, ho.diameter * S / 2)}
            fill={ho.inferred ? '#06b6d4' : ho.side === 'left' ? '#2563eb' : '#7c3aed'}
            opacity={ho.inferred ? 0.9 : 0.75}
          />
        ))}
      </svg>
      <div className="text-[9px] text-gray-500 mt-0.5 truncate max-w-[60px]" title={board.name}>
        {board.name}
      </div>
    </div>
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
  const [autoFromHardware, setAutoFromHardware] = useState(false)

  if (!showBoringPanel) return null

  // Filter to boards taller than minHeight — side panels only, not shelves/backs
  const allBoards = project.assemblies.flatMap((a) =>
    a.boards
      .filter((b) => b.height >= minHeight)
      .map((b) => ({ ...b, assemblyName: a.name }))
  )

  const allHoles: BoringHole[] = allBoards.flatMap((b) => {
    const grid = computeBoringHoles(
      b.name, b.assemblyName,
      b.width, b.height,
      spacing, startOffset, sideInset, diameter, depth
    )
    if (!autoFromHardware) return grid

    // Add hardware-inferred holes (cyan)
    const inferred = inferBoringFromHardware(b).map((ih) => ({
      boardName: b.name,
      assemblyName: b.assemblyName,
      side: 'left' as const,
      x: ih.x,
      y: ih.y,
      diameter: ih.diameter,
      depth: ih.depth,
      inferred: true
    }))
    return [...grid, ...inferred]
  })

  const handleExport = () => {
    const headers = ['Assembly', 'Board', 'Side', 'X (mm)', 'Y (mm)', 'Diameter (mm)', 'Depth (mm)']
    const rows = allHoles.map((h) =>
      [h.assemblyName, h.boardName, h.side, h.x, h.y, h.diameter, h.depth].join(';')
    )
    const csv = [headers.join(';'), ...rows].join('\n')
    const filename = `${project.name}_boring.csv`
    if ((window as any).electronAPI?.fileExportCsv) {
      ;(window as any).electronAPI.fileExportCsv(csv, filename)
    } else {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowBoringPanel(false) }}>
      <div className="bg-white rounded-lg shadow-xl w-[680px] max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">{t('boring.title')}</h2>
          <button onClick={() => setShowBoringPanel(false)} className="text-gray-400 hover:text-gray-700 text-lg">×</button>
        </div>

        <div className="p-4 border-b border-gray-100 flex gap-4 flex-wrap">
          <div>
            <label className="text-xs text-gray-500 block mb-1">{t('boring.spacing')}</label>
            <input type="number" value={spacing} onChange={(e) => setSpacing(Number(e.target.value))}
              className="w-20 text-xs border border-gray-300 rounded px-2 py-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">{t('boring.startOffset')}</label>
            <input type="number" value={startOffset} onChange={(e) => setStartOffset(Number(e.target.value))}
              className="w-20 text-xs border border-gray-300 rounded px-2 py-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">{t('boring.sideInset')}</label>
            <input type="number" value={sideInset} onChange={(e) => setSideInset(Number(e.target.value))}
              className="w-20 text-xs border border-gray-300 rounded px-2 py-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">{t('boring.diameter')}</label>
            <input type="number" value={diameter} onChange={(e) => setDiameter(Number(e.target.value))}
              className="w-20 text-xs border border-gray-300 rounded px-2 py-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">{t('boring.depth')}</label>
            <input type="number" value={depth} onChange={(e) => setDepth(Number(e.target.value))}
              className="w-20 text-xs border border-gray-300 rounded px-2 py-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">{t('boring.minHeight')}</label>
            <input type="number" value={minHeight} onChange={(e) => setMinHeight(Number(e.target.value))}
              className="w-20 text-xs border border-gray-300 rounded px-2 py-1" />
          </div>
          <div className="self-end pb-1.5">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={autoFromHardware}
                onChange={(e) => setAutoFromHardware(e.target.checked)}
                className="w-3 h-3"
              />
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-cyan-500" />
                {i18n.language === 'de' ? 'Auto aus Beschlägen' : 'Auto from hardware'}
              </span>
            </label>
          </div>
        </div>

        {allBoards.length > 0 && (
          <div className="flex gap-3 px-4 py-2 border-b border-gray-100 overflow-x-auto">
            {allBoards.map((b) => (
              <BoardBoringPreview key={b.id} board={b} holes={allHoles} />
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {allHoles.length === 0 ? (
            <p className="text-xs text-gray-400 italic">{t('boring.noBoards')}</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-200 px-2 py-1 text-left">{t('cutting.assembly')}</th>
                  <th className="border border-gray-200 px-2 py-1 text-left">{t('board.name')}</th>
                  <th className="border border-gray-200 px-2 py-1 text-center">{t('boring.side')}</th>
                  <th className="border border-gray-200 px-2 py-1 text-right">X (mm)</th>
                  <th className="border border-gray-200 px-2 py-1 text-right">Y (mm)</th>
                  <th className="border border-gray-200 px-2 py-1 text-right">Ø (mm)</th>
                </tr>
              </thead>
              <tbody>
                {allHoles.map((h, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border border-gray-200 px-2 py-0.5">{h.assemblyName}</td>
                    <td className="border border-gray-200 px-2 py-0.5">{h.boardName}</td>
                    <td className="border border-gray-200 px-2 py-0.5 text-center">{h.side}</td>
                    <td className="border border-gray-200 px-2 py-0.5 text-right">{h.x}</td>
                    <td className="border border-gray-200 px-2 py-0.5 text-right">{h.y}</td>
                    <td className="border border-gray-200 px-2 py-0.5 text-right">{h.diameter}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold">
                  <td colSpan={5} className="border border-gray-200 px-2 py-1">
                    {t('cutting.total')}: {allHoles.length} {t('cutting.pieces')}
                  </td>
                  <td className="border border-gray-200 px-2 py-1"></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="p-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={handleExport}
            disabled={allHoles.length === 0}
            className="text-sm px-4 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {t('boring.export')}
          </button>
          <button
            onClick={() => setShowBoringPanel(false)}
            className="text-sm px-4 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {t('actions.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
