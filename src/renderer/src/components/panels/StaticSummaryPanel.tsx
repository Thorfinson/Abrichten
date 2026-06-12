import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { getMaterialById } from '../../data/materials'
import { calculateStatic } from '../../services/static-calc'
import type { StaticRating } from '../../services/static-calc'

const RATING_COLOR: Record<StaticRating, string> = {
  ok:       'text-green-700 bg-green-50',
  warning:  'text-amber-700 bg-amber-50',
  critical: 'text-red-700   bg-red-50',
}

const RATING_ORDER: Record<StaticRating, number> = { critical: 0, warning: 1, ok: 2 }

interface SummaryRow {
  boardName: string
  assemblyName: string
  spanMm: number
  thicknessMm: number
  deflectionMm: number
  allowableMm: number
  minThicknessMm: number
  rating: StaticRating
}

export function StaticSummaryPanel() {
  const { i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'

  const project = useProjectStore((s) => s.project)
  const showStaticSummary = useUIStore((s) => s.showStaticSummary)
  const setShowStaticSummary = useUIStore((s) => s.setShowStaticSummary)
  const userLoadKg = useUIStore((s) => s.staticLoadKg)

  const [onlyIssues, setOnlyIssues] = useState(false)

  const allBoards = useMemo(() =>
    project.assemblies
      .filter((a) => a.visible !== false)
      .flatMap((a) => a.boards.map((b) => ({ board: b, assemblyName: a.name }))),
    [project.assemblies]
  )

  const rows = useMemo<SummaryRow[]>(() => {
    const result: SummaryRow[] = []
    for (const { board, assemblyName } of allBoards) {
      const mat = getMaterialById(board.materialId)
      if (!mat) continue
      if (mat.category === 'glass' || mat.category === 'metal') continue

      const thickness = Math.min(board.height, board.depth)
      const r = calculateStatic(board.width, board.depth, thickness, userLoadKg, mat)

      result.push({
        boardName: board.name,
        assemblyName,
        spanMm: board.width,
        thicknessMm: r.currentThicknessMm,
        deflectionMm: r.deflectionMm,
        allowableMm: r.allowableDeflectionMm,
        minThicknessMm: r.minThicknessMm,
        rating: r.rating
      })
    }
    result.sort((a, b) => RATING_ORDER[a.rating] - RATING_ORDER[b.rating])
    return result
  }, [allBoards, userLoadKg])

  if (!showStaticSummary) return null

  const displayed = onlyIssues ? rows.filter((r) => r.rating !== 'ok') : rows
  const critCount = rows.filter((r) => r.rating === 'critical').length
  const warnCount = rows.filter((r) => r.rating === 'warning').length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowStaticSummary(false) }}>
      <div className="bg-white rounded-lg shadow-xl w-[720px] max-h-[85vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center gap-3 shrink-0">
          <h2 className="text-sm font-bold text-gray-800 flex-1">
            {lang === 'de' ? 'Statik-Übersicht' : 'Static Summary'}
          </h2>
          {critCount > 0 && (
            <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">
              {critCount} {lang === 'de' ? 'Kritisch' : 'Critical'}
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
              {warnCount} {lang === 'de' ? 'Warnung' : 'Warning'}
            </span>
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyIssues}
              onChange={(e) => setOnlyIssues(e.target.checked)}
              className="rounded"
            />
            {lang === 'de' ? 'Nur Probleme' : 'Issues only'}
          </label>
          <button onClick={() => setShowStaticSummary(false)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
        </div>

        {/* User load note */}
        <div className="px-4 py-2 border-b border-gray-100 text-xs text-gray-500 shrink-0">
          {lang === 'de' ? `Nutzlast: ${userLoadKg} kg (einstellbar in der Statusleiste)` : `User load: ${userLoadKg} kg (adjustable in status bar)`}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {displayed.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              {onlyIssues
                ? (lang === 'de' ? 'Keine Probleme gefunden!' : 'No issues found!')
                : (lang === 'de' ? 'Keine Bauteile vorhanden.' : 'No boards to analyze.')}
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-gray-100 z-10">
                <tr>
                  <th className="border border-gray-200 px-2 py-1.5 text-left">{lang === 'de' ? 'Bauteil' : 'Part'}</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-left">{lang === 'de' ? 'Gruppe' : 'Assembly'}</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-right">{lang === 'de' ? 'Stützweite' : 'Span'} (mm)</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-right">{lang === 'de' ? 'Stärke' : 'Thickness'} (mm)</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-right">{lang === 'de' ? 'Durchbiegung' : 'Deflection'} (mm)</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-right">{lang === 'de' ? 'Zulässig' : 'Allowable'} (mm)</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-right">{lang === 'de' ? 'Min. Stärke' : 'Min. Thickness'} (mm)</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-center">{lang === 'de' ? 'Bewertung' : 'Rating'}</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((r, i) => (
                  <tr key={i} className={r.rating !== 'ok' ? 'bg-red-50/30' : ''}>
                    <td className="border border-gray-200 px-2 py-1 font-medium">{r.boardName}</td>
                    <td className="border border-gray-200 px-2 py-1 text-gray-500">{r.assemblyName}</td>
                    <td className="border border-gray-200 px-2 py-1 text-right font-mono">{r.spanMm}</td>
                    <td className="border border-gray-200 px-2 py-1 text-right font-mono">{r.thicknessMm}</td>
                    <td className="border border-gray-200 px-2 py-1 text-right font-mono">
                      {r.deflectionMm > 0 ? r.deflectionMm.toFixed(2) : '—'}
                    </td>
                    <td className="border border-gray-200 px-2 py-1 text-right font-mono">
                      {r.allowableMm > 0 ? r.allowableMm.toFixed(2) : '—'}
                    </td>
                    <td className="border border-gray-200 px-2 py-1 text-right font-mono">
                      {r.rating !== 'ok' ? (
                        <span className="text-red-700 font-bold">{r.minThicknessMm}</span>
                      ) : '—'}
                    </td>
                    <td className="border border-gray-200 px-2 py-1 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${RATING_COLOR[r.rating]}`}>
                        {r.rating}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-200 flex justify-end shrink-0">
          <button
            onClick={() => setShowStaticSummary(false)}
            className="text-sm px-4 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {lang === 'de' ? 'Schließen' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
