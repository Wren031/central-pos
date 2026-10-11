/* Byte-level verification that the ESC/POS encoder emits real printer commands.
   Run: node scripts/print-escpos-test.mjs */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const out = mkdtempSync(join(tmpdir(), 'cpos-print-'))

const files = [
  'src/lib/print/escpos.ts',
  'src/lib/print/receipt.ts',
  'src/lib/format.ts',
  'src/lib/mock-clock.ts',
  'src/lib/types.ts',
]

const program = ts.createProgram(files, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  outDir: out,
})
program.emit()

// tsc (bundler resolution) emits extensionless relative imports — patch them.
const receiptPath = join(out, 'print', 'receipt.js')
let receiptSrc = readFileSync(receiptPath, 'utf8')
receiptSrc = receiptSrc
  .replace("from './escpos'", "from './escpos.js'")
  .replace("from '../format'", "from '../format.js'")
  .replace("from '../types'", "from '../types.js'")
writeFileSync(receiptPath, receiptSrc)
const formatPath = join(out, 'format.js')
let formatSrc = readFileSync(formatPath, 'utf8')
formatSrc = formatSrc.replace("from './mock-clock'", "from './mock-clock.js'")
writeFileSync(formatPath, formatSrc)

// Load and run assertions.
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

const { buildReceipt, buildTestReceipt } = await import(pathToFileURL(receiptPath).href)
const { DEFAULT_RECEIPT_LAYOUT } = await import(pathToFileURL(join(out, 'types.js')).href)

let failures = 0
function check(name, cond) {
  if (cond) console.log(`PASS ${name}`)
  else {
    console.log(`FAIL ${name}`)
    failures++
  }
}

function hex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')
}

const ESC = 0x1b
const GS = 0x1d

const order = {
  id: 'ord_1',
  storeId: 'str_1',
  userId: 'usr_1',
  receiptNo: 'RCP-00042',
  items: [
    { productId: 'p1', name: 'Pork BBQ Stick', price: 25, qty: 2 },
    { productId: 'p2', name: 'Rice', price: 15, qty: 1 },
  ],
  subtotal: 65,
  discount: 0,
  total: 65,
  paymentStatus: 'paid',
  customerName: 'Juan Cruz',
  createdAt: '2026-10-11T10:30:00.000Z',
}

const bytes = buildReceipt(order, {
  storeName: 'Dela Cruz BBQ House',
  storeAddress: '123 Rizal Street, Quezon City',
  paperWidth: 80,
})
const h = hex(bytes)

// 1. Starts with ESC @ (init)
check('receipt starts with ESC @ init', bytes[0] === ESC && bytes[1] === 0x40)

// 2. Header block contains ESC a 1 (center) before the store name
const storeIdx = bytes.findIndex((b) => b === 'D'.charCodeAt(0))
const header = bytes.slice(0, storeIdx)
const centered = header.includes(0x1b) && header.includes(0x61) && header.includes(0x01)
check('store name preceded by ESC a 1 (center) in header', storeIdx > 0 && centered)

// 3. Contains receipt number text
check(
  'receipt number present',
  h.includes(hex(Array.from('RCP-00042').map((c) => c.charCodeAt(0))))
)

// 4. Contains item names and amounts
check(
  'item name present',
  h.includes(hex(Array.from('Pork BBQ Stick').map((c) => c.charCodeAt(0))))
)
check('total amount present', h.includes(hex(Array.from('65.00').map((c) => c.charCodeAt(0)))))

// 5. Contains payment status
check(
  'payment status present',
  h.includes(hex(Array.from('STATUS: PAID').map((c) => c.charCodeAt(0))))
)

// 6. Ends with GS V (cut) — last bytes are 1d 56 42 00
const tail = bytes.slice(-4)
check('receipt ends with GS V 42 00 (partial cut)', tail[0] === GS && tail[1] === 0x56 && tail[2] === 0x42)

// 7. 58mm paper is narrower (fewer dash chars in separator)
const narrow = buildReceipt(order, { storeName: 'X', paperWidth: 58 })
const wide = buildReceipt(order, { storeName: 'X', paperWidth: 80 })
check(
  '58mm receipt has 32-col separators',
  hex(narrow).includes(hex(Array.from('-'.repeat(32)).map((c) => c.charCodeAt(0))))
)
check(
  '80mm receipt has 48-col separators',
  hex(wide).includes(hex(Array.from('-'.repeat(48)).map((c) => c.charCodeAt(0))))
)

// 8. Test receipt has self-test content
const test = buildTestReceipt('Test Store', 58)
check(
  'test receipt contains SELF TEST',
  hex(test).includes(hex(Array.from('SELF TEST').map((c) => c.charCodeAt(0))))
)

// 9. Non-ASCII is sanitized
const peso = buildReceipt({ ...order, receiptNo: '₱100' }, { storeName: 'Test', paperWidth: 58 })
check('non-ASCII sanitized to ?', !peso.includes(0x20b1) && hex(peso).includes('3f'))

// 10. Default layout keeps the classic look: TIN line + default footer
check('default layout prints TIN line', hex(bytes).includes(hex(Array.from('VAT Reg. TIN').map((c) => c.charCodeAt(0)))))
check(
  'default layout prints default footer',
  hex(bytes).includes(hex(Array.from('Salamat po! Please come again.').map((c) => c.charCodeAt(0))))
)

// 11. Custom layout: hide TIN + address, custom footer, no breakdown, qty-only items
const custom = buildReceipt(order, {
  storeName: 'BBQ Hub',
  storeAddress: '123 Main St',
  paperWidth: 80,
  layout: {
    ...DEFAULT_RECEIPT_LAYOUT,
    showTin: false,
    showAddress: false,
    showBreakdown: false,
    showUnitPrice: false,
    headerStyle: 'compact',
    footerText: 'Thank you!',
  },
})
const ch = hex(custom)
check('layout hides TIN when disabled', !ch.includes(hex(Array.from('VAT Reg. TIN').map((c) => c.charCodeAt(0)))))
check('layout hides address when disabled', !ch.includes(hex(Array.from('123 Main St').map((c) => c.charCodeAt(0)))))
check(
  'layout uses custom footer text',
  ch.includes(hex(Array.from('Thank you!').map((c) => c.charCodeAt(0))))
)
check(
  'layout hides subtotal breakdown when disabled',
  !ch.includes(hex(Array.from('Subtotal').map((c) => c.charCodeAt(0)))) &&
    ch.includes(hex(Array.from('TOTAL').map((c) => c.charCodeAt(0))))
)
check(
  'layout shows qty-only items when unit price hidden',
  !ch.includes(hex(Array.from('2 x 25.00').map((c) => c.charCodeAt(0))))
)

// 12. Font size maps to real GS ! steps and never corrupts the header budget.
function sizeFlags(b) {
  const flags = []
  for (let i = 0; i < b.length - 2; i++) {
    if (b[i] === GS && b[i + 1] === 0x21) flags.push(b[i + 2])
  }
  return flags
}
// ESC ! n — the budget-printer size fallback some units require.
function printModeFlags(b) {
  const flags = []
  for (let i = 0; i < b.length - 2; i++) {
    if (b[i] === ESC && b[i + 1] === 0x21) flags.push(b[i + 2])
  }
  return flags
}
const withFont = (fontSize, storeName = 'STORE') =>
  buildReceipt(order, {
    storeName,
    paperWidth: 80,
    layout: { ...DEFAULT_RECEIPT_LAYOUT, fontSize },
  })
const smallB = withFont('small')
const mediumB = withFont('medium')
const largeB = withFont('large')
check('font small uses GS ! 00 (native)', sizeFlags(smallB).includes(0x00))
check('font medium uses GS ! 10 (double width)', sizeFlags(mediumB).includes(0x10))
check('font large uses GS ! 11 (double both)', sizeFlags(largeB).includes(0x11))
check(
  'font small mirrors ESC ! 00 (native)',
  printModeFlags(smallB).includes(0x00)
)
check(
  'font medium mirrors ESC ! double-width bit',
  printModeFlags(mediumB).some((f) => (f & 0x20) === 0x20)
)
check(
  'font large mirrors ESC ! double-width + double-height bits',
  printModeFlags(largeB).some((f) => (f & 0x30) === 0x30)
)
// Every size change must be a paired ESC ! + GS ! block (ESC ! immediately
// before GS !), so the last command still wins for printers that honor GS !.
function hasPairedMode(within, gsN) {
  for (let i = 0; i < within.length - 5; i++) {
    if (
      within[i] === ESC && within[i + 1] === 0x21 &&
      within[i + 3] === GS && within[i + 4] === 0x21 && within[i + 5] === gsN
    ) return true
  }
  return false
}
check(
  'double-size header sends ESC ! immediately before GS ! 11',
  hasPairedMode(smallB, 0x11)
)
check(
  'body size sends ESC ! immediately before GS ! 00',
  hasPairedMode(smallB, 0x00)
)
check(
  'medium body halves separators to 24 cols',
  hex(mediumB).includes(hex(Array.from('-'.repeat(24)).map((c) => c.charCodeAt(0))))
)
const longName = 'DELA CRUZ BBQ HOUSE'
check(
  'header not truncated by the body font size',
  hex(withFont('medium', longName)).includes(hex(Array.from(longName).map((c) => c.charCodeAt(0))))
)

console.log(failures === 0 ? '\nAll ESC/POS checks passed' : `\n${failures} checks FAILED`)
process.exit(failures === 0 ? 0 : 1)
