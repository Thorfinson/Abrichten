/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OpenRouter API key for the AI assistant: dev server only, never part of a build (fallback when not set in Settings) */
  readonly VITE_OPENROUTER_API_KEY?: string
  /** OpenRouter model id, e.g. "anthropic/claude-sonnet-4.5" */
  readonly VITE_OPENROUTER_MODEL?: string
  /** Override for OpenAI-compatible API endpoints (defaults to OpenRouter) */
  readonly VITE_OPENROUTER_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * API exposed by src/preload/index.ts via contextBridge — keep in sync.
 * Optional because the renderer also runs without Electron (E2E tests).
 */
interface Window {
  electronAPI?: {
    fileSave: (data: string, defaultName: string) => Promise<string | null>
    fileOpen: () => Promise<{ path: string; content: string } | null>
    fileExport: (content: string, defaultName: string) => Promise<string | null>
  }
  /** Set while there are unsaved changes; the main process calls it when the user discards them on close. */
  __abrichtenDiscard?: () => Promise<void>
}
