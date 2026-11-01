import { test, expect, type Page } from '@playwright/test'
import { bootWithSample, selectBoard, setView, canvasRect, getUI, wheelOverCanvas, projectToCanvas } from './helpers'

/**
 * App chrome around the canvas: the assembly drawer is a column (the canvas
 * resizes), the tool strip, the status bar controls, the HUD, the panel hub
 * switches, fit-on-load, and scene labels staying below cards and modals.
 */

/** Screen-space box of the sample cabinet (all visible boards), via the active camera */
async function modelScreenBox(page: Page): Promise<{ left: number; right: number; top: number; bottom: number }> {
  return page.evaluate(() => {
    const r = window.__r3f
    const rect = r.gl.domElement.getBoundingClientRect()
    const out = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
    for (const a of window.__projectStore.getState().project.assemblies) {
      for (const b of a.boards) {
        for (const dx of [0, b.width]) for (const dy of [0, b.height]) for (const dz of [0, b.depth]) {
          const v = new r.THREE.Vector3(b.position.x + dx, b.position.y + dy, b.position.z + dz).project(r.camera)
          const x = rect.left + ((v.x + 1) / 2) * rect.width
          const y = rect.top + ((1 - v.y) / 2) * rect.height
          out.left = Math.min(out.left, x); out.right = Math.max(out.right, x)
          out.top = Math.min(out.top, y); out.bottom = Math.max(out.bottom, y)
        }
      }
    }
    return out
  })
}

test.describe('Layout chrome', () => {
  test('the assembly drawer is a column: tabs and canvas move aside and the canvas resizes', async ({ page }) => {
    await bootWithSample(page)
    const tabs = page.getByRole('tablist', { name: /Ansichten|Views/ })
    const before = await canvasRect(page)
    const tabsBefore = (await tabs.boundingBox())!

    await page.getByRole('button', { name: /^(Baugruppen-Leiste|Assembly tree)$/ }).click()
    const drawer = page.getByRole('complementary', { name: /Baugruppen|Assemblies/ })
    await expect(drawer).toBeVisible()
    const drawerBox = (await drawer.boundingBox())!

    await expect.poll(async () => (await canvasRect(page)).x).toBeGreaterThanOrEqual(drawerBox.x + drawerBox.width - 1)
    const after = await canvasRect(page)
    expect(after.width).toBeLessThan(before.width - drawerBox.width + 2)
    expect((await tabs.boundingBox())!.x).toBeGreaterThan(tabsBefore.x + drawerBox.width - 2)

    // B closes it again and the canvas takes the full width back
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('b')
    await expect(drawer).toHaveCount(0)
    await expect.poll(async () => (await canvasRect(page)).width).toBeGreaterThan(before.width - 2)
  })

  test('tool strip: labelled buttons, active state follows clicks and keys 1–4', async ({ page }) => {
    await bootWithSample(page)
    const strip = page.getByRole('toolbar', { name: /Werkzeuge|Tools/ })
    const measure = strip.getByRole('button', { name: /^(Messen|Measure)$/ })
    await expect(measure).toHaveAttribute('title', /\(2\)$/)
    await measure.click()
    expect((await getUI(page)).activeTool).toBe('measure')
    await expect(measure).toHaveAttribute('aria-pressed', 'true')

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('3')
    await expect(strip.getByRole('button', { name: /^(Winkel|Angle)$/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(measure).toHaveAttribute('aria-pressed', 'false')
  })

  test('loading a project frames it in the view', async ({ page }) => {
    await bootWithSample(page)
    const rect = await canvasRect(page)
    const box = await modelScreenBox(page)
    expect(box.left).toBeGreaterThan(rect.x)
    expect(box.right).toBeLessThan(rect.x + rect.width)
    expect(box.top).toBeGreaterThan(rect.y)
    expect(box.bottom).toBeLessThan(rect.y + rect.height)

    // Zoom far in, then load a project (new id): framed again
    for (let i = 0; i < 20; i++) await wheelOverCanvas(page, rect.x + rect.width / 2, rect.y + rect.height / 2, -100)
    expect((await modelScreenBox(page)).left).toBeLessThan(rect.x)
    await page.evaluate(() => {
      const st = window.__projectStore.getState()
      const copy = JSON.parse(JSON.stringify(st.project))
      st.resetProject()
      copy.id = 'reloaded'
      st.loadProject(copy)
    })
    await page.waitForTimeout(300)
    const again = await modelScreenBox(page)
    expect(again.left).toBeGreaterThan(rect.x)
    expect(again.right).toBeLessThan(rect.x + rect.width)
  })

  test('scene labels never show through a modal', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await selectBoard(page, assemblyId, 'b-links')
    const label = page.locator('span', { hasText: /^720 mm$/ }).first()
    await expect(label).toBeVisible()
    // Labels ignore the pointer; make this one hit-testable to ask what paints on top of it
    await label.evaluate((el) => {
      for (let n: HTMLElement | null = el; n && n.style.position !== 'relative'; n = n.parentElement) n.style.pointerEvents = 'auto'
    })
    const isOnTop = () => label.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !!top && el.contains(top)
    })
    expect(await isOnTop()).toBe(true)

    await page.evaluate(() => window.__uiStore.getState().setShowCuttingList(true))
    await expect(page.locator('table').first()).toBeVisible()
    expect(await isOnTop()).toBe(false)
  })

  test('status bar: labelled snap switch, snap size, grid switch, unit and save state', async ({ page }) => {
    await bootWithSample(page)
    const bar = page.getByRole('contentinfo', { name: /Statusleiste|Status bar/ })

    const snap = bar.getByRole('switch', { name: /Einrasten|Snap/ })
    await expect(snap).toHaveAttribute('aria-checked', 'false')
    await snap.click()
    expect(await page.evaluate(() => window.__uiStore.getState().snapEnabled)).toBe(true)
    await snap.click()

    // picking a size also turns snapping on
    await bar.getByRole('combobox', { name: /Rasterweite|Snap grid size/ }).selectOption('25')
    expect(await page.evaluate(() => {
      const s = window.__uiStore.getState()
      return [s.snapSize, s.snapEnabled]
    })).toEqual([25, true])

    await bar.getByRole('switch', { name: /^(Raster|Grid)/ }).click()
    expect(await page.evaluate(() => window.__uiStore.getState().showGrid)).toBe(false)

    await bar.getByRole('radio', { name: 'cm' }).click()
    expect(await page.evaluate(() => window.__projectStore.getState().project.displayUnit)).toBe('cm')
    await expect(bar.getByRole('radio', { name: 'cm' })).toHaveAttribute('aria-checked', 'true')

    await page.evaluate(() => window.__uiStore.getState().setSaveStatus('saved'))
    await expect(bar.getByText(/^(Automatisch gesichert ✓|Auto-saved ✓)$/)).toBeVisible()
  })

  test('HUD: joints layer off by default, fold state remembered, compact in quad', async ({ page }) => {
    await bootWithSample(page)
    expect(await page.evaluate(() => window.__uiStore.getState().showJointMarkers)).toBe(false)
    const hud = page.getByTestId('context-hud')
    await expect(hud).toHaveAttribute('data-expanded', 'true')

    await hud.getByRole('button', { name: /Kürzel ausblenden|Hide shortcuts/ }).click()
    await expect(hud).toHaveAttribute('data-expanded', 'false')
    await expect(hud.getByRole('switch', { name: /Verbindungen|Joints/ })).toHaveAttribute('aria-checked', 'false')

    await page.reload()
    await page.getByRole('button', { name: /Beispielprojekt laden|Load Sample Project/i }).click()
    await expect(page.getByTestId('context-hud')).toHaveAttribute('data-expanded', 'false')
    await page.getByTestId('context-hud').getByRole('button', { name: /Kürzel einblenden|Show shortcuts/ }).click()
    await expect(page.getByTestId('context-hud')).toHaveAttribute('data-expanded', 'true')

    await page.evaluate(() => window.__uiStore.getState().setViewLayout('quad'))
    await expect(page.getByTestId('context-hud')).toHaveAttribute('data-expanded', 'false')
  })

  test('3D selection pill stays inside its canvas', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await setView(page, '3d')
    await page.evaluate(() => window.__uiStore.getState().triggerFitView())
    await page.waitForTimeout(300)
    await selectBoard(page, assemblyId, 'b-deckel')
    // Dolly in towards the fitted target: the top board's anchor leaves the canvas at the top
    await page.evaluate(() => {
      const boards = window.__projectStore.getState().project.assemblies.flatMap((a: any) => a.boards)
      const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
      for (const b of boards) {
        lo.x = Math.min(lo.x, b.position.x); hi.x = Math.max(hi.x, b.position.x + b.width)
        lo.y = Math.min(lo.y, b.position.y); hi.y = Math.max(hi.y, b.position.y + b.height)
        lo.z = Math.min(lo.z, b.position.z); hi.z = Math.max(hi.z, b.position.z + b.depth)
      }
      const r = window.__r3f
      const target = new r.THREE.Vector3((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2)
      r.camera.position.sub(target).multiplyScalar(0.35).add(target)
    })
    await page.waitForTimeout(400)
    const rect = await canvasRect(page)
    // unclamped, the pill (80 px above the anchor) would start above the canvas
    const anchor = await projectToCanvas(page, { x: 300, y: 720, z: 150 })
    expect(anchor.y - 80).toBeLessThan(rect.y)

    const pill = page.locator('div.rounded-full.whitespace-nowrap', { hasText: 'Deckel' }).first()
    await expect(pill).toBeVisible()
    const box = (await pill.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(rect.y)
    expect(box.x).toBeGreaterThanOrEqual(rect.x)
    expect(box.x + box.width).toBeLessThanOrEqual(rect.x + rect.width)
    expect(box.y + box.height).toBeLessThanOrEqual(rect.y + rect.height)
  })

  test('toolbar icon buttons are named; panel hub overlay toggles are switches', async ({ page }) => {
    await bootWithSample(page)
    for (const name of [/^(Einstellungen|Settings)$/, /^(Rückgängig|Undo)$/, /^(Wiederherstellen|Redo)$/, /^(Baugruppen-Leiste|Assembly tree)$/]) {
      await expect(page.getByRole('button', { name })).toBeVisible()
    }

    await page.getByRole('button', { name: /^Panels$/ }).click()
    const hub = page.getByRole('dialog', { name: /Werkzeuge & Panels|Tools & Panels/ })
    const statics = hub.getByRole('switch', { name: /Statik-Overlay|Static Overlay/ })
    await expect(statics).toHaveAttribute('aria-checked', 'false')
    await statics.click()
    await expect(statics).toHaveAttribute('aria-checked', 'true')
    await expect(hub).toBeVisible() // stays open to show the new state
    expect(await page.evaluate(() => window.__uiStore.getState().showStaticOverlay)).toBe(true)
  })

  test('shortcuts overlay names S as snapping and lists Alt+G', async ({ page }) => {
    await bootWithSample(page)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('?')
    const dialog = page.getByRole('dialog', { name: /Tastaturkürzel|Keyboard Shortcuts/ })
    await expect(dialog.getByText(/^(Einrasten \(Snap\) ein\/aus|Snapping on\/off)$/)).toBeVisible()
    await expect(dialog.getByText('Alt+G', { exact: true })).toBeVisible()
  })
})
