import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'
import { Button } from './ui/Dialog'

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Last line of defence: a render error in any panel used to unmount the whole
 * React tree and leave a white window (React #310 in the cutting list did
 * exactly that). Shows the message and offers a retry or a reload instead.
 * ponytail: one boundary at the root; per-panel boundaries if a panel keeps crashing.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render error caught by ErrorBoundary:', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    const de = i18n.language === 'de'
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-chrome-deep p-8 text-chrome-text [color-scheme:dark]">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="error-boundary-title"
          className="w-full max-w-xl rounded-lg border border-chrome-border border-t-2 border-t-danger bg-chrome-bg p-6 shadow-2xl"
        >
          <h1 id="error-boundary-title" className="mb-2 text-sm font-semibold text-danger-text">
            {de ? 'Anzeigefehler' : 'Render error'}
          </h1>
          <p className="mb-4 text-sm text-chrome-secondary">
            {de
              ? 'Ein Fenster ist abgestürzt. Das Projekt ist automatisch gespeichert; du kannst es weiter versuchen oder die Ansicht neu laden.'
              : 'A panel crashed. The project is auto-saved; you can try to continue or reload the view.'}
          </p>
          <pre className="mb-4 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-chrome-border bg-chrome-deep p-3 font-mono text-xs text-chrome-muted">{this.state.error.message}</pre>
          <div className="flex gap-2 justify-end">
            <Button autoFocus onClick={() => this.setState({ error: null })}>
              {de ? 'Weiter' : 'Continue'}
            </Button>
            <Button variant="primary" onClick={() => window.location.reload()}>
              {de ? 'Neu laden' : 'Reload'}
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
