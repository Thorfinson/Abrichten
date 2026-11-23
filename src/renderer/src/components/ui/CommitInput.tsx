import { useEffect, useRef, useState } from 'react'

export interface CommitInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'onKeyDown' | 'onFocus'> {
  value: string | number
  /** Called once with the edited text — on blur or Enter, only if it changed */
  onCommit: (text: string) => void
}

/**
 * Input that edits a local draft and commits it once, on blur or Enter, so
 * typing a name or a number is one undo step (and one scene update) instead
 * of one per keystroke. Esc puts the stored value back.
 */
export function CommitInput({ value, onCommit, ...rest }: CommitInputProps) {
  const [draft, setDraft] = useState(String(value))
  const focused = useRef(false)
  const live = useRef({ draft, value, onCommit })
  live.current = { draft, value, onCommit }

  // Follow outside changes (undo, drag, …) unless the user is editing
  useEffect(() => {
    if (!focused.current) setDraft(String(value))
  }, [value])

  const commit = (): void => {
    const { draft: d, value: v, onCommit: fn } = live.current
    if (d !== String(v)) fn(d)
  }

  // Unmounted while editing (e.g. another board got selected): keep the edit
  useEffect(() => () => { if (focused.current) commit() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      {...rest}
      value={draft}
      onFocus={() => { focused.current = true }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (!focused.current) return // Esc already reverted
        focused.current = false
        commit()
        // A rejected edit (e.g. not a number) leaves the stored value: show it again
        requestAnimationFrame(() => { if (!focused.current) setDraft(String(live.current.value)) })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') {
          e.preventDefault()   // Esc reverts the field; it must not also deselect the board
          focused.current = false
          setDraft(String(live.current.value))
          e.currentTarget.blur()
        }
      }}
    />
  )
}

