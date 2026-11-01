import * as THREE from 'three'
import type { BoardStatic } from '../../services/static-sim'

/*
 * Geometry of the 2D load-simulation result (services/static-sim.ts) for the static
 * overlay: the board's finite-element grid as a mesh (both broad faces and the edge
 * faces round the outline and the cutouts) with a colour per node, optionally
 * displaced by the deflection, and contour lines over it. Positions are relative to the
 * box centre, so the transparent meshes sort by their real depth.
 */

export type Vec = [number, number, number]
type Axis = 'x' | 'y' | 'z'

/** The field's grid axes A, B (field.axes) and the board's thickness axis C with its extent. */
export interface Frame { A: Axis; B: Axis; C: Axis; c0: number; c1: number }

const AXES: Axis[] = ['x', 'y', 'z']
const unit = (k: Axis): THREE.Vector3 => new THREE.Vector3(k === 'x' ? 1 : 0, k === 'y' ? 1 : 0, k === 'z' ? 1 : 0)

export function frameOf(r: BoardStatic): Frame {
  const [A, B] = r.field.axes
  const C = AXES.find((k) => k !== A && k !== B)!
  const lo = { x: r.box.x0, y: r.box.y0, z: r.box.z0 }, hi = { x: r.box.x1, y: r.box.y1, z: r.box.z1 }
  return { A, B, C, c0: lo[C], c1: hi[C] }
}

export function boxCentre(r: BoardStatic): Vec {
  return [(r.box.x0 + r.box.x1) / 2, (r.box.y0 + r.box.y1) / 2, (r.box.z0 + r.box.z1) / 2]
}

/** World point from grid coordinates (a, b) and the thickness coordinate c. */
export function place(f: Frame, a: number, b: number, c: number): Vec {
  const p: Record<Axis, number> = { x: 0, y: 0, z: 0 }
  p[f.A] = a; p[f.B] = b; p[f.C] = c
  return [p.x, p.y, p.z]
}

/**
 * Displacement drawn at node n along A, B, C, at deformation scale s: a lying board
 * sags (C is up), a standing board moves in its plane (B is up).
 */
export function displacement(r: BoardStatic, f: Frame, n: number, s: number): [number, number, number] {
  if (!s) return [0, 0, 0]
  const w = r.field.w[n] ?? 0
  if (f.C === 'y') return [0, 0, -w * s]
  return [(r.field.da?.[n] ?? 0) * s, -w * s, 0]
}

/** The field node nearest to a world point. */
export function nodeNear(r: BoardStatic, p: { x: number; y: number; z: number }): number {
  const f = frameOf(r), fld = r.field
  const pa = p[f.A], pb = p[f.B]
  const near = (lines: number[], v: number): number => lines.reduce((best, x, k) => (Math.abs(x - v) < Math.abs(lines[best] - v) ? k : best), 0)
  return near(fld.b, pb) * fld.a.length + near(fld.a, pa)
}

/** A world point on the board's top (lying) or front (standing) at node n, displaced. */
export function nodeWorld(r: BoardStatic, n: number, scale: number, side: 'hi' | 'mid' = 'hi'): Vec {
  const f = frameOf(r), fld = r.field
  const na = fld.a.length
  const [da, db, dc] = displacement(r, f, n, scale)
  const c = side === 'hi' ? f.c1 : (f.c0 + f.c1) / 2
  return place(f, fld.a[n % na] + da, fld.b[Math.floor(n / na)] + db, c + dc)
}

export interface Rgba { r: number; g: number; b: number; a: number }

export interface FieldMeshOptions {
  /** Value per node (utilisation or sag share), also stored per vertex as `value` */
  values: ArrayLike<number>
  /** Deformation scale (0: undeformed) */
  scale: number
  /** Colour and opacity of a value */
  color: (v: number) => Rgba
  /** Distance the overlay sits outside the board, mm */
  inflate: number
}

/** The board's field as a mesh: broad faces with a colour per node, edge faces round every outline. */
export function fieldGeometry(r: BoardStatic, opts: FieldMeshOptions): THREE.BufferGeometry {
  const f = frameOf(r), fld = r.field
  const na = fld.a.length, nb = fld.b.length
  const centre = boxCentre(r)
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], values: number[] = [], index: number[] = []
  const handed = unit(f.A).cross(unit(f.B)).dot(unit(f.C))   // +1: A × B points along +C
  const vertex = (p: Vec, nrm: Vec, n: number): number => {
    const v = opts.values[n] ?? 0
    const c = opts.color(v)
    positions.push(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2])
    normals.push(...nrm)
    colors.push(c.r, c.g, c.b, c.a)
    values.push(v)
    return positions.length / 3 - 1
  }
  const at = (n: number, side: number): Vec => {
    const [da, db, dc] = displacement(r, f, n, opts.scale)
    return place(f, fld.a[n % na] + da, fld.b[Math.floor(n / na)] + db, (side > 0 ? f.c1 + opts.inflate : f.c0 - opts.inflate) + dc)
  }
  // Normal of a broad face: tilted by a sagging plate's slope, else straight along ±C
  const faceNormal = (n: number, side: number): Vec => {
    const i = n % na, j = Math.floor(n / na)
    let sa = 0, sb = 0
    if (opts.scale && f.C === 'y') {
      const dc = (k: number): number => displacement(r, f, k, opts.scale)[2]
      const i0 = Math.max(0, i - 1), i1 = Math.min(na - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(nb - 1, j + 1)
      sa = (dc(j * na + i1) - dc(j * na + i0)) / Math.max(1e-9, fld.a[i1] - fld.a[i0])
      sb = (dc(j1 * na + i) - dc(j0 * na + i)) / Math.max(1e-9, fld.b[j1] - fld.b[j0])
    }
    const v = new THREE.Vector3().addScaledVector(unit(f.A), -sa).addScaledVector(unit(f.B), -sb).addScaledVector(unit(f.C), 1).normalize()
    return side > 0 ? [v.x, v.y, v.z] : [-v.x, -v.y, -v.z]
  }
  const cellOn = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < na - 1 && j < nb - 1 && fld.cells[j * (na - 1) + i] === 1

  // Broad faces (top / bottom of a lying board, front / back of a standing one)
  for (const side of [1, -1]) {
    const ids = new Int32Array(na * nb).fill(-1)
    const id = (n: number): number => (ids[n] >= 0 ? ids[n] : (ids[n] = vertex(at(n, side), faceNormal(n, side), n)))
    for (let j = 0; j < nb - 1; j++) {
      for (let i = 0; i < na - 1; i++) {
        if (!cellOn(i, j)) continue
        const n00 = id(j * na + i), n10 = id(j * na + i + 1), n11 = id((j + 1) * na + i + 1), n01 = id((j + 1) * na + i)
        if (handed * side > 0) index.push(n00, n10, n11, n00, n11, n01)
        else index.push(n00, n11, n10, n00, n01, n11)
      }
    }
  }
  // Edge faces where a cell has no neighbour (outline and cutouts), pushed out by `inflate`
  const edge = (n1: number, n2: number, out: THREE.Vector3): void => {
    const shift = out.clone().multiplyScalar(opts.inflate)
    const p = (n: number, side: number): Vec => {
      const q = at(n, side)
      return [q[0] + shift.x, q[1] + shift.y, q[2] + shift.z]
    }
    const nrm: Vec = [out.x, out.y, out.z]
    const v = [vertex(p(n1, 1), nrm, n1), vertex(p(n2, 1), nrm, n2), vertex(p(n2, -1), nrm, n2), vertex(p(n1, -1), nrm, n1)]
    const P = (k: number): THREE.Vector3 => new THREE.Vector3(positions[3 * v[k]], positions[3 * v[k] + 1], positions[3 * v[k] + 2])
    const facing = new THREE.Vector3().subVectors(P(1), P(0)).cross(new THREE.Vector3().subVectors(P(2), P(0))).dot(out)
    if (facing >= 0) index.push(v[0], v[1], v[2], v[0], v[2], v[3])
    else index.push(v[0], v[2], v[1], v[0], v[3], v[2])
  }
  const eA = unit(f.A), eB = unit(f.B)
  for (let j = 0; j < nb - 1; j++) {
    for (let i = 0; i < na - 1; i++) {
      if (!cellOn(i, j)) continue
      const n00 = j * na + i, n10 = n00 + 1, n01 = n00 + na, n11 = n01 + 1
      if (!cellOn(i - 1, j)) edge(n00, n01, eA.clone().negate())
      if (!cellOn(i + 1, j)) edge(n10, n11, eA)
      if (!cellOn(i, j - 1)) edge(n00, n10, eB.clone().negate())
      if (!cellOn(i, j + 1)) edge(n01, n11, eB)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
  geo.setAttribute('value', new THREE.Float32BufferAttribute(values, 1))
  geo.setIndex(index)
  return geo
}

/**
 * Contour lines of `values` at `levels` (marching squares per cell), on the top of a
 * lying board or both faces of a standing one, lifted `lift` mm off the surface.
 */
export function contourGeometry(r: BoardStatic, values: ArrayLike<number>, levels: readonly number[], scale: number, lift: number): THREE.BufferGeometry {
  const f = frameOf(r), fld = r.field
  const na = fld.a.length, nb = fld.b.length
  const centre = boxCentre(r)
  const out: number[] = []
  const sides = f.C === 'y' ? [1] : [1, -1]
  for (let j = 0; j < nb - 1; j++) {
    for (let i = 0; i < na - 1; i++) {
      if (fld.cells[j * (na - 1) + i] !== 1) continue
      const corner = [j * na + i, j * na + i + 1, (j + 1) * na + i + 1, (j + 1) * na + i]
      const v = corner.map((n) => values[n] ?? 0)
      for (const level of levels) {
        if (Math.max(...v) < level || Math.min(...v) >= level) continue
        const pts: { n1: number; n2: number; t: number }[] = []
        for (let k = 0; k < 4; k++) {
          const a = v[k], b = v[(k + 1) % 4]
          if ((a >= level) !== (b >= level)) pts.push({ n1: corner[k], n2: corner[(k + 1) % 4], t: (level - a) / (b - a) })
        }
        for (let p = 0; p + 1 < pts.length; p += 2) {
          for (const side of sides) {
            for (const q of [pts[p], pts[p + 1]]) {
              const lerp = (x: number, y: number): number => x + (y - x) * q.t
              const d1 = displacement(r, f, q.n1, scale), d2 = displacement(r, f, q.n2, scale)
              const a = lerp(fld.a[q.n1 % na] + d1[0], fld.a[q.n2 % na] + d2[0])
              const b = lerp(fld.b[Math.floor(q.n1 / na)] + d1[1], fld.b[Math.floor(q.n2 / na)] + d2[1])
              const c = (side > 0 ? f.c1 + lift : f.c0 - lift) + lerp(d1[2], d2[2])
              const w = place(f, a, b, c)
              out.push(w[0] - centre[0], w[1] - centre[1], w[2] - centre[2])
            }
          }
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3))
  return geo
}
