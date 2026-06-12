/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OpenRouter API key used by the AI assistant (fallback when not set in Settings) */
  readonly VITE_OPENROUTER_API_KEY?: string
  /** OpenRouter model id, e.g. "anthropic/claude-sonnet-4.5" */
  readonly VITE_OPENROUTER_MODEL?: string
  /** Override for OpenAI-compatible API endpoints (defaults to OpenRouter) */
  readonly VITE_OPENROUTER_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
