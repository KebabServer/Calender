// Cloud build required; intercepted project requests never touch real tasks.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium'})
try {
 const page=await browser.newPage({viewport:{width:320,height:568}})
 page.setDefaultTimeout(15000)
 const id='b960359f-cd41-4c56-81bd-f56682280001', exp=Math.floor(Date.now()/1000)+3600
 const token=`${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp})).toString('base64url')}.mock`
 await page.addInitScript(s=>localStorage.setItem('sb-tktgencmwtanxjfkiadc-auth-token',JSON.stringify(s)),{access_token:token,refresh_token:'mock',expires_at:exp,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'test@example.test',created_at:new Date().toISOString()}})
 await page.route('https://fonts.googleapis.com/**',r=>r.abort())
 await page.route('https://fonts.gstatic.com/**',r=>r.abort())
 let tasks=[], fail=true, ownerReads=0
 await page.route('https://tktgencmwtanxjfkiadc.supabase.co/**',async r=>{
  const url=new URL(r.request().url()),method=r.request().method()
  if(url.pathname.includes('/rest/v1/tasks')) {
   if(method==='POST') {
    if(fail)return r.fulfill({status:503,json:{message:'Temporary save failure'}})
    const input=r.request().postDataJSON();assert.equal(input.user_id,id)
    const task={...input,id:'mock-task',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};tasks.push(task);return r.fulfill({json:task})
   }
   assert.equal(url.searchParams.get('user_id'),`eq.${id}`)
   if(method==='PATCH'){Object.assign(tasks[0],r.request().postDataJSON());return r.fulfill({json:tasks[0]})}
   if(method==='DELETE'){tasks=[];return r.fulfill({status:204,body:''})}
   ownerReads++;return r.fulfill({json:tasks})
  }
  if(url.pathname.includes('/rest/v1/notes')||url.pathname.includes('/rest/v1/events'))return r.fulfill({json:[]})
  return r.abort()
 })
 await page.goto(process.env.DAYMARK_BASE_URL||'http://127.0.0.1:4173/Calender/',{waitUntil:'domcontentloaded'})
 await page.getByRole('navigation').getByRole('button',{name:'To-do',exact:true}).click()
 await page.getByLabel('Task title').fill('Private synced task')
 await page.getByRole('button',{name:'Add task',exact:true}).click()
 await page.getByRole('alert').filter({hasText:'Temporary save failure'}).waitFor()
 assert.equal(await page.getByLabel('Task title').inputValue(),'Private synced task')
 fail=false
 await page.getByRole('button',{name:'Add task',exact:true}).click()
 await page.getByRole('checkbox',{name:'Complete Private synced task',exact:true}).waitFor()
 await page.reload({waitUntil:'domcontentloaded'})
 await page.getByRole('navigation').getByRole('button',{name:'To-do',exact:true}).click()
 await page.getByRole('checkbox',{name:'Complete Private synced task',exact:true}).click()
 await page.getByRole('button',{name:'Done',exact:true}).click()
 assert.ok(await page.getByRole('checkbox',{name:'Reopen Private synced task',exact:true}).isChecked())
 await page.screenshot({path:'/tmp/daymark-tasks-live.png'})
 page.on('dialog',d=>d.accept())
 await page.getByRole('button',{name:'Delete Private synced task',exact:true}).click()
 await page.locator('.tasks-empty').waitFor()
 assert.equal(tasks.length,0);assert.ok(ownerReads>=2)
 console.log('PASS: private task CRUD requests, owner filters, persistence, and draft retention after a failed save')
}finally{await browser.close()}
