import { useTranslation } from 'react-i18next'
import type { Board, BoardCutout } from '../../types/furniture'
import { CommitInput } from '../ui/CommitInput'
import { boardFace } from '../../utils/boardFace'
import { cutoutProblem, faceCutout } from '../../utils/geometry'
import { cutoutInRoom, cutoutKind, faceAxesInRoom, placementOf, storedFromFace, storedPlacement, switchEdge, type EdgePlacement, type FaceAxisInRoom } from '../../utils/cutoutPlace'

const FIELD = 'w-14 shrink-0 text-[10px] bg-white/8 border border-white/15 text-white rounded px-1 py-0.5 outline-none text-right'
const SELECT = 'min-w-0 text-[10px] bg-white/8 border border-white/15 text-white rounded px-0.5 py-0.5 outline-none'
const OPTION = 'bg-gray-800 text-white'
const round1 = (n: number): string => String(Math.round(n * 10) / 10)

/**
 * The cutouts of one board, edited as the workshop marks them out: a shape (rectangle —
 * a hole or, at the edge, a notch — or round), its size, and its place measured from two
 * named edges (Bezugskanten: "50 from the top, 0 from the back"). Below each, the same
 * place in the one reference system, the room (utils/cutoutPlace): it reads there as the
 * planning notes count it ("height 760–810 from the floor").
 */
export function CutoutEditor({ board, onChange }: { board: Board; onChange: (cutouts: BoardCutout[]) => void }) {
  const { t } = useTranslation()
  const cutouts = board.cutouts ?? []
  const face = boardFace(board)
  const { u, v } = faceAxesInRoom(board)

  const put = (id: string, next: BoardCutout): void => onChange(cutouts.map((c) => (c.id === id ? next : c)))
  /** Stored with its distances from the reference edges (a round hole: to its centre), so it
   *  stays there when its size changes and when the board does (types BoardCutout) */
  const placed = (c: BoardCutout, size: { width: number; depth: number }, p: EdgePlacement): BoardCutout =>
    ({ ...c, ...size, ...storedPlacement({ shape: c.shape, width: size.width }, p) })

  const add = (): void => {
    const lying = face.thicknessAxis === 'height'
    // lying: a cooktop-sized opening in the middle; standing: 100 × 100 in the middle; on a
    // small board smaller, with board left round it (never a cut through the board)
    const fit = (want: number, len: number): number => Math.max(1, Math.round(Math.min(want, len - 80 >= 50 ? len - 80 : len / 2)))
    const w = fit(lying ? 560 : 100, face.u)
    const d = fit(lying ? 490 : 100, face.v)
    onChange([...cutouts, { id: crypto.randomUUID(), x: Math.round((face.u - w) / 2), z: Math.round((face.v - d) / 2), width: w, depth: d }])
  }

  const axisWord = (a: FaceAxisInRoom): string => t(`cutout.size.${a.room}`)
  const edgeWord = (a: FaceAxisInRoom, end: 'min' | 'max'): string => t(`cutout.edge.${end === 'min' ? a.minEdge : a.maxEdge}`)
  const roomWord = (a: FaceAxisInRoom): string => t(`cutout.room.${a.room}`)

  return (
    <div data-testid="cutout-editor">
      {cutouts.map((c, idx) => {
        const fc = faceCutout(board, c)
        const p = placementOf(board, fc)
        const room = cutoutInRoom(board, fc)
        const problem = cutoutProblem(board, c)
        const round = c.shape === 'circle'
        // not built: not called a notch (it is at no edge of the part); the hint says why
        const kind = problem === 'outside' || problem === 'splits' ? (round ? 'round' : 'hole') : cutoutKind(board, fc)
        const num = (text: string): number | null => { const n = parseFloat(text.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : null }
        const edgePick = (a: FaceAxisInRoom, which: 'u' | 'v') => (
          <select
            aria-label={t('cutout.from')}
            value={which === 'u' ? p.uFrom : p.vFrom}
            // the cutout stays where it is; only the distance is now counted from the other edge
            onChange={(e) => { if (e.target.value !== (which === 'u' ? p.uFrom : p.vFrom)) put(c.id, placed(c, fc, switchEdge(board, c, which))) }}
            className={SELECT}
          >
            <option className={OPTION} value="min">{edgeWord(a, 'min')}</option>
            <option className={OPTION} value="max">{edgeWord(a, 'max')}</option>
          </select>
        )
        return (
          <div key={c.id} className="mb-2 pb-2 border-b border-white/10 text-[10px]" data-testid="cutout-row" data-kind={kind} data-problem={problem ?? undefined}>
            {/* 1: number, shape, what the workshop calls it */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-white/40 w-3 shrink-0">{idx + 1}</span>
              <select
                aria-label={t('cutout.shape')}
                value={round ? 'circle' : 'rect'}
                onChange={(e) => {
                  // round: the largest circle on the same centre; rectangle: the circle's square
                  const d = Math.min(fc.width, fc.depth)
                  const next: BoardCutout = e.target.value === 'circle'
                    ? { ...fc, shape: 'circle', x: fc.x + (fc.width - d) / 2, z: fc.z + (fc.depth - d) / 2, width: d, depth: d, uFrom: p.uFrom, vFrom: p.vFrom }
                    : { ...fc, shape: undefined, uFrom: p.uFrom, vFrom: p.vFrom }
                  put(c.id, storedFromFace(board, next))
                }}
                className={SELECT}
              >
                <option className={OPTION} value="rect">{t('cutout.rect')}</option>
                <option className={OPTION} value="circle">{t('cutout.circle')}</option>
              </select>
              <span className="flex-1 min-w-0 truncate text-white/60" data-testid="cutout-kind">{t(`cutout.kind.${kind}`)}</span>
              <button onClick={() => onChange(cutouts.filter((x) => x.id !== c.id))} className="text-white/40 hover:text-red-400 text-[11px] leading-none shrink-0" title={t('board.removeCutout')} aria-label={t('board.removeCutout')}>✕</button>
            </div>
            {/* 2: size */}
            <div className="flex items-center gap-1.5 mb-1 pl-4">
              {round ? (
                <label className="flex items-center gap-1">
                  <span className="text-white/40">Ø</span>
                  <CommitInput key={`${c.id}-d-${c.width}`} type="number" min={1} value={c.width} aria-label={t('cutout.diameter')}
                    onCommit={(text) => { const n = num(text); if (n) put(c.id, placed(c, { width: n, depth: n }, p)) }} className={FIELD} />
                </label>
              ) : (
                <>
                  <label className="flex items-center gap-1">
                    <span className="text-white/40">{axisWord(u)}</span>
                    <CommitInput key={`${c.id}-w-${c.width}`} type="number" min={1} value={c.width} aria-label={axisWord(u)}
                      onCommit={(text) => { const n = num(text); if (n) put(c.id, placed(c, { width: n, depth: fc.depth }, p)) }} className={FIELD} />
                  </label>
                  <span className="text-white/30">×</span>
                  <label className="flex items-center gap-1">
                    <span className="text-white/40">{axisWord(v)}</span>
                    <CommitInput key={`${c.id}-h-${c.depth}`} type="number" min={1} value={c.depth} aria-label={axisWord(v)}
                      onCommit={(text) => { const n = num(text); if (n) put(c.id, placed(c, { width: fc.width, depth: n }, p)) }} className={FIELD} />
                  </label>
                </>
              )}
            </div>
            {/* 3: place, from two named edges (Bezugskanten) */}
            <div className="flex items-center gap-1 mb-0.5 pl-4 flex-wrap">
              <CommitInput key={`${c.id}-u-${p.uDist}-${p.uFrom}`} type="number" min={0} value={p.uDist} aria-label={`${t('cutout.from')} ${edgeWord(u, p.uFrom)}`}
                onCommit={(text) => { const n = num(text); if (n !== null) put(c.id, placed(c, fc, { ...p, uDist: n })) }} className={FIELD} />
              <span className="text-white/40">{t('cutout.fromShort')}</span>
              {edgePick(u, 'u')}
              <span className="w-1" />
              <CommitInput key={`${c.id}-v-${p.vDist}-${p.vFrom}`} type="number" min={0} value={p.vDist} aria-label={`${t('cutout.from')} ${edgeWord(v, p.vFrom)}`}
                onCommit={(text) => { const n = num(text); if (n !== null) put(c.id, placed(c, fc, { ...p, vDist: n })) }} className={FIELD} />
              <span className="text-white/40">{t('cutout.fromShort')}</span>
              {edgePick(v, 'v')}
            </div>
            {/* why it is not built: off the board, or it would cut the board in two */}
            {problem && <div className="pl-4 mb-0.5 text-amber-400" data-testid="cutout-problem">{t(`cutout.problem.${problem}`)}</div>}
            {/* 4: the same place in the room — the one reference system */}
            <div className="pl-4 text-white/40" data-testid="cutout-room">
              {t('cutout.inRoom')}: {roomWord(u)} {round1(room[u.room][0])}–{round1(room[u.room][1])} · {roomWord(v)} {round1(room[v.room][0])}–{round1(room[v.room][1])}
            </div>
          </div>
        )
      })}
      <button onClick={add} className="text-[10px] text-blue-400 hover:text-blue-300" title={t('board.addCutout')}>+ {t('cutout.add')}</button>
    </div>
  )
}
