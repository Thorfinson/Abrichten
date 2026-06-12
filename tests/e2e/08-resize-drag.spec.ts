import { test, expect } from '@playwright/test'
import {
  bootWithSample, selectBoard, setView, setMode, getBoard,
  boardCentre, findHandleWorld, projectToCanvas, dragCanvas, fitView, findBoardIdByName
} from './helpers'

// Use a wide board (Boden, 564 × 18 × 300) for resize tests so the
// face cubes don't overlap each other on screen.

test.describe('Resize cube drag (Blender-style face-anchored scale)', () => {
  test('+X face cube grows board.width while position.x stays fixed', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const boardId = await findBoardIdByName(page, 'Boden')

    await setView(page, 'front')
    await selectBoard(page, assemblyId, boardId)
    await setMode(page, 'scale')
    await fitView(page)
    await page.waitForTimeout(300)

    const before = await getBoard(page, boardId)
    const centre = await boardCentre(page, boardId)
    const cubeWorld = await findHandleWorld(page, centre, 'x', 1, 'cube16')

    const start = await projectToCanvas(page, cubeWorld)
    const end = { x: start.x + 200, y: start.y }

    await dragCanvas(page, start, end)

    const after = await getBoard(page, boardId)
    expect(after.width).toBeGreaterThan(before.width + 5)
    expect(after.position.x).toBe(before.position.x)
    expect(after.height).toBe(before.height)
    expect(after.depth).toBe(before.depth)
  })

  test('-X face cube grows width AND shifts position.x leftward', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const boardId = await findBoardIdByName(page, 'Boden')

    await setView(page, 'front')
    await selectBoard(page, assemblyId, boardId)
    await setMode(page, 'scale')
    await fitView(page)
    await page.waitForTimeout(300)

    const before = await getBoard(page, boardId)
    const centre = await boardCentre(page, boardId)
    const cubeWorld = await findHandleWorld(page, centre, 'x', -1, 'cube16')

    const start = await projectToCanvas(page, cubeWorld)
    const end = { x: start.x - 200, y: start.y }

    await dragCanvas(page, start, end)

    const after = await getBoard(page, boardId)
    expect(after.width).toBeGreaterThan(before.width + 5)
    // -X face anchored on the right side, so position.x shifts left
    expect(after.position.x).toBeLessThan(before.position.x - 5)
  })

  test('+Y face cube grows board.height', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const boardId = await findBoardIdByName(page, 'Seitenwand Links')

    await setView(page, 'front')
    await selectBoard(page, assemblyId, boardId)
    await setMode(page, 'scale')
    await fitView(page)
    await page.waitForTimeout(300)

    const before = await getBoard(page, boardId)
    const centre = await boardCentre(page, boardId)
    const cubeWorld = await findHandleWorld(page, centre, 'y', 1, 'cube16')

    const start = await projectToCanvas(page, cubeWorld)
    // World +Y is screen -y in front view
    const end = { x: start.x, y: start.y - 200 }

    await dragCanvas(page, start, end)

    const after = await getBoard(page, boardId)
    expect(after.height).toBeGreaterThan(before.height + 5)
    expect(after.width).toBe(before.width)
    expect(after.depth).toBe(before.depth)
  })
})
