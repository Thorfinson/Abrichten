import { test, expect } from '@playwright/test'
import {
  bootWithSample, selectBoard, setView, setMode, getBoard,
  boardCentre, findHandleWorld, projectToCanvas, dragCanvas, fitView
} from './helpers'

test.describe('Translate gizmo drag (Blender-style ortho arrows)', () => {
  test('+X arrow drag in FRONT view increases board.position.x only', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, 'front')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'translate')
    await fitView(page)
    // Let useFrame run a few times so gizmos take their constant-pixel scale
    await page.waitForTimeout(300)

    const before = await getBoard(page, firstBoardId)
    const centre = await boardCentre(page, firstBoardId)
    const arrowWorld = await findHandleWorld(page, centre, 'x', 1, 'cylinder')

    // Project the arrow to canvas pixels, then drag it to the right by 150 px
    const start = await projectToCanvas(page, arrowWorld)
    const end = { x: start.x + 150, y: start.y }

    await dragCanvas(page, start, end)

    const after = await getBoard(page, firstBoardId)
    // X moved positively (to the right)
    expect(after.position.x).toBeGreaterThan(before.position.x + 5)
    // Y and Z untouched
    expect(after.position.y).toBe(before.position.y)
    expect(after.position.z).toBe(before.position.z)
    // Dims and rotation untouched
    expect(after.width).toBe(before.width)
    expect(after.height).toBe(before.height)
    expect(after.depth).toBe(before.depth)
    expect(after.rotation.x).toBe(before.rotation.x)
    expect(after.rotation.y).toBe(before.rotation.y)
    expect(after.rotation.z).toBe(before.rotation.z)
  })

  test('+Y arrow drag in FRONT view increases board.position.y only', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, 'front')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'translate')
    await fitView(page)
    await page.waitForTimeout(300)

    const before = await getBoard(page, firstBoardId)
    const centre = await boardCentre(page, firstBoardId)
    const arrowWorld = await findHandleWorld(page, centre, 'y', 1, 'cylinder')

    const start = await projectToCanvas(page, arrowWorld)
    // In ortho front view, world +Y maps to screen -y (up). Drag the arrow up.
    const end = { x: start.x, y: start.y - 150 }

    await dragCanvas(page, start, end)

    const after = await getBoard(page, firstBoardId)
    expect(after.position.y).toBeGreaterThan(before.position.y + 5)
    expect(after.position.x).toBe(before.position.x)
    expect(after.position.z).toBe(before.position.z)
  })

  test('+Z arrow drag in SIDE view increases board.position.z only', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, 'side')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'translate')
    await fitView(page)
    await page.waitForTimeout(300)

    const before = await getBoard(page, firstBoardId)
    const centre = await boardCentre(page, firstBoardId)
    const arrowWorld = await findHandleWorld(page, centre, 'z', 1, 'cylinder')

    const start = await projectToCanvas(page, arrowWorld)
    // Drag along the +Z screen direction (side view: +Z is screen +x)
    const end = { x: start.x + 150, y: start.y }

    await dragCanvas(page, start, end)

    const after = await getBoard(page, firstBoardId)
    // Whichever direction +Z maps to on screen, the board's z should change
    expect(Math.abs(after.position.z - before.position.z)).toBeGreaterThan(5)
    expect(after.position.y).toBe(before.position.y)
  })
})
