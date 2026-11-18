// Mocked cloud state and clock: no real private task data is read or changed.
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'

const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium'})
try {
  const page = await browser.newPage({viewport:{width:320,height:568}})
  const now = Date.parse('2026-11-23T15:44:50Z'), exp = Math.floor(now/1000)+3600
  await page.clock.install({time:new Date(now-60000)})
  await page.clock.pauseAt(new Date(now))
  const id='b960359f-cd41-4c56-81bd-f56682280001'
  const token=`${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp})).toString('base64url')}.mock`
  await page.addInitScript(s=>localStorage.setItem('sb-tktgencmwtanxjfkiadc-auth-token',JSON.stringify(s)),{access_token:token,refresh_token:'mock',expires_at:exp,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'test@example.test',created_at:new Date(now).toISOString()}})
  await page.route('https://fonts.googleapis.com/**',r=>r.abort())
  await page.route('https://fonts.gstatic.com/**',r=>r.abort())
  let refreshes=0, reads=0, exists=true
  const task={id:'weekly-cloud',user_id:id,title:'Weekly cloud task',description:'Keep this description',due_date:'2026-11-24',completed:true,created_at:'2026-11-01T12:00:00Z',updated_at:'2026-11-01T12:00:00Z',refresh_weekday:1,refresh_time:'17:45:00',refresh_timezone:'Europe/Helsinki',next_refresh_at:'2026-11-23T15:45:00Z'}
  await page.route('https://tktgencmwtanxjfkiadc.supabase.co/**',async route=>{
    const request=route.request(), url=new URL(request.url())
    if(url.pathname.endsWith('/rpc/refresh_weekly_tasks')){
      assert.equal(request.method(),'POST')
      assert.equal(Object.keys(request.postDataJSON()||{}).length,0)
      refreshes++
      task.completed=false;task.next_refresh_at='2026-11-30T15:45:00Z'
      return route.fulfill({json:1})
    }
    if(url.pathname.endsWith('/rest/v1/tasks')){
      if(request.method()==='POST'){
        const input=request.postDataJSON()
        assert.equal(input.user_id,id);assert.equal(input.id,task.id)
        assert.equal(input.refresh_weekday,1);assert.equal(input.refresh_time,'17:45:00')
        assert.equal(input.refresh_timezone,'Europe/Helsinki')
        assert.equal(input.next_refresh_at,'2026-11-30T15:45:00Z')
        Object.assign(task,input);exists=true
        return route.fulfill({json:[task]})
      }
      assert.equal(url.searchParams.get('user_id'),`eq.${id}`)
      if(request.method()==='DELETE'){exists=false;return route.fulfill({status:204,body:''})}
      assert.ok(url.searchParams.get('select').includes('next_refresh_at'))
      if(request.method()==='PATCH'){
        assert.equal(url.searchParams.get('id'),'eq.weekly-cloud')
        const input=request.postDataJSON()
        Object.assign(task,input)
        if(input.refresh_weekday===null)task.next_refresh_at=null
        else if(input.refresh_weekday===2)task.next_refresh_at='2026-11-24T07:30:00Z'
        return route.fulfill({json:task})
      }
      reads++;return route.fulfill({json:exists?[task]:[]})
    }
    if(url.pathname.endsWith('/rest/v1/notes')||url.pathname.endsWith('/rest/v1/events'))return route.fulfill({json:[]})
    return route.abort()
  })
  await page.goto(process.env.DAYMARK_BASE_URL || 'http://127.0.0.1:4173/Calender/',{waitUntil:'domcontentloaded'})
  await page.getByRole('navigation').getByRole('button',{name:'To-do',exact:true}).click()
  await expect(page.getByRole('checkbox',{name:'Reopen Weekly cloud task',exact:true})).toBeChecked()
  await expect(page.locator('.task-refresh')).toContainText('Monday 17:45')
  await page.clock.fastForward(11000)
  await expect(page.getByRole('checkbox',{name:'Complete Weekly cloud task',exact:true})).not.toBeChecked()
  await expect(page.locator('.task-description')).toHaveText('Keep this description')
  await expect(page.locator('.task-due')).toHaveAttribute('datetime','2026-11-24')
  assert.equal(refreshes,1);assert.ok(reads>=3)
  assert.equal(task.next_refresh_at,'2026-11-30T15:45:00Z')
  await page.getByRole('checkbox',{name:'Complete Weekly cloud task',exact:true}).click()
  await page.clock.fastForward(30000)
  await expect(page.getByRole('checkbox',{name:'Reopen Weekly cloud task',exact:true})).toBeChecked()
  assert.equal(refreshes,1)
  await page.getByRole('button',{name:'Delete Weekly cloud task',exact:true}).click()
  await expect(page.locator('.task-row')).toHaveCount(0)
  await page.getByRole('button',{name:'Undo',exact:true}).click()
  await expect(page.getByRole('checkbox',{name:'Reopen Weekly cloud task',exact:true})).toBeChecked()
  await expect(page.locator('.task-refresh')).toContainText('Monday 17:45')
  await page.getByRole('button',{name:'Edit Weekly cloud task',exact:true}).click()
  await expect(page.getByLabel('Refresh weekly',{exact:true})).toBeChecked()
  await page.getByLabel('Refresh day').selectOption('2')
  await page.getByLabel('Time (Helsinki)',{exact:true}).fill('09:30')
  await page.getByRole('button',{name:'Save task',exact:true}).click()
  await expect(page.locator('.task-refresh')).toContainText('Tuesday 09:30')
  assert.equal(task.refresh_timezone,'Europe/Helsinki')
  await page.getByRole('button',{name:'Edit Weekly cloud task',exact:true}).click()
  await page.getByLabel('Refresh weekly',{exact:true}).uncheck()
  await page.getByRole('button',{name:'Save task',exact:true}).click()
  await expect(page.locator('.task-refresh')).toHaveCount(0)
  assert.equal(task.next_refresh_at,null)
  await page.screenshot({path:'/tmp/daymark-weekly-task-cloud.png'})
  console.log('PASS: weekly cloud deadline triggers owner-only catch-up, preserves details and identity, reopens once, saves schedule edits and disables cleanly')
} finally { await browser.close() }
