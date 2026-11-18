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
 let tasks=[], fail=true, failRestore=false, ownerReads=0, concurrentRestore=false
 await page.route('https://tktgencmwtanxjfkiadc.supabase.co/**',async r=>{
  const url=new URL(r.request().url()),method=r.request().method()
  if(url.pathname.includes('/rest/v1/tasks')) {
   if(method!=='DELETE'){
    const selected=url.searchParams.get('select')?.split(',')||[]
    assert.ok(selected.includes('description')&&selected.includes('due_date')&&selected.includes('refresh_weekday')&&selected.includes('next_refresh_at'))
   }
   if(method==='POST') {
    if(fail)return r.fulfill({status:503,json:{message:'Temporary save failure'}})
    const input=r.request().postDataJSON();assert.equal(input.user_id,id)
    if(input.id){
     assert.equal(url.searchParams.get('on_conflict'),'id')
     assert.ok(r.request().headers().prefer.includes('resolution=ignore-duplicates'))
     if(failRestore)return r.fulfill({status:503,json:{message:'Temporary restore failure'}})
     if(concurrentRestore){tasks=[{...input,title:'Edited on another device'}];return r.fulfill({json:[]})}
     const exists=tasks.find(t=>t.id===input.id)
     if(!exists)tasks.push(input)
     return r.fulfill({json:exists?[]:[input]})
    }
    const task={...input,id:'mock-task',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};tasks.push(task);return r.fulfill({json:task})
   }
   assert.equal(url.searchParams.get('user_id'),`eq.${id}`)
   if(method==='PATCH'){Object.assign(tasks[0],r.request().postDataJSON());return r.fulfill({json:tasks[0]})}
   if(method==='DELETE'){tasks=[];return r.fulfill({status:204,body:''})}
   ownerReads++;return r.fulfill({json:r.request().headers().accept?.includes('vnd.pgrst.object')?tasks[0]:tasks})
  }
  if(url.pathname.includes('/rest/v1/notes')||url.pathname.includes('/rest/v1/events'))return r.fulfill({json:[]})
  return r.abort()
 })
 await page.goto(process.env.DAYMARK_BASE_URL||'http://127.0.0.1:4173/Calender/',{waitUntil:'domcontentloaded'})
 await page.getByRole('navigation').getByRole('button',{name:'To-do',exact:true}).click()
 await page.getByLabel('Task title').fill('Private synced task')
 await page.getByLabel('Description',{exact:true}).fill('Private description\nSecond line')
 await page.getByLabel('Due date',{exact:true}).fill('2027-02-03')
 await page.getByRole('button',{name:'Add task',exact:true}).click()
 await page.getByRole('alert').filter({hasText:'Temporary save failure'}).waitFor()
 assert.equal(await page.getByLabel('Task title').inputValue(),'Private synced task')
 assert.equal(await page.getByLabel('Description',{exact:true}).inputValue(),'Private description\nSecond line')
 assert.equal(await page.getByLabel('Due date',{exact:true}).inputValue(),'2027-02-03')
 fail=false
 await page.getByRole('button',{name:'Add task',exact:true}).click()
 await page.getByRole('checkbox',{name:'Complete Private synced task',exact:true}).waitFor()
 assert.equal(tasks[0].description,'Private description\nSecond line')
 assert.equal(tasks[0].due_date,'2027-02-03')
 await page.reload({waitUntil:'domcontentloaded'})
 await page.getByRole('navigation').getByRole('button',{name:'To-do',exact:true}).click()
 await page.getByRole('button',{name:'Edit Private synced task',exact:true}).click()
 assert.equal(await page.getByLabel('Description',{exact:true}).inputValue(),'Private description\nSecond line')
 assert.equal(await page.getByLabel('Due date',{exact:true}).inputValue(),'2027-02-03')
 await page.getByLabel('Description',{exact:true}).fill('Edited private description')
 await page.getByLabel('Due date',{exact:true}).fill('2027-02-04')
 await page.getByRole('button',{name:'Save task',exact:true}).click()
 await page.locator('.task-description').filter({hasText:'Edited private description'}).waitFor()
 assert.equal(tasks[0].description,'Edited private description')
 assert.equal(tasks[0].due_date,'2027-02-04')
 await page.getByRole('checkbox',{name:'Complete Private synced task',exact:true}).click()
 await page.locator('.task-completed').waitFor()
 await page.getByRole('button',{name:'Done',exact:true}).click()
 assert.ok(await page.getByRole('checkbox',{name:'Reopen Private synced task',exact:true}).isChecked())
 await page.screenshot({path:'/tmp/daymark-tasks-live.png'})
 const original={...tasks[0]}
 await page.getByRole('button',{name:'Delete Private synced task',exact:true}).click()
 await page.locator('.tasks-empty').waitFor()
 assert.equal(tasks.length,0);assert.ok(ownerReads>=2)
 failRestore=true
 await page.getByRole('button',{name:'Undo',exact:true}).click()
 await page.getByRole('alert').filter({hasText:'Temporary restore failure'}).waitFor()
 assert.equal(tasks.length,0)
 failRestore=false
 await page.getByRole('button',{name:'Undo',exact:true}).click()
 await page.getByRole('checkbox',{name:'Reopen Private synced task',exact:true}).waitFor()
 for(const field of ['id','title','description','due_date','completed','created_at'])assert.equal(tasks[0][field],original[field])
 assert.ok(await page.getByRole('checkbox',{name:'Reopen Private synced task',exact:true}).isChecked())
 await page.getByRole('button',{name:'Delete Private synced task',exact:true}).click()
 concurrentRestore=true
 await page.getByRole('button',{name:'Undo',exact:true}).click()
 await page.getByRole('checkbox',{name:'Reopen Edited on another device',exact:true}).waitFor()
 assert.equal(tasks[0].title,'Edited on another device')
 assert.equal(tasks[0].id,original.id)
 await page.getByRole('button',{name:'Edit Edited on another device',exact:true}).click()
 await page.getByLabel('Description',{exact:true}).fill('')
 await page.getByRole('button',{name:'Clear due date',exact:true}).click()
 await page.getByRole('button',{name:'Save task',exact:true}).click()
 await page.locator('.task-description').waitFor({state:'detached'})
 await page.locator('.task-due').waitFor({state:'detached'})
 assert.equal(tasks[0].description,'')
 assert.equal(tasks[0].due_date,null)
 console.log('PASS: private task CRUD/details/due dates, visible completion, owner-scoped Undo, retry after failure, original identity/status/details, clearing optional fields, and concurrent restore without overwriting remote edits')
}finally{await browser.close()}
