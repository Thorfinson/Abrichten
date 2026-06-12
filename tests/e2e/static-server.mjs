// Tiny static file server for the built renderer (out/renderer).
// Used as the Playwright webServer so tests can drive the React app in a
// real Chromium browser without Electron's main process.
//
// Why not vite preview?  vite preview reads vite config and expects
// outDir; the renderer output lives under out/renderer/ which is a sibling
// of dist/, so a hand-rolled static server is the smallest dependency.
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..', '..', 'out', 'renderer')
const PORT = Number(process.env.PORT || 4173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.map':  'application/json; charset=utf-8'
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
    let pathname = decodeURIComponent(url.pathname)
    if (pathname.endsWith('/')) pathname += 'index.html'
    // Strip leading slash, normalize, prevent traversal
    const rel = normalize(pathname.replace(/^[/\\]+/, ''))
    if (rel.startsWith('..')) {
      res.writeHead(403); res.end('Forbidden'); return
    }
    const filePath = join(ROOT, rel)

    let body
    try {
      const st = await stat(filePath)
      if (st.isDirectory()) {
        body = await readFile(join(filePath, 'index.html'))
        res.writeHead(200, { 'Content-Type': MIME['.html'] })
      } else {
        body = await readFile(filePath)
        res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' })
      }
    } catch {
      // SPA fallback — return index.html for unknown paths
      body = await readFile(join(ROOT, 'index.html'))
      res.writeHead(200, { 'Content-Type': MIME['.html'] })
    }
    res.end(body)
  } catch (err) {
    res.writeHead(500); res.end(String(err))
  }
})

server.listen(PORT, () => {
  console.log(`[static-server] serving ${ROOT} on http://localhost:${PORT}`)
})
