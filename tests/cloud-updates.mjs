// Cloud-configured build required. All project calls and version checks are mocked.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium' })
try {
 const page = await browser.newPage({viewport:{width:375,height:667}})
 page.setDefaultTimeout(15000)
 const now=Date.now(), exp=Math.floor(now/1000)+3600, id='b960359f-cd41-4c56-81bd-f56682280001'
 await page.clock.setFixedTime(new Date(now))
 const token=`${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp})).toString('base64url')}.mock`
 const session={access_token:token,refresh_token:'mock',expires_at:exp,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'test@example.test',created_at:new Date().toISOString()}}
 await page.addInitScript(s=>{if(!localStorage.getItem('sb-tktgencmwtanxjfkiadc-auth-token'))localStorage.setItem('sb-tktgencmwtanxjfkiadc-auth-token',JSON.stringify(s))},session)
 await page.route('https://fonts.googleapis.com/**',r=>r.abort())
 await page.route('https://fonts.gstatic.com/**',r=>r.abort())
 let latest=false,recover=false,attempts=0
 const note={id:'mock-note',title:'Saved title',content:'Saved content',pinned:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}
 await page.route('**/version.json*',r=>latest?r.fulfill({json:{version:'future-cloud-update'}}):r.fulfill({status:404,body:''}))
 await page.route('https://tktgencmwtanxjfkiadc.supabase.co/**',async r=>{
  const url=new URL(r.request().url())
  if(url.pathname.includes('/rest/v1/tasks')) return r.fulfill({json:[]})
  if(url.pathname.includes('/rest/v1/notes')) {
   if(r.request().method()==='PATCH') {
    attempts++
    if(!recover)return r.fulfill({status:503,json:{message:'Save temporarily unavailable'}})
    Object.assign(note,r.request().postDataJSON());return r.fulfill({status:204,body:''})
   }
   return r.fulfill({json:[note]})
  }
  if(url.pathname.includes('/rest/v1/events'))return r.fulfill({json:[]})
  return r.abort()
 })
 await page.goto(process.env.DAYMARK_BASE_URL || 'http://127.0.0.1:4173/Calender/',{waitUntil:'domcontentloaded'})
 await page.getByRole('navigation').getByRole('button',{name:'Notes',exact:true}).click()
 await page.locator('.note-list-card').filter({hasText:'Saved title'}).click()
 await page.getByLabel('Note content').fill('Unsaved private draft')
 await page.getByRole('alert').filter({hasText:'Could not save note'}).waitFor()
 latest=true
 await page.clock.setFixedTime(new Date(now+6000))
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await page.getByRole('button',{name:'Update now'}).waitFor()
 assert.equal(await page.getByLabel('Note content').inputValue(),'Unsaved private draft')
 await page.getByRole('button',{name:'Update now'}).click()
 await page.getByRole('alert').filter({hasText:'update is paused'}).waitFor()
 assert.equal(await page.getByLabel('Note content').inputValue(),'Unsaved private draft')
 assert.equal(new URL(page.url()).searchParams.has('daymark_release'),false)
 recover=true
 await page.getByRole('button',{name:'Update now'}).click()
 await page.waitForURL(/daymark_release=future-cloud-update/)
 await page.locator('.calendar-controls h2').waitFor()
 await page.getByRole('navigation').getByRole('button',{name:'Notes',exact:true}).click()
 await page.locator('.note-list-card').filter({hasText:'Saved title'}).click()
 assert.equal(await page.getByLabel('Note content').inputValue(),'Unsaved private draft')
 assert.ok(await page.evaluate(()=>Boolean(localStorage.getItem('sb-tktgencmwtanxjfkiadc-auth-token'))))
 assert.ok(attempts>=3)
 console.log('PASS: failed saves block updates, focus refresh keeps drafts, retry saves before reload, and sign-in storage survives')
} finally {await browser.close()}
