/* Verifies the pure pagination maths in src/lib/pagination.ts.
   Run: node scripts/pagination-test.mjs */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const out = mkdtempSync(join(tmpdir(), 'cpos-pagination-'))
ts.createProgram(['src/lib/pagination.ts'], {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  outDir: out,
}).emit()

const file = join(out, 'pagination.js')
writeFileSync(file, readFileSync(file, 'utf8'))

const { pageSlice, pageWindow, DEFAULT_PAGE_SIZE } = await import(pathToFileURL(file).href)

let failures = 0
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`)
  if (!cond) failures++
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

check('default page size is 10', DEFAULT_PAGE_SIZE === 10)

// --- pageSlice --------------------------------------------------------------
check('empty list → page 1 of 1, no rows',
  eq(pageSlice(0, 1, 10), { page: 1, totalPages: 1, start: 0, from: 0, to: 0 }))
check('25 rows, page 1 → 1–10 of 3 pages',
  eq(pageSlice(25, 1, 10), { page: 1, totalPages: 3, start: 0, from: 1, to: 10 }))
check('25 rows, last page → 21–25 (partial)',
  eq(pageSlice(25, 3, 10), { page: 3, totalPages: 3, start: 20, from: 21, to: 25 }))
check('exactly divisible → no phantom trailing page',
  eq(pageSlice(30, 3, 10), { page: 3, totalPages: 3, start: 20, from: 21, to: 30 }))
check('page past the end is clamped inwards',
  pageSlice(25, 9, 10).page === 3 && pageSlice(25, 9, 10).to === 25)
check('page 0 / negative is clamped to 1', pageSlice(25, 0, 10).page === 1 && pageSlice(25, -5, 10).page === 1)
check('pageSize 0 falls back to the default', pageSlice(25, 1, 0).totalPages === 3)
check('a shrunken list never yields a negative start',
  pageSlice(3, 5, 10).start === 0 && pageSlice(3, 5, 10).to === 3)
check('25 rows on 1 page of 100 → all rows',
  eq(pageSlice(25, 1, 100), { page: 1, totalPages: 1, start: 0, from: 1, to: 25 }))

// The slice actually selects the right rows.
const rows = Array.from({ length: 25 }, (_, i) => i + 1)
const slice = (page, size) => {
  const s = pageSlice(rows.length, page, size)
  return rows.slice(s.start, s.start + size)
}
check('page 2 of 10 selects rows 11–20', eq(slice(2, 10), rows.slice(10, 20)))
check('last page selects the remainder', eq(slice(3, 10), rows.slice(20, 25)))
check('every page together covers the list exactly once',
  eq([...slice(1, 10), ...slice(2, 10), ...slice(3, 10)], rows))

// --- pageWindow -------------------------------------------------------------
check('one page → single button', eq(pageWindow(1, 1), [1]))
check('seven pages → no gaps', eq(pageWindow(4, 7), [1, 2, 3, 4, 5, 6, 7]))
check('twenty pages on page 1 → leading window + tail',
  eq(pageWindow(1, 20), [1, 2, 'gap', 20]))
check('twenty pages on page 10 → both gaps',
  eq(pageWindow(10, 20), [1, 'gap', 9, 10, 11, 'gap', 20]))
check('twenty pages on the last page → tail window',
  eq(pageWindow(20, 20), [1, 'gap', 19, 20]))
check('out-of-range page still yields a sane window',
  eq(pageWindow(99, 20), [1, 'gap', 19, 20]) && eq(pageWindow(0, 20), [1, 2, 'gap', 20]))
check('the window never repeats a page',
  new Set(pageWindow(10, 20).filter((p) => p !== 'gap')).size ===
    pageWindow(10, 20).filter((p) => p !== 'gap').length)

console.log(failures === 0 ? '\nAll pagination checks passed' : `\n${failures} FAILED`)
process.exitCode = failures === 0 ? 0 : 1
