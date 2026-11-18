// Cloud-configured build required. Project HTTP calls are mocked; no real data is touched.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium' })
try {
 const page = await browser.newPage({viewport:{width:375,height:667},timezoneId:'Europe/Helsinki'})
 page.setDefaultTimeout(15000)
 await page.clock.setFixedTime(new Date('2026-03-22T10:00:00Z'))
 const id='b960359f-cd41-4c56-81bd-f56682280001'
 const expires=Math.floor(Date.now()/1000)+3600
 const token=`${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:expires})).toString('base64url')}.mock`
 await page.addInitScript(s=>localStorage.setItem('sb-tktgencmwtanxjfkiadc-auth-token',JSON.stringify(s)),{access_token:token,refresh_token:'mock-refresh',expires_at:expires,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'test@example.test',created_at:new Date().toISOString()}})
 await page.route('https://fonts.googleapis.com/**',r=>r.abort())
 await page.route('https://fonts.gstatic.com/**',r=>r.abort())
 let records=[]
 let posted=false,updated=false,removed=false
 await page.route('https://tktgencmwtanxjfkiadc.supabase.co/**',async route=>{
  const req=route.request(), url=new URL(req.url())
  if(url.pathname.includes('/rest/v1/tasks')) return route.fulfill({json:[]})
  if(url.pathname.includes('/rest/v1/notes')) return route.fulfill({json:[]})
  if(url.pathname.endsWith('/rpc/save_event_with_copies')) {
   const {p_input:input,p_copy_count:count,p_event_id:eventId}=req.postDataJSON()
   assert.equal(count,2);assert.equal(eventId,null)
   assert.equal(input.recurrence,'none');assert.equal(input.start_time,'18:00');assert.equal(input.end_time,null)
   records=['2026-03-22','2026-03-29','2026-04-05'].map((event_date,i)=>({...input,id:`mock-event-${i}`,user_id:id,event_date,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}))
   posted=true;return route.fulfill({json:records})
  }
  if(url.pathname.includes('/rest/v1/events')) {
   assert.equal(url.searchParams.get('user_id'),`eq.${id}`)
   const eventId=url.searchParams.get('id')?.slice(3)
   if(req.method()==='PATCH') {records=records.map(e=>e.id===eventId?{...e,...req.postDataJSON()}:e);updated=true;return route.fulfill({json:[{id:eventId}]})}
   if(req.method()==='DELETE') {records=records.filter(e=>e.id!==eventId);removed=true;return route.fulfill({status:204,body:''})}
   return route.fulfill({json:records})
  }
  return route.abort()
 })
 await page.goto(process.env.DAYMARK_BASE_URL || 'http://127.0.0.1:4173/Calender/',{waitUntil:'domcontentloaded'})
 await page.getByRole('button',{name:'Add event',exact:true}).click()
 await page.getByLabel('Event title').fill('Independent cloud copies')
 await page.getByLabel('Start time').fill('18:00')
 await page.getByLabel('Duration', { exact: true }).selectOption('unknown')
 await page.getByLabel('Clone to future weeks').check()
 await page.getByLabel('Future copies').selectOption('2')
 await page.screenshot({path:'/tmp/daymark-clone-form.png'})
 await page.getByRole('button',{name:'Save & clone',exact:true}).click()
 await page.getByRole('button',{name:/^Sunday, March 29, 2026:/}).click()
 await page.locator('.day-event-main').filter({hasText:'Independent cloud copies'}).click()
 await page.getByLabel('Duration', { exact: true }).selectOption('120')
 await page.getByRole('button',{name:'Save changes'}).click()
 await page.getByRole('dialog',{name:'Edit event',exact:true}).waitFor({state:'hidden'})
 assert.equal(records[1].end_time,'20:00');assert.equal(records[0].end_time,null);assert.equal(records[2].end_time,null)
 await page.reload({waitUntil:'domcontentloaded'})
 await page.locator('.selected-day .calendar-event-time').filter({hasText:'18:00 · ?'}).waitFor()
 await page.getByRole('button',{name:/^Sunday, March 29, 2026:/}).click()
 await page.locator('.selected-day .calendar-event-time').filter({hasText:'18:00 · 2h'}).waitFor()
 await page.screenshot({path:'/tmp/daymark-clone-cloud.png'})
 await page.locator('.day-event-main').filter({hasText:'Independent cloud copies'}).click()
 page.on('dialog',d=>d.accept())
 await page.getByRole('button',{name:'Delete',exact:true}).click()
 await page.locator('.day-empty').waitFor()
 assert.equal(records.length,2);assert.ok(posted && updated && removed)
 console.log('PASS: atomic clone request, persisted independent events, owner-scoped edits, and single-copy deletion')
} finally {await browser.close()}
