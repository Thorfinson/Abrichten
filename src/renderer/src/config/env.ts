export interface EnvConfig {
  openRouterApiKey: string
  openRouterModelId: string
  openRouterBaseUrl: string
}

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

/**
 * Environment-based configuration, read from a `.env` file in the project
 * root (see `.env.example`). Vite loads it on startup; values act as
 * fallbacks — settings made in the Settings dialog take precedence.
 */
export function loadEnvConfig(): EnvConfig {
  return {
    openRouterApiKey: import.meta.env.VITE_OPENROUTER_API_KEY ?? '',
    openRouterModelId: import.meta.env.VITE_OPENROUTER_MODEL ?? '',
    openRouterBaseUrl: import.meta.env.VITE_OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL
  }
}
