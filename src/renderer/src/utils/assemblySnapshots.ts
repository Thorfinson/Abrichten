import * as THREE from 'three'
import type { Project } from '../types/furniture'
import { activeAssemblies } from './activeParts'
import { boardStepState, type AssemblyPlan, type StepState } from './assemblySteps'
import { buildBoardGeometry } from './boardGeometry'
import type { InstructionImages } from './assemblyInstructions'

/** Picture size in CSS pixels; rendered at twice that for print. */
const WIDTH = 900
const HEIGHT = 600
/** Looking from the front right, a little from above — the way assembly sheets show a cabinet. */
const VIEW_DIR = new THREE.Vector3(1, 0.8, 1.35).normalize()

const STYLE: Record<Exclude<StepState, 'hidden'>, { fill?: string; edge: string }> = {
  normal:  { edge: '#374151' },
  earlier: { fill: '#eceef1', edge: '#a3a9b3' },   // already in place: light grey
  current: { edge: '#111827' }                     // this step: in its own colour, dark outline
}

/**
 * Pictures for the assembly instruction, drawn off screen with the boards as the
 * 3D view builds them (buildBoardGeometry, same position and rotation): the whole
 * model, then each step — earlier steps grey, the step's own parts in colour, later
 * parts left out. One camera for all, framed on the whole model, so the pages read
 * as one sequence. Without WebGL there are no pictures (the document still prints).
 */
export function renderAssemblySnapshots(project: Project, plan: AssemblyPlan): InstructionImages {
  const none: InstructionImages = { steps: plan.steps.map(() => undefined) }
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  } catch {
    return none
  }
  const disposables: { dispose: () => void }[] = []
  try {
    renderer.setPixelRatio(2)
    renderer.setSize(WIDTH, HEIGHT, false)
    renderer.setClearColor('#ffffff', 1)

    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 1.6))
    const key = new THREE.DirectionalLight(0xffffff, 1.8)
    key.position.set(500, 800, 500)
    const fill = new THREE.DirectionalLight(0xffffff, 0.7)
    fill.position.set(-300, 400, -300)
    scene.add(key, fill)

    const parts = activeAssemblies(project).flatMap((a) => a.boards).map((board) => {
      const geometry = buildBoardGeometry(board)
      const edges = new THREE.EdgesGeometry(geometry)
      const surface = new THREE.MeshStandardMaterial({ color: board.color, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
      const line = new THREE.LineBasicMaterial()
      disposables.push(geometry, edges, surface, line)
      const mesh = new THREE.Mesh(geometry, surface)
      mesh.position.set(board.position.x + board.width / 2, board.position.y + board.height / 2, board.position.z + board.depth / 2)
      mesh.rotation.set(...([board.rotation.x, board.rotation.y, board.rotation.z].map((d) => (d * Math.PI) / 180) as [number, number, number]))
      mesh.add(new THREE.LineSegments(edges, line))
      scene.add(mesh)
      return { id: board.id, color: board.color, mesh, surface, line }
    })
    if (parts.length === 0) return none

    const bounds = new THREE.Box3().setFromObject(scene)
    const sphere = bounds.getBoundingSphere(new THREE.Sphere())
    const camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 1, 1)
    const distance = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05
    camera.position.copy(sphere.center).addScaledVector(VIEW_DIR, distance)
    camera.near = Math.max(1, distance - sphere.radius * 2)
    camera.far = distance + sphere.radius * 2
    camera.lookAt(sphere.center)
    camera.updateProjectionMatrix()

    const shot = (stateOf: (id: string) => StepState): string => {
      for (const p of parts) {
        const state = stateOf(p.id)
        p.mesh.visible = state !== 'hidden'
        if (state === 'hidden') continue
        const style = STYLE[state]
        p.surface.color.set(style.fill ?? p.color)
        p.line.color.set(style.edge)
      }
      renderer.render(scene, camera)
      return renderer.domElement.toDataURL('image/png')
    }

    const steps = project.assemblySteps
    return {
      overview: shot(() => 'normal'),
      steps: plan.steps.map((s) => shot((id) => boardStepState(steps, s.index, id)))
    }
  } catch {
    return none
  } finally {
    for (const d of disposables) d.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
