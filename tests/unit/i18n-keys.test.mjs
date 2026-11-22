// Every text key the renderer asks for literally — t('section.key') — exists in German and in
// English, so no screen shows a raw key like "partLabel.renumber".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOT = new URL('../../src/renderer/src/', import.meta.url).pathname
const KEY = /\bt\(\s*['"]([a-zA-Z][\w]*(?:\.[\w]+)+)['"]/g

async function sources(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await sources(path))
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path)
  }
  return out
}
const lookup = (obj, key) => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj)

test('every literal text key exists in de and en', async () => {
  const de = JSON.parse(await readFile(join(ROOT, 'i18n/de.json'), 'utf8'))
  const en = JSON.parse(await readFile(join(ROOT, 'i18n/en.json'), 'utf8'))
  const missing = []
  let count = 0
  for (const file of await sources(ROOT)) {
    const text = await readFile(file, 'utf8')
    for (const [, key] of text.matchAll(KEY)) {
      count++
      for (const [lang, dict] of [['de', de], ['en', en]]) {
        // plural keys (key_one / key_other) count as present
        if (typeof lookup(dict, key) !== 'string' && typeof lookup(dict, `${key}_one`) !== 'string') {
          missing.push(`${lang}: ${key}  (${relative(ROOT, file)})`)
        }
      }
    }
  }
  assert.ok(count > 200, `keys found (${count})`)
  assert.deepEqual([...new Set(missing)], [])
})
