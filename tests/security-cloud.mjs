// Run against a cloud-configured production preview on port 4173.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const deadline = setTimeout(() => { console.error('Security smoke test exceeded 45s'); process.exit(1) }, 45000)
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium' })
try {
 const page = await browser.newPage()
 await page.route('https://fonts.googleapis.com/**', route => route.abort())
 await page.route('https://fonts.gstatic.com/**', route => route.abort())
 page.on('pageerror', e => console.error(e.message))
 const account = id => ({ id, aud: 'authenticated', role: 'authenticated', email: `${id}@example.test`, created_at: new Date().toISOString() })
 const expires = Math.floor(Date.now()/1000)+3600
 const token = id => `${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:expires})).toString('base64url')}.test`
 const session = id => ({ access_token:token(id),refresh_token:`refresh-${id}`,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:account(id) })
 await page.addInitScript(s => localStorage.setItem('sb-tktgencmwtanxjfkiadc-auth-token',JSON.stringify(s)),session('account-a'))
 let hold = false, release, requested
 const held = new Promise(r => requested=r)
 const released = new Promise(r => release=r)
 await page.route('https://tktgencmwtanxjfkiadc.supabase.co/**',async route => {
  const u = new URL(route.request().url())
  const a = route.request().headers().authorization?.includes(token('account-a'))
  if(u.pathname.includes('/rest/v1/notes')) {
   if(hold && a) { requested(); await released }
   return route.fulfill({json:[{id:a?'note-a':'note-b',title:a?'PRIVATE ACCOUNT A':'ACCOUNT B',content:'content',pinned:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}]})
  }
  if(u.pathname.includes('/rest/v1/events')) return route.fulfill({json:[]})
  if(u.pathname.includes('/auth/v1/logout')) return route.fulfill({status:204,body:''})
  if(u.pathname.includes('/auth/v1/token')) return route.fulfill({json:session('account-b')})
  return route.fulfill({json:{}})
 })
 console.log('Opening mocked cloud app')
 await page.goto('http://127.0.0.1:4173/Calender/',{waitUntil:'domcontentloaded'})
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Notes',exact:true}).click()
 await page.getByRole('button').filter({hasText:'PRIVATE ACCOUNT A'}).waitFor()
 console.log('Account A loaded')
 hold=true
 await page.evaluate(() => window.dispatchEvent(new Event('focus')))
 console.log('Waiting for delayed refresh')
 await held
 console.log('Refresh held')
 await page.getByRole('button',{name:'Settings',exact:true}).click()
 await page.getByRole('button').filter({hasText:'Sign out'}).click()
 console.log('Signing in as B')
 await page.getByLabel('Email address').fill('account-b@example.test')
 await page.getByLabel('Password').fill('mock-password-only')
 await page.getByRole('button',{name:'Sign in',exact:true}).click()
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Notes',exact:true}).click()
 await page.getByRole('button').filter({hasText:'ACCOUNT B'}).waitFor()
 release()
 await page.waitForTimeout(300)
 assert.equal(await page.getByText('PRIVATE ACCOUNT A',{exact:true}).count(),0)
 console.log('PASS: delayed account-A refresh cannot populate account-B workspace')
} finally {await browser.close(); clearTimeout(deadline)}
