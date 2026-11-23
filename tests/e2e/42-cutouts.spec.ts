import { test, expect } from '@playwright/test'
import { bootWithSample } from './helpers'

/*
 * Cutouts in standing boards: on the side panel of the sample cabinet a
 * notch 50 high × 70 deep at its top back corner, entered as the workshop marks it out —
 * size, then "0 from the top", "0 from the back". The card shows the same place in the
 * room; the 3D mesh, the cutting list and the shop drawing show the notch.
 */
test('a notch in a standing board: entered from named edges, shown everywhere', async ({ page }) => {
  const { assemblyId } = await bootWithSample(page)
  await page.evaluate((a) => window.__uiStore.getState().selectBoard(a, 'b-links'), assemblyId)
  await page.getByRole('button', { name: /^Ausschnitte|^Cut-outs/ }).first().click()
  const editor = page.getByTestId('cutout-editor')
  await editor.getByRole('button', { name: /Ausschnitt|Cut-out/ }).last().click()
  const row = editor.getByTestId('cutout-row').first()
  await expect(row).toHaveAttribute('data-kind', 'hole')
  // size: 50 high, 70 deep
  await row.getByRole('spinbutton', { name: 'Höhe' }).fill('50')
  await row.getByRole('spinbutton', { name: 'Höhe' }).press('Enter')
  await row.getByRole('spinbutton', { name: 'Tiefe' }).fill('70')
  await row.getByRole('spinbutton', { name: 'Tiefe' }).press('Enter')
  // place: from the top and from the back, 0 each
  const picks = row.getByRole('combobox', { name: 'Abstand von' })
  await picks.nth(0).selectOption({ label: 'oben' })
  await picks.nth(1).selectOption({ label: 'hinten' })
  const dists = row.getByRole('spinbutton', { name: /^Abstand von / })
  await dists.nth(0).fill('0'); await dists.nth(0).press('Enter')
  await dists.nth(1).fill('0'); await dists.nth(1).press('Enter')
  await expect(row).toHaveAttribute('data-kind', 'notch')
  // the store holds it on the face: u = height, v = depth
  const cut = await page.evaluate(() => window.__projectStore.getState().project.assemblies[0].boards.find((b: any) => b.id === 'b-links').cutouts[0])
  const side = await page.evaluate(() => window.__projectStore.getState().project.assemblies[0].boards.find((b: any) => b.id === 'b-links'))
  // kept as measured: 0 from the top (the far end of the height), 0 from the back
  expect([cut.width, cut.depth, cut.x, cut.z, cut.uFrom, cut.vFrom]).toEqual([50, 70, 0, 0, 'max', 'min'])
  // the same place in the room
  const room = row.getByTestId('cutout-room')
  const top = side.position.y + side.height
  await expect(room).toContainText(`vom Boden ${top - 50}–${top}`)
  // the part gets 40 taller: the notch stays at the top, as measured
  await page.evaluate((a) => window.__projectStore.getState().updateBoard(a, 'b-links', { height: window.__projectStore.getState().project.assemblies[0].boards.find((b: any) => b.id === 'b-links').height + 40 }), assemblyId)
  await expect(room).toContainText(`vom Boden ${top + 40 - 50}–${top + 40}`)
  // measured from the bottom instead: the notch does not move, only the number changes
  await picks.nth(0).selectOption({ label: 'unten' })
  await expect(room).toContainText(`vom Boden ${top + 40 - 50}–${top + 40}`)
  await expect(dists.nth(0)).toHaveValue(String(side.height + 40 - 50))
  await picks.nth(0).selectOption({ label: 'oben' })
  await expect(dists.nth(0)).toHaveValue('0')
  await page.evaluate((a) => window.__projectStore.getState().updateBoard(a, 'b-links', { height: window.__projectStore.getState().project.assemblies[0].boards.find((b: any) => b.id === 'b-links').height - 40 }), assemblyId)
  await expect(room).toContainText(`vom Boden ${top - 50}–${top}`)
  // reaching past the top: said, and cut back to the part
  await picks.nth(0).selectOption({ label: 'unten' })
  await dists.nth(0).fill(String(side.height - 30)); await dists.nth(0).press('Enter')
  await expect(row.getByTestId('cutout-problem')).toContainText('gekürzt')
  await picks.nth(0).selectOption({ label: 'oben' })
  await dists.nth(0).fill('0'); await dists.nth(0).press('Enter')
  await expect(row.getByTestId('cutout-problem')).toHaveCount(0)
  // as deep as the part: it would cut it in two — said, and not built
  await row.getByRole('spinbutton', { name: 'Tiefe' }).fill(String(side.depth))
  await row.getByRole('spinbutton', { name: 'Tiefe' }).press('Enter')
  await expect(row.getByTestId('cutout-problem')).toContainText('durchtrennen')
  await expect(row).toHaveAttribute('data-kind', 'hole')
  await row.getByRole('spinbutton', { name: 'Tiefe' }).fill('70')
  await row.getByRole('spinbutton', { name: 'Tiefe' }).press('Enter')
  await expect(row.getByTestId('cutout-problem')).toHaveCount(0)
  // the edge banding picker lays the side panel out like its drawing: standing, E1 along the back
  await expect(page.getByTestId('edge-picker').locator('[data-edge="e1"]')).toHaveAttribute('data-side', 'left')
  await expect(page.getByTestId('edge-picker').locator('[data-edge="e4"]')).toHaveAttribute('data-side', 'top')
  // 3D: the mesh is cut
  const kind = await page.evaluate(() => { let t = ''; window.__r3f.scene.traverse((o: any) => { if (o.isMesh && o.name === 'b-links') t = o.geometry.type }); return t })
  expect(kind).toBe('ExtrudeGeometry')
  // cutting list: a cut-out column naming it
  await page.evaluate(() => window.__uiStore.getState().setShowCuttingList(true))
  await expect(page.getByTestId('cut-cutouts').filter({ hasText: 'Ausklinkung' })).toHaveCount(1)
  await expect(page.getByTestId('cut-cutouts').filter({ hasText: 'Ausklinkung' })).toContainText('0 von oben, 0 von hinten')
})
