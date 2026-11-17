// Temporary mitigation for GHSA-fc5q-39xc-vjpf; no patched npm release exists.
// Risky single-branch repeated extglobs use picomatch's existing literal fallback.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const root = dirname(require.resolve('picomatch/package.json'))
const path = join(root, 'lib/parse.js')
const originalHash = '4e1e05447668aa1e94366c5516a2bcd8f5fff800cc92b1d0cd7d77703b8618c4'
const original = '  const branches = splitTopLevel(body).map(branch => branch.trim());\n\n  if (branches.length > 1) {'
const patched = `  const branches = splitTopLevel(body).map(branch => branch.trim());

  // Daymark: GHSA-fc5q-39xc-vjpf, single-branch wildcard repetition can backtrack exponentially.
  if (branches.length === 1 && /[*?]/.test(branches[0])) {
    return { risky: true };
  }

  if (branches.length > 1) {`
const source = readFileSync(path, 'utf8')
const restored = source.includes(patched) ? source.replace(patched, original) : source
if (require(join(root, 'package.json')).version !== '4.0.7'
  || createHash('sha256').update(restored).digest('hex') !== originalHash) {
  throw new Error('Picomatch changed: re-evaluate the temporary security patch before building.')
}
if (!source.includes(patched)) writeFileSync(path, source.replace(original, patched))
console.log('Applied picomatch repeated-extglob security mitigation.')
