import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { getJointAdvice, estimateFastenerCount } from '../../services/joint-advisor'
import { getFastenerSpec } from '../../data/fasteners'
import type { Board } from '../../types/furniture'

export function JointAdvisor() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const project = useProjectStore((s) => s.project)
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const selectedAssemblyId = useUIStore((s) => s.selectedAssemblyId)

  const assembly = project.assemblies.find((a) => a.id === selectedAssemblyId)
  const selectedBoard = selectedBoardIds.length === 1
    ? assembly?.boards.find((b) => b.id === selectedBoardIds[0])
    : undefined

  if (!selectedBoard || !assembly || assembly.boards.length < 2) return null

  // Get advice for connecting selected board with every other board in assembly
  const otherBoards = assembly.boards.filter((b) => b.id !== selectedBoard.id)
  const adviceList = otherBoards
    .map((other) => ({
      other,
      advice: getJointAdvice(selectedBoard, other)
    }))
    .filter((a) => a.advice !== null)

  if (adviceList.length === 0) return null

  return (
    <div className="border-t border-gray-200 pt-3 mt-3">
      <h3 className="text-sm font-bold text-gray-700 mb-2">{t('joints.title')}</h3>

      {adviceList.map(({ other, advice }) => {
        if (!advice) return null
        // Use the shared edge length (shorter common dimension)
        const edgeLength = Math.min(selectedBoard.height, other.height, selectedBoard.width, other.width)

        return (
          <div key={other.id} className="mb-3 p-2 bg-gray-50 rounded border border-gray-200">
            <div className="text-xs font-medium text-gray-600 mb-1.5">
              {selectedBoard.name} &harr; {other.name}
            </div>

            {advice.recommendations.slice(0, 2).map((rec, i) => {
              const note = lang === 'de' ? rec.note_de : rec.note_en

              return (
                <div key={i} className="mb-2 last:mb-0">
                  <div className="text-xs font-semibold text-blue-700">
                    {t('joints.type')}: {rec.jointType}
                  </div>

                  {rec.fasteners.map((f, fi) => {
                    const spec = getFastenerSpec(f.type)
                    const count = f.spacingMm > 0
                      ? estimateFastenerCount(edgeLength, f.spacingMm)
                      : 0

                    return (
                      <div key={fi} className="text-xs text-gray-600 ml-2 mt-0.5">
                        <div>
                          {t('joints.fastener')}: {spec ? (lang === 'de' ? spec.name : spec.nameEn) : f.type}
                        </div>
                        <div>
                          {t('joints.diameter')}: {f.diameterMm}mm &times; {t('joints.length')}: {f.lengthMm}mm
                        </div>
                        {f.spacingMm > 0 && (
                          <div>
                            {t('joints.spacing')}: {f.spacingMm}mm &middot; {t('joints.quantity')}: ~{count}
                          </div>
                        )}
                        {f.preDrillMm && (
                          <div>
                            {t('joints.preDrill')}: {f.preDrillMm}mm
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <div className="text-[10px] text-gray-500 mt-1 italic">{note}</div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
