import { test, expect } from '@playwright/test'
import { bootWithSample, selectBoard, getBoard, undoState } from './helpers'
import type { Page } from '@playwright/test'

/** Opens a section of the property card if it is collapsed. */
async function openSection(page: Page, id: string): Promise<void> {
  const head = page.locator(`button[aria-controls="card-section-${id}"]`)
  await expect(head).toBeVisible()
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click()
}

// A number stays as typed (finding 23.11.2026, review geometry 1–3): the position field read "860,3" as 860
// and "1116.5" as 1117, "1.200" in a size field made 1.2 mm. The rule lives in utils/units.ts parseNumber;
// the release of the 3D handles (only the moved axis changes) is covered by tests/unit/input-numbers.
test.describe('Typed numbers stay as typed', () => {
  test('position and size fields keep decimals and comma; an ambiguous dot is refused', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await selectBoard(page, assemblyId, firstBoardId)
    const field = (id: string) => page.getByTestId(id)
    await openSection(page, 'transform')
    await openSection(page, 'geometry')
    await expect(field('vec3-position-z')).toBeVisible()

    const type = async (id: string, text: string) => {
      await field(id).fill(text)
      await field(id).press('Enter')
    }
    await type('vec3-position-z', '1116,5')
    await type('vec3-position-x', '860.3')
    let b = await getBoard(page, firstBoardId)
    expect(b.position.z).toBe(1116.5)
    expect(b.position.x).toBe(860.3)

    await type('dim-depth', '6,5')
    b = await getBoard(page, firstBoardId)
    expect(b.depth).toBe(6.5)
    // "1.200" is 1200 in German and 1.2 in English: refused and marked, never guessed
    const widthBefore = b.width
    await type('dim-width', '1.200')
    await expect(field('dim-width')).toHaveAttribute('aria-invalid', 'true')
    expect((await getBoard(page, firstBoardId)).width).toBe(widthBefore)
    await field('dim-width').press('Escape')
    await type('dim-width', '1200')
    expect((await getBoard(page, firstBoardId)).width).toBe(1200)
  })

  test('a value the field cannot read is marked and changes nothing', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await selectBoard(page, assemblyId, firstBoardId)
    await openSection(page, 'transform')
    const x = page.getByTestId('vec3-position-x')
    await expect(x).toBeVisible()
    const before = await getBoard(page, firstBoardId)
    const undoBefore = (await undoState(page)).past

    await x.fill('12abc')
    await x.press('Enter')
    await expect(x).toHaveAttribute('aria-invalid', 'true')
    expect((await getBoard(page, firstBoardId)).position).toEqual(before.position)
    expect((await undoState(page)).past).toBe(undoBefore)

    // focus and leave without typing: no change, no undo step
    await x.press('Escape')
    await x.focus()
    await page.getByTestId('vec3-position-y').focus()
    expect((await getBoard(page, firstBoardId)).position).toEqual(before.position)
    expect((await undoState(page)).past).toBe(undoBefore)
  })
})
