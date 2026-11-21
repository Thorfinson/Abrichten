// Guards the trust boundary (utils/validateProject.ts) for files and the auto-save:
// string names without control characters, upper bounds, typed custom materials /
// hardware, safe colours, formula-safe parameter keys, unknown fields kept.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// the app imports siblings without extension (Vite style); let Node try "<spec>.ts"
registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx) } catch (e) {
      if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  }
})
const { validateProject, validateBoard, MAX_MM, MAX_QUANTITY } = await import('../../src/renderer/src/utils/validateProject.ts')

const board = (extra = {}) => ({ id: 'b', width: 600, height: 720, depth: 18, position: { x: 0, y: 0, z: 0 }, ...extra })
const project = (extra = {}, boards = [board()]) => ({ assemblies: [{ id: 'a', name: 'A', boards, joints: [] }], ...extra })
const firstBoard = (p) => p.assemblies[0].boards[0]

test('names must be strings and lose control characters (no DXF injection)', () => {
  const p = validateProject({
    name: 'Küche\r\n0\r\nLINE',
    assemblies: [{ id: 'a', name: { evil: 1 }, boards: [board({ name: 'Seite\n0\nLINE\n8\nCUT' }), board({ id: 'c', name: 42 })], joints: [
      { id: 'j1', boardA: 'b', boardB: 'c', position: { x: 0, y: 0, z: 0 }, note: { x: 1 } }
    ] }]
  })
  assert.equal(p.name, 'Küche 0 LINE')
  assert.equal(p.assemblies[0].name, 'Baugruppe')
  assert.equal(firstBoard(p).name, 'Seite 0 LINE 8 CUT')
  assert.equal(p.assemblies[0].boards[1].name, 'Brett')
  assert.equal(p.assemblies[0].joints[0].note, undefined)
  assert.ok(!/[\r\n]/.test(JSON.stringify([p.name, firstBoard(p).name])))
})

test('dimensions, positions and quantities have upper bounds', () => {
  assert.equal(MAX_MM, 100_000)
  assert.throws(() => validateProject(project({}, [board({ height: 1e300 })])), /height/)
  assert.throws(() => validateProject(project({}, [board({ width: MAX_MM + 1 })])), /width/)
  assert.throws(() => validateProject(project({}, [board({ position: { x: 0, y: -1e9, z: 0 } })])), /position/)
  const ok = validateProject(project({}, [board({ width: MAX_MM, position: { x: -MAX_MM, y: 0, z: MAX_MM } })]))
  assert.equal(firstBoard(ok).width, MAX_MM)

  const p = validateProject(project({}, [board({
    hardware: [{ hardwareId: 'h1', quantity: 1e12 }, { hardwareId: 'h2', quantity: 4 }, { hardwareId: 'h3', quantity: -1 }],
    cutouts: [{ x: 0, z: 0, width: 1e300, depth: 10 }, { x: 10, z: 10, width: 100, depth: 100 }]
  })]))
  assert.deepEqual(firstBoard(p).hardware, [{ hardwareId: 'h2', quantity: 4 }])
  assert.equal(firstBoard(p).cutouts.length, 1)
  assert.ok(MAX_QUANTITY >= 100)

  const withJoint = validateProject({ assemblies: [{ id: 'a', boards: [board(), board({ id: 'c' })], joints: [
    { id: 'j', boardA: 'b', boardB: 'c', position: { x: 0, y: 0, z: 0 }, fasteners: [
      { type: 'wood_screw', diameter: 5, length: 80, quantity: 1e12 },
      { type: 'wood_screw', diameter: 5, length: 1e300, quantity: 2 },
      { type: 'wood_screw', diameter: 5, length: 80, quantity: 2 }
    ] }
  ] }] })
  assert.equal(withJoint.assemblies[0].joints[0].fasteners.length, 1)
})

test('custom materials and hardware get typed fields; unusable entries are repaired or dropped', () => {
  const p = validateProject(project({
    customMaterials: [
      { id: 'm1', name: { evil: 1 }, nameEn: 7, category: 'lava', density: 'heavy', eModul: 9000, bendingStrength: Infinity,
        defaultThickness: [18, 'x', -3], color: 'url(https://evil.example/x)', grain: 'yes', extra: 'kept' },
      { id: 'm2', name: 'Eiche\nmassiv', nameEn: 'Oak', category: 'solid_wood', density: 700, eModul: 11000, bendingStrength: 90,
        defaultThickness: [20], color: '#a0522d', grain: true },
      { name: 'no id' }
    ],
    customHardware: [
      { id: 'h1', name: ['x'], category: 5, unitPrice: 'free', drillingDiameter: 'big', manufacturer: { a: 1 } },
      { id: 'h2', name: 'Griff', nameEn: 'Handle', category: 'handles', unitPrice: 4.5, drillingDiameter: 5, manufacturer: 'Häfele' }
    ]
  }))
  const [m1, m2] = p.customMaterials
  assert.equal(p.customMaterials.length, 2)
  assert.equal(typeof m1.name, 'string')
  assert.equal(typeof m1.nameEn, 'string')
  assert.equal(m1.category, 'panel')
  assert.ok(Number.isFinite(m1.density) && m1.density > 0)
  assert.equal(m1.eModul, 9000)
  assert.ok(Number.isFinite(m1.bendingStrength))
  assert.deepEqual(m1.defaultThickness, [18])
  assert.match(m1.color, /^#[0-9a-f]{6}$/i)
  assert.equal(m1.grain, false)
  assert.equal(m1.extra, 'kept')
  assert.equal(m2.name, 'Eiche massiv')
  assert.equal(m2.color, '#a0522d')

  const [h1, h2] = p.customHardware
  assert.equal(typeof h1.name, 'string')
  assert.equal(typeof h1.nameEn, 'string')
  assert.equal(typeof h1.category, 'string')
  assert.equal(h1.unitPrice, 0)
  assert.equal(h1.drillingDiameter, undefined)
  assert.equal(h1.manufacturer, undefined)
  assert.deepEqual({ ...h2 }, { id: 'h2', name: 'Griff', nameEn: 'Handle', category: 'handles', unitPrice: 4.5, drillingDiameter: 5, manufacturer: 'Häfele' })
})

test('board colours are hex only; anything else falls back to the default', () => {
  const colours = ['#abc', '#AABBCC', '#aabbcc80', 'url(https://evil.example/x)', 'red; background: url(x)', '#12345', 42]
  const p = validateProject(project({}, colours.map((color, i) => board({ id: `b${i}`, color }))))
  assert.deepEqual(p.assemblies[0].boards.map((b) => b.color), ['#abc', '#AABBCC', '#aabbcc80', '#D2B48C', '#D2B48C', '#D2B48C', '#D2B48C'])
})

test('parameter keys must be identifiers (they are matched inside formulas)', () => {
  const p = validateProject(project({ parameters: { H: 720, _b2: 18, '(\\w|\\w)*!': 1, '(': 2, '1x': 3, 'a b': 4, T: 'x' } }))
  assert.deepEqual(p.parameters, { H: 720, _b2: 18 })
})

test('unknown fields are passed through for forward compatibility', () => {
  const p = validateProject(project({ futureFlag: { v: 2 } }, [board({ futureBoardField: 'x' })]))
  assert.deepEqual(p.futureFlag, { v: 2 })
  assert.equal(firstBoard(p).futureBoardField, 'x')
})

test('validateBoard is exported for other entry points (AI import)', () => {
  assert.throws(() => validateBoard(board({ width: 'abc' }), 'ai[0]'), /ai\[0\]\.width/)
  assert.equal(validateBoard(board({ name: 'x\ty' }), 'ai[0]').name, 'x y')
})

test('part roles: known ones kept, unknown values dropped, files without a role load unchanged', () => {
  const roles = ['visible', 'carcass', 'back', 'substructure', 'drawer', 'worktop', 'plinth', 'appliance']
  const p = validateProject(project({}, [
    ...roles.map((role) => board({ id: role, role })),
    board({ id: 'x1', role: 'front' }), board({ id: 'x2', role: 42 }), board({ id: 'x3', role: { evil: 1 } }), board({ id: 'x4', role: 'Carcass' })
  ]))
  assert.deepEqual(p.assemblies[0].boards.map((b) => b.role), [...roles, undefined, undefined, undefined, undefined])

  // saved and loaded again: the role survives, and an old file gains no field
  const reloaded = validateProject(JSON.parse(JSON.stringify(p)))
  assert.equal(firstBoard(reloaded).role, 'visible')
  const old = validateProject(project())
  assert.equal(firstBoard(old).role, undefined)
  assert.ok(!JSON.stringify(old).includes('"role"'))
  assert.equal(validateBoard(board({ role: 'plinth' }), 'ai[0]').role, 'plinth')
})
