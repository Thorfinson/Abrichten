// Generates docs/screenshot.png for the README.
// Requires a fresh build (out/renderer): run `npm run build` first.
// Usage: npm run screenshot [project.abrichten.json] [quad|3d] [board name substring]
//   without a file the bundled sample project is used.
import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const __dirname = dirname(fileURLToPath(new URL(import.meta.url)))
const ROOT = resolve(__dirname, '..')
const PORT = 4179
const OUT_FILE = resolve(ROOT, 'docs', 'screenshot.png')
const [, , projectPath, layout = 'quad', boardName] = process.argv
const project = projectPath ? JSON.parse(await readFile(projectPath, 'utf8')) : null

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
  if (project) await page.addInitScript(() => { try { localStorage.setItem('abrichten-welcomed', '1') } catch {} })
  await page.goto(`http://localhost:${PORT}/`)
  await page.waitForLoadState('networkidle')

  if (project) {
    await page.waitForFunction(() => !!window.__projectStore && !!window.__r3f)
    await page.evaluate((p) => window.__projectStore.getState().loadProject(p), project)
  } else {
    // Welcome dialog → load the bundled sample project
    await page.getByRole('button', { name: /Beispielprojekt laden|Load Sample Project/i }).click()
  }
  await page.waitForFunction(() => {
    const proj = window.__projectStore?.getState().project
    return proj?.assemblies?.length > 0 && !!window.__r3f
  })

  // Layout first — fit-view needs the cameras/controls live.
  await page.evaluate((l) => {
    const ui = window.__uiStore.getState()
    if (l === '3d') { ui.setViewLayout('single'); ui.setActiveView('3d') } else ui.setViewLayout('quad')
  }, layout)
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__uiStore.getState().triggerFitView())
  await page.waitForTimeout(600)

  // Select the named board (or the one with the most joints) so the properties card shows fasteners;
  // hide the per-board joint badges when there are many (they would cover the model).
  await page.evaluate((wanted) => {
    const proj = window.__projectStore.getState().project
    const ui = window.__uiStore.getState()
    const count = new Map()
    const joints = proj.assemblies.flatMap((a) => a.joints)
    for (const j of joints) for (const id of [j.boardA, j.boardB]) count.set(id, (count.get(id) ?? 0) + 1)
    let best = null
    for (const a of proj.assemblies) for (const b of a.boards) {
      const n = count.get(b.id) ?? 0
      if (!best || n > best.n) best = { assemblyId: a.id, boardId: b.id, n }
    }
    if (wanted) for (const a of proj.assemblies) for (const b of a.boards) if (b.name.includes(wanted)) best = { assemblyId: a.id, boardId: b.id, n: 0 }
    if (best) ui.selectBoard(best.assemblyId, best.boardId)
    if (joints.length > 30 && ui.showJointMarkers) ui.toggleJointMarkers()
  }, boardName ?? '')
  await page.waitForTimeout(500)

  await page.screenshot({ path: OUT_FILE })
  await browser.close()
  console.log(`written: ${OUT_FILE}`)
} finally {
  server.kill()
}
