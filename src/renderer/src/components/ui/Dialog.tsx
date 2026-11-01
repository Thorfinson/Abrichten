import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogFocus } from '../../hooks/useKeyboard'

/*
 * The one dialog look of the app (dark "Warm Zinc" chrome).
 *
 *   <Dialog title="Zuschnittliste" onClose={close} className="w-[960px]"
 *           headerExtra={<Badge/>}
 *           footer={<>
 *             <span className="mr-auto text-xs text-chrome-muted">3 Teile</span>
 *             <Button onClick={print}>PDF drucken</Button>
 *             <Button variant="primary" onClick={exportCsv}>CSV</Button>
 *           </>}>
 *     …scrolling body…
 *   </Dialog>
 *
 * - Render it only while the dialog is open (`if (!show) return null` in the
 *   panel): mounting moves focus in and traps Tab, unmounting hands focus back
 *   (useDialogFocus).
 * - Esc is NOT handled here: useKeyboard closes the topmost modal centrally.
 *   A field whose Esc cancels its own edit calls e.preventDefault().
 * - Backdrop click and the × button call onClose.
 * - Header and footer stay put; only the body scrolls (max 85vh).
 * - Exactly one `primary` Button per dialog. Read-only panels close with a
 *   secondary "Schließen" (t('ui.close')); "Abbrechen" only discards a form.
 */

export interface DialogProps {
  /** Heading text; also the accessible name of the dialog */
  title: ReactNode
  /** × button and backdrop click */
  onClose: () => void
  /** Scrolling body */
  children: ReactNode
  /** Footer row (right-aligned flex; give a left item `mr-auto`). Omitted: no footer. */
  footer?: ReactNode
  /** Controls in the header row, left of the × button */
  headerExtra?: ReactNode
  /** Size of the panel, e.g. 'w-[640px]' or 'w-[1100px] h-[85vh]' */
  className?: string
  /** Replaces the body's default 'overflow-y-auto p-4' (e.g. for side-by-side panes) */
  bodyClassName?: string
  /** id for the title element; generated when omitted */
  titleId?: string
  /** 'alertdialog' for errors that need an answer */
  role?: 'dialog' | 'alertdialog'
  /** false keeps the dialog open on a backdrop click (default true) */
  closeOnBackdrop?: boolean
}

export function Dialog({
  title, onClose, children, footer, headerExtra, className = 'w-[560px]',
  bodyClassName = 'overflow-y-auto p-4', titleId, role = 'dialog', closeOnBackdrop = true
}: DialogProps) {
  const { t } = useTranslation()
  const generatedId = useId()
  const labelId = titleId ?? `dlg-title-${generatedId}`
  const ref = useDialogFocus<HTMLDivElement>(true)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={labelId}
        tabIndex={-1}
        className={`flex max-h-[85vh] max-w-full flex-col overflow-hidden rounded-lg border border-chrome-border bg-chrome-bg text-chrome-text shadow-2xl outline-none [color-scheme:dark] ${className}`}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-chrome-border px-4 py-3">
          <h2 id={labelId} className="flex-1 truncate text-sm font-semibold">{title}</h2>
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('ui.close')}
            title={t('ui.close')}
            className="-mr-1 flex h-7 w-7 items-center justify-center rounded text-chrome-muted outline-none hover:bg-chrome-hover hover:text-chrome-text focus-visible:ring-2 focus-visible:ring-action"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>

        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-chrome-border px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: the one main action · secondary: everything else ·
   *  danger: destructive · ghost: low-key inline action (icons, "bearbeiten") */
  variant?: ButtonVariant
  size?: 'sm' | 'md'
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:   'bg-action text-action-text enabled:hover:bg-action-hover',
  secondary: 'bg-chrome-surface text-chrome-text enabled:hover:bg-chrome-hover',
  danger:    'text-danger enabled:hover:bg-danger-dim/50 enabled:hover:text-danger-text',
  ghost:     'text-chrome-secondary enabled:hover:bg-chrome-hover enabled:hover:text-chrome-text'
}

const SIZE_CLASS = { sm: 'px-2 py-1 text-xs', md: 'px-3.5 py-1.5 text-sm' } as const

export function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-action disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...props}
    />
  )
}

/** Text inputs, number inputs and selects inside a dialog */
export const FIELD_CLASS =
  'rounded border border-chrome-border bg-chrome-deep px-2 py-1 text-xs text-chrome-text outline-none placeholder:text-chrome-hint focus:border-action disabled:opacity-50'

/** Small uppercase section heading */
export const SECTION_LABEL_CLASS = 'text-[10px] font-semibold uppercase tracking-wider text-chrome-hint'

/** Field label above an input */
export const LABEL_CLASS = 'mb-1 block text-xs text-chrome-muted'

/** Table header cell / body cell (table: 'w-full border-collapse text-xs') */
export const TH_CLASS = 'border-b border-chrome-border bg-chrome-deep px-2 py-1.5 text-left font-medium text-chrome-muted'
export const TD_CLASS = 'border-b border-chrome-border px-2 py-1'

/** Checkbox / radio tint */
export const CHECK_CLASS = 'h-3.5 w-3.5 accent-action'

/** One option of a segmented choice (unit, preset …); pair it with aria-pressed */
export function segmentClass(active: boolean): string {
  return `rounded border px-2.5 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-action ${active
    ? 'border-action bg-action/20 text-chrome-text'
    : 'border-chrome-border bg-chrome-surface text-chrome-secondary hover:bg-chrome-hover hover:text-chrome-text'}`
}
