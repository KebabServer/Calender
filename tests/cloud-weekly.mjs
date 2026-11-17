// Cloud-configured build required. All project API calls are mocked; no real data is touched.
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
 const session={access_token:token,refresh_token:'mock-refresh',expires_at:expires,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'test@example.test',created_at:new Date().toISOString()}}
 await page.addInitScript(s=>localStorage.setItem('sb-tktgencmwtanxjfkiadc-auth-token',JSON.stringify(s)),session)
 await page.route('https://fonts.googleapis.com/**',r=>r.abort())
 await page.route('https://fonts.gstatic.com/**',r=>r.abort())
 let records=[]
 let posted=false,updated=false,removed=false
 await page.route('https://tktgencmwtanxjfkiadc.supabase.co/**',async route=>{
  const req=route.request(), url=new URL(req.url())
  if(url.pathname.includes('/rest/v1/notes')) return route.fulfill({json:[]})
  if(url.pathname.includes('/rest/v1/events')) {
   if(req.method()==='POST') {
    const input=req.postDataJSON()
    assert.equal(input.user_id,id)
    assert.equal(input.recurrence,'weekly')
    assert.equal(input.start_time,'18:00')
    assert.equal(input.end_time,'19:30')
    assert.equal(input.repeat_until,'2026-04-05')
    records=[{...input,id:'mock-series',created_at:new Date().toISOString(),updated_at:new Date().toISOString()}]
    posted=true; return route.fulfill({json:records[0]})
   }
   assert.equal(url.searchParams.get('user_id'),`eq.${id}`)
   if(req.method()==='PATCH') { records=records.map(e=>({...e,...req.postDataJSON()}));updated=true;return route.fulfill({status:204,body:''}) }
   if(req.method()==='DELETE') { records=[];removed=true;return route.fulfill({status:204,body:''}) }
   assert.ok(url.searchParams.get('select').includes('recurrence,repeat_until'))
   return route.fulfill({json:records})
  }
  return route.abort()
 })
 await page.goto(process.env.DAYMARK_BASE_URL || 'http://127.0.0.1:4173/Calender/',{waitUntil:'domcontentloaded'})
 await page.getByRole('button',{name:'Add event',exact:true}).click()
 await page.getByLabel('Event title').fill('Weekly cloud check')
 await page.getByLabel('Start time').fill('18:00')
 await page.getByLabel('End time').fill('19:30')
 await page.getByLabel('Repeat',{exact:true}).selectOption('weekly')
 await page.getByLabel('Repeat until').fill('2026-04-05')
 await page.screenshot({path:'/tmp/daymark-weekly-form.png'})
 await page.getByRole('button',{name:'Create event',exact:true}).click()
 await page.getByRole('button',{name:/^Sunday, March 29, 2026:/}).click()
 await page.locator('.day-event-main').filter({hasText:'Weekly cloud check'}).click()
 await page.getByLabel('End time').fill('20:00')
 await page.getByRole('button',{name:'Save changes'}).click()
 assert.equal(records[0].end_time,'20:00')
 await page.reload({waitUntil:'domcontentloaded'})
 await page.locator('.selected-day .calendar-event-time').filter({hasText:'18:00–20:00'}).waitFor()
 await page.screenshot({path:'/tmp/daymark-weekly-cloud.png'})
 await page.locator('.day-event-main').filter({hasText:'Weekly cloud check'}).click()
 page.on('dialog',d=>d.accept())
 await page.getByRole('button',{name:'Delete series',exact:true}).click()
 await page.locator('.day-empty').waitFor()
 assert.ok(posted && updated && removed)
 console.log('PASS: Supabase client sends recurrence/time fields, fetches persisted series, and scopes edits/deletes to the owner')
} finally {await browser.close()}
