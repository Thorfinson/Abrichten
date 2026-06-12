import { test, expect } from '@playwright/test'
import {
  bootWithSample, selectBoard, setView, setMode, getBoard,
  boardCentre, findHandleWorld, projectToCanvas, fitView, canvasRect,
  getCameraInfo, findBoardIdByName
} from './helpers'

// User report: "I can use middle mouse to move the camera and then it stops
// after a very short time. Same for dragging handlers."
// One plausible cause: pointer capture isn't engaged, so when the mouse
// leaves the canvas mid-drag the move events stop firing on the canvas.
// These tests exercise drags that intentionally leave the canvas bounds.

async function dragWithButton(
  page: import('@playwright/test').Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps: number,
  button: 'left' | 'right' | 'middle'
): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button })
  await page.waitForTimeout(30)
  await page.mouse.move(to.x, to.y, { steps })
  await page.waitForTimeout(30)
  await page.mouse.up({ button })
  await page.waitForTimeout(80)
}

test.describe('Drag continues even when cursor leaves the canvas', () => {
  test('Translate arrow drag survives leaving the canvas (pointer capture)', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, 'front')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'translate')
    await fitView(page)
    await page.waitForTimeout(300)

    const before = await getBoard(page, firstBoardId)
    const centre = await boardCentre(page, firstBoardId)
    const arrowWorld = await findHandleWorld(page, centre, 'x', 1, 'cylinder')
    const rect = await canvasRect(page)
    const start = await projectToCanvas(page, arrowWorld)

    // Drag past the right edge of the canvas
    const end = { x: rect.x + rect.width + 200, y: start.y }
    await dragWithButton(page, start, end, 40, 'left')

    const after = await getBoard(page, firstBoardId)
    // Position must reflect the full drag, not stop at the canvas edge
    expect(after.position.x).toBeGreaterThan(before.position.x + 50)
  })

  test('Resize cube drag survives leaving the canvas', async ({ page }) => {
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
    const rect = await canvasRect(page)
    const start = await projectToCanvas(page, cubeWorld)
    const end = { x: rect.x + rect.width + 150, y: start.y }

    await dragWithButton(page, start, end, 35, 'left')

    const after = await getBoard(page, boardId)
    expect(after.width).toBeGreaterThan(before.width + 50)
  })

  test('FRONT view: middle-click pan continues past the canvas edge', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, 'front')
    await fitView(page)
    await page.waitForTimeout(200)

    const rect = await canvasRect(page)
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2

    const before = await getCameraInfo(page)
    // Drag to the right edge of the canvas + 200 (outside the canvas)
    const targetX = rect.x + rect.width + 200
    await dragWithButton(page, { x: cx, y: cy }, { x: targetX, y: cy }, 50, 'middle')

    const after = await getCameraInfo(page)
    const dx = Math.abs(after.position.x - before.position.x)
    const dy = Math.abs(after.position.y - before.position.y)
    expect(dx + dy).toBeGreaterThan(100)
  })

  test('FRONT view: right-click pan continues past canvas edge', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, 'front')
    await fitView(page)
    await page.waitForTimeout(200)

    const rect = await canvasRect(page)
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2

    const before = await getCameraInfo(page)
    const targetY = rect.y + rect.height + 200
    await dragWithButton(page, { x: cx, y: cy }, { x: cx, y: targetY }, 50, 'right')

    const after = await getCameraInfo(page)
    const dx = Math.abs(after.position.x - before.position.x)
    const dy = Math.abs(after.position.y - before.position.y)
    expect(dx + dy).toBeGreaterThan(100)
  })
})
