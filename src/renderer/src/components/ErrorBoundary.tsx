import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'

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
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-gray-900 text-white p-8">
        <div className="max-w-xl w-full rounded-lg border border-red-500/40 bg-gray-800 p-6 shadow-2xl">
          <h1 className="text-base font-bold text-red-400 mb-2">
            {de ? 'Anzeigefehler' : 'Render error'}
          </h1>
          <p className="text-sm text-white/80 mb-4">
            {de
              ? 'Ein Fenster ist abgestürzt. Das Projekt ist automatisch gespeichert; du kannst es weiter versuchen oder die Ansicht neu laden.'
              : 'A panel crashed. The project is auto-saved; you can try to continue or reload the view.'}
          </p>
          <pre className="text-xs bg-black/40 rounded p-3 mb-4 overflow-auto max-h-40 whitespace-pre-wrap">{this.state.error.message}</pre>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => this.setState({ error: null })}
              className="text-sm px-4 py-1.5 rounded bg-white/10 hover:bg-white/20"
            >
              {de ? 'Weiter' : 'Continue'}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="text-sm px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700"
            >
              {de ? 'Neu laden' : 'Reload'}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
