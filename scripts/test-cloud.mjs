import { spawn, execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'

const require = createRequire(import.meta.url)
const exec = promisify(execFile)
const vite = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js')
const server = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {stdio:'inherit',env:{...process.env,VITE_BASE_PATH:'/Calender/'}})
try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Cloud test preview stopped before becoming ready')
    try { ready = (await fetch('http://127.0.0.1:4173/Calender/')).ok } catch { /* Starting preview. */ }
    if (ready) break
    await new Promise(resolve => setTimeout(resolve,100))
  }
  if (!ready) throw new Error('Cloud test preview did not start')
  for (const file of ['cloud-save-safety.mjs','cloud-updates.mjs','cloud-tasks.mjs','security-cloud.mjs','cloud-weekly.mjs']) {
    const {stdout,stderr} = await exec(process.execPath, [`tests/${file}`], {
      env:{...process.env, PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath()},
      timeout:90000,
    })
    process.stdout.write(stdout)
    process.stderr.write(stderr)
  }
} finally { server.kill('SIGTERM') }
