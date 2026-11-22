/**
 * A part as the app names it: its label ("Herd 2", utils/partLabel) in front of
 * its name. Every place that shows a part uses this (or partTitle for plain text),
 * so paper and screen always match; tests/unit/part-name-guard.test.mjs checks it.
 */
export function PartName({ label, name, labelClassName = 'opacity-70' }: {
  label: string | undefined
  name: string
  /** Look of the label; the name keeps the surrounding text style */
  labelClassName?: string
}) {
  return (
    <>
      {label && <span className={`font-mono ${labelClassName}`} data-testid="part-name-label">{label}</span>}
      {label ? ' ' : ''}{name}
    </>
  )
}
