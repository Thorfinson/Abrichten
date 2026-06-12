import { useEffect, useRef } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { useUIStore } from '../store/useUIStore'
import { saveProjectToDB } from '../services/storage'

const DEBOUNCE_MS = 3000

/**
 * Auto-saves the project to IndexedDB whenever it changes (debounced 3s).
 */
export function useAutoSave() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsub = useProjectStore.subscribe(
      (state) => {
        // Cancel any pending save
        if (timerRef.current) clearTimeout(timerRef.current)

        // Schedule new save
        timerRef.current = setTimeout(() => {
          saveProjectToDB(state.project)
            .then(() => {
              useUIStore.getState().setSaveStatus('saved')
              setTimeout(() => useUIStore.getState().setSaveStatus('idle'), 2000)
            })
            .catch((err) => {
              console.error('Auto-save failed:', err)
              useUIStore.getState().setSaveStatus('error')
            })
        }, DEBOUNCE_MS)
      }
    )

    return () => {
      unsub()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])
}
