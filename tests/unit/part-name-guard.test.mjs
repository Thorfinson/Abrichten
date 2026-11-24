// Guard: wherever the app names a part, the part label ("Herd 2", utils/partLabel.ts)
// comes with it, so paper and screen always match. Every use of a part's name in the
// renderer must go through partTitle / <PartName> / the label map — or carry a
// `part-name-ok: <reason>` note on the same or the previous line (an edit field for the
// name, a sort key, a column next to the label column …). A new place that shows a part
// by its name alone makes this test fail.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOT = new URL('../../src/renderer/src/', import.meta.url).pathname
/** Not UI: the data model, the store and the file check never show a name */
const SKIP = [/^store\//, /^types\//, /^i18n\//, /^utils\/partLabel\.ts$/, /^utils\/validateProject\.ts$/]
/** A part's name: board.name, b.name, boardA?.name, p.board.name, row.board.name, boardName … — not 'board.name' (a text key) */
const PART_NAME = /(?<![\w'"`.])(?:board|boardA|boardB|partner|b|piece)\??\.name\b|\.board\??\.name\b|\bboardName\b/
const WITH_LABEL = /partTitle\(|PartName|labels\.get\(|part-name-ok/

async function sources(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await sources(path))
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path)
  }
  return out
}

test('every place that names a part shows its label too (or says why not)', async () => {
  const offenders = []
  let checked = 0
  for (const file of await sources(ROOT)) {
    const rel = relative(ROOT, file)
    if (SKIP.some((r) => r.test(rel))) continue
    const lines = (await readFile(file, 'utf8')).split('\n')
    lines.forEach((line, i) => {
      if (!PART_NAME.test(line)) return
      checked++
      if (WITH_LABEL.test(line) || WITH_LABEL.test(lines[i - 1] ?? '')) return
      offenders.push(`${rel}:${i + 1}  ${line.trim()}`)
    })
  }
  assert.ok(checked > 20, `the guard sees the part names (${checked})`)
  assert.deepEqual(offenders, [], `parts named without their label:\n${offenders.join('\n')}`)
})

test('the guard catches a part shown by its name alone', () => {
  for (const line of ['<span>{board.name}</span>', '{partner?.name ?? "?"}', '`${row.board.name}`', 'name: b.name,', 'h.boardName']) {
    assert.ok(PART_NAME.test(line) && !WITH_LABEL.test(line), line)
  }
  for (const line of ["t('board.name')", 'mat.name', 'project.name', 'assembly.name', 'item.name', '{partTitle(label, board.name)}']) {
    assert.ok(!PART_NAME.test(line) || WITH_LABEL.test(line), line)
  }
})
