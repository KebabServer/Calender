import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const fromVite = createRequire(require.resolve('vite'))
assert.equal(fromVite.resolve('picomatch'), require.resolve('picomatch'), 'Vite must use the patched matcher')

// A vulnerable matcher can block the event loop; enforce the deadline in a parent process.
for (const pattern of ['+(*)', '+(*a)', '*(*)', '*(*a)', '+(*?a)', '+(?*a)', 'src/+(*a).js']) {
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const match = require('picomatch')(${JSON.stringify(pattern)});
    assert.equal(match('a'.repeat(50) + '!'), false);
    assert.equal(match('src/' + 'a'.repeat(50) + '!.js'), false);
  `], { timeout: 1000, encoding: 'utf8' })
  assert.equal(result.status, 0, `${pattern}: ${result.error ?? result.stderr}`)
}
const { default: picomatch } = await import('picomatch')
assert.ok(picomatch('**/*.{ts,tsx}')('src/components/NotesView.tsx'))
assert.ok(picomatch('src/@(lib|components)/**')('src/lib/events.ts'))
assert.ok(picomatch('**/node_modules/**')('app/node_modules/react/index.js'))
assert.ok(!picomatch('**/*.ts')('src/styles.css'))
console.log('PASS: reported ReDoS inputs finish within the deadline; normal build globs still match.')
