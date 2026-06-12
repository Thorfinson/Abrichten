// Generates docs/screenshot.png for the README.
// Requires a fresh build (out/renderer): run `npm run build` first.
// Usage: npm run screenshot
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const __dirname = dirname(fileURLToPath(new URL(import.meta.url)))
const ROOT = resolve(__dirname, '..')
const PORT = 4179
const OUT_FILE = resolve(ROOT, 'docs', 'screenshot.png')

async function waitForServer(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`static server did not start on ${url}`)
}

const server = spawn('node', [resolve(ROOT, 'tests/e2e/static-server.mjs')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore'
})

try {
  await waitForServer(`http://localhost:${PORT}/`)
  await mkdir(resolve(ROOT, 'docs'), { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.goto(`http://localhost:${PORT}/`)
  await page.waitForLoadState('networkidle')

  // Welcome dialog → load the bundled sample project
  await page.getByRole('button', { name: /Beispielprojekt laden|Load Sample Project/i }).click()
  await page.waitForFunction(() => {
    const proj = window.__projectStore?.getState().project
    return proj?.assemblies?.length > 0 && !!window.__r3f
  })

  // Quad layout (front / side / top / 3D side by side), then fit all views.
  // Layout must be mounted first — fit-view needs the cameras/controls live.
  await page.evaluate(() => window.__uiStore.getState().setViewLayout('quad'))
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__uiStore.getState().triggerFitView())
  await page.waitForTimeout(600)

  // Select a board so gizmo + floating properties card are visible
  await page.evaluate(() => {
    const proj = window.__projectStore.getState().project
    const assembly = proj.assemblies[0]
    window.__uiStore.getState().selectBoard(assembly.id, assembly.boards[0].id)
  })
  await page.waitForTimeout(500)

  await page.screenshot({ path: OUT_FILE })
  await browser.close()
  console.log(`written: ${OUT_FILE}`)
} finally {
  server.kill()
}
