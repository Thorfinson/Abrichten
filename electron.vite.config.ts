import { resolve } from 'path'
import { createHash } from 'crypto'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const sha256Source = (code: string): string =>
  `'sha256-${createHash('sha256').update(code).digest('base64')}'`

/**
 * Dev server only: the CSP in index.html is the production policy. Vite's dev
 * server additionally needs its HMR websocket and the react-refresh preamble,
 * an inline module script, which is allowed by its hash.
 */
function devServerCsp(): Plugin {
  return {
    name: 'abrichten:dev-server-csp',
    apply: 'serve',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const inlineScripts = html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)
        const hashes = Array.from(inlineScripts, ([, code]) => sha256Source(code))
        return html.replace(
          /(http-equiv="Content-Security-Policy"\s+content=")([^"]*)/,
          (_, attr: string, policy: string) =>
            attr +
            policy
              .replace("script-src 'self'", ["script-src 'self'", ...hashes].join(' '))
              .replace("connect-src 'self'", "connect-src 'self' ws://localhost:*")
        )
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss(), devServerCsp()]
  }
})
