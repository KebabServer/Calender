// Cloud-configured build required. All private data and Supabase requests are mocked.
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium' })
const id = 'b960359f-cd41-4c56-81bd-f56682280001'
const stamp = new Date().toISOString(), exp = Math.floor(Date.now() / 1000) + 3600
const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp})).toString('base64url')}.mock`
const session = {access_token:token,refresh_token:'mock',expires_at:exp,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'review@example.test',created_at:stamp}}
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve }); return { promise, release } }
const settleRender = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))

async function setup() {
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, timezoneId: 'UTC' })
  await page.clock.setFixedTime(new Date(stamp))
  page.setDefaultTimeout(10000)
  await page.addInitScript(s => localStorage.setItem('sb-tktgencmwtanxjfkiadc-auth-token', JSON.stringify(s)), session)
  await page.route('https://fonts.googleapis.com/**', r => r.abort())
  await page.route('https://fonts.gstatic.com/**', r => r.abort())
  const state = {
    note: {id:'review-note',title:'Review note',content:'Original content',pinned:false,created_at:stamp,updated_at:stamp},
    event: {id:'review-event',title:'Review event',description:'',event_date:stamp.slice(0,10),start_time:null,end_time:null,all_day:true,color:'purple',note_id:null,recurrence:'none',repeat_until:null,created_at:stamp,updated_at:stamp},
    fail:false, patches:0, logouts:0, holdNotes:null, holdEvents:null, holdPatch:null, deleted:false, eventDeleted:false,
  }
  await page.route('https://tktgencmwtanxjfkiadc.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname
    if (path === '/rest/v1/tasks' || path === '/rest/v1/watchlist') return route.fulfill({json:[]})
    if (path.includes('/rest/v1/notes') || path.includes('/rest/v1/events')) {
      assert.equal(url.searchParams.get('user_id'), `eq.${id}`)
      const isNote = path.endsWith('/notes'), record = isNote ? state.note : state.event
      const deleted = isNote ? state.deleted : state.eventDeleted
      if (req.method() === 'PATCH') {
        assert.equal(url.searchParams.get('select'), 'id')
        assert.equal(url.searchParams.get('id'), `eq.${record.id}`)
        if (isNote) {
          state.patches++
          if (state.holdPatch) { const held = state.holdPatch; state.holdPatch = null; await held.promise }
          if (state.fail) return route.fulfill({status:503,json:{message:'Simulated save failure'}})
        }
        if (deleted) return route.fulfill({json:[]})
        Object.assign(record, req.postDataJSON())
        return route.fulfill({json:[{id:record.id}]})
      }
      const snapshot = deleted ? [] : [structuredClone(record)]
      const key = isNote ? 'holdNotes' : 'holdEvents'
      if (state[key]) { const held = state[key]; state[key] = null; await held.promise }
      return route.fulfill({json:snapshot})
    }
    if (path.includes('/auth/v1/logout')) { state.logouts++; return route.fulfill({status:204,body:''}) }
    return route.abort()
  })
  await page.goto(process.env.DAYMARK_BASE_URL || 'http://127.0.0.1:4173/Calender/', {waitUntil:'domcontentloaded'})
  const nav = page.getByRole('navigation')
  await nav.getByRole('button',{name:'Notes',exact:true}).click()
  await page.locator('.note-list-card').filter({hasText:'Review note'}).click()
  await page.getByTitle('Edit Markdown').click()
  return {page,state,nav}
}

async function startHeldRefresh(page, state, field, table) {
  const held = gate()
  state[field] = held
  const requested = page.waitForRequest(req => req.method() === 'GET' && new URL(req.url()).pathname.endsWith(`/rest/v1/${table}`))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await requested
  return async () => {
    const response = page.waitForResponse(res => res.request().method() === 'GET' && new URL(res.url()).pathname.endsWith(`/rest/v1/${table}`))
    held.release()
    await response
    await settleRender(page)
  }
}

try {
  {
    const {page,state} = await setup()
    state.fail = true
    await page.getByLabel('Note content').fill('Unsaved draft that must not be lost')
    await expect(page.locator('.save-indicator')).toContainText('Not saved')
    assert.equal(state.patches,1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.screenshot({path:'/tmp/daymark-save-retry-320.png'})
    await page.getByRole('button',{name:'Settings',exact:true}).click()
    await page.getByRole('button').filter({hasText:'Sign out'}).click()
    await expect(page.getByRole('alert')).toContainText('Could not sign out safely')
    assert.equal(state.logouts,0)
    assert.ok(state.patches>=2)
    await page.getByRole('button',{name:'Close settings'}).click()
    await expect(page.getByLabel('Note content')).toHaveValue('Unsaved draft that must not be lost')
    state.fail = false
    await page.getByRole('button',{name:'Retry',exact:true}).click()
    await expect(page.locator('.save-indicator')).toHaveText('Autosaved')
    assert.equal(state.note.content,'Unsaved draft that must not be lost')
    state.fail = true
    await page.getByLabel('Note content').fill('Another failed draft')
    await expect(page.locator('.save-indicator')).toContainText('Not saved')
    state.fail = false
    await page.getByRole('button',{name:'Settings',exact:true}).click()
    await page.getByRole('button').filter({hasText:'Sign out'}).click()
    await page.getByRole('button',{name:'Sign in',exact:true}).waitFor()
    assert.equal(state.note.content,'Another failed draft')
    assert.equal(state.logouts,1)
    console.log('PASS: failed saves show Not saved; sign-out retries and blocks on failure; Retry preserves drafts; successful sign-out flushes failed saves')
    await page.close()
  }
  {
    const {page,state} = await setup()
    const release = await startHeldRefresh(page,state,'holdNotes','notes')
    await page.getByLabel('Note content').fill('New successfully saved content')
    await expect(page.locator('.save-indicator')).toHaveText('Autosaved')
    assert.equal(state.note.content,'New successfully saved content')
    await release()
    await expect(page.getByLabel('Note content')).toHaveValue('New successfully saved content')
    await page.getByLabel('Note content').fill('New successfully saved content plus next edit')
    await expect(page.locator('.save-indicator')).toHaveText('Autosaved')
    assert.equal(state.note.content,'New successfully saved content plus next edit')
    console.log('PASS: a delayed pre-edit refresh cannot replace newer note text or corrupt the next save')
    await page.close()
  }
  {
    const {page,state} = await setup()
    const release = await startHeldRefresh(page,state,'holdNotes','notes')
    state.note.content = 'Newest remote text'
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByLabel('Note content')).toHaveValue('Newest remote text')
    await release()
    await expect(page.getByLabel('Note content')).toHaveValue('Newest remote text')
    console.log('PASS: older remote responses cannot overwrite a newer refresh')
    await page.close()
  }
  {
    const {page,state} = await setup()
    state.deleted = true
    await page.getByLabel('Note content').fill('Draft after remote deletion')
    await expect(page.getByRole('alert')).toContainText('deleted on another device')
    await expect(page.locator('.save-indicator')).toContainText('Not saved')
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await settleRender(page)
    await expect(page.getByLabel('Note content')).toHaveValue('Draft after remote deletion')
    await page.getByRole('button',{name:'Settings',exact:true}).click()
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button').filter({hasText:'Export your data'}).click()
    const download = await downloaded
    const backup = JSON.parse(await readFile(await download.path(),'utf8'))
    assert.equal(backup.notes[0].content,'Draft after remote deletion')
    await page.getByRole('button').filter({hasText:'Sign out'}).click()
    await expect(page.getByRole('alert')).toContainText('Could not sign out safely')
    assert.equal(state.logouts,0)
    console.log('PASS: a zero-row note update fails visibly; remote deletion preserves the draft and export; sign-out remains blocked')
    await page.close()
  }
  {
    const {page,state,nav} = await setup()
    await nav.getByRole('button',{name:'Calendar',exact:true}).click()
    const release = await startHeldRefresh(page,state,'holdEvents','events')
    await page.locator('.day-event-main').filter({hasText:'Review event'}).click()
    await page.getByLabel('Event title').fill('Updated event')
    await page.getByRole('button',{name:'Save changes',exact:true}).click()
    await expect(page.locator('.day-event-main')).toContainText('Updated event')
    await release()
    await expect(page.locator('.day-event-main')).toContainText('Updated event')
    await page.locator('.day-event-main').click()
    state.eventDeleted = true
    await page.getByLabel('Event title').fill('Keep unsaved event changes')
    await page.getByRole('button',{name:'Save changes',exact:true}).click()
    await expect(page.getByRole('alert')).toContainText('deleted on another device')
    await expect(page.getByLabel('Event title')).toHaveValue('Keep unsaved event changes')
    console.log('PASS: delayed refresh cannot overwrite an event save; editing a remotely deleted event keeps the form and reports failure')
    await page.close()
  }
  {
    const {page,state} = await setup()
    const held = gate()
    state.holdPatch = held
    const requested = page.waitForRequest(req => req.method() === 'PATCH' && req.url().includes('/rest/v1/notes'))
    await page.getByLabel('Note content').fill('First slow save')
    await requested
    await page.getByLabel('Note content').fill('Latest text while saving')
    held.release()
    await expect(page.locator('.save-indicator')).toHaveText('Autosaved')
    assert.equal(state.note.content,'Latest text while saving')
    console.log('PASS: serialized saves preserve edits typed during an earlier slow save')
    await page.close()
  }
} finally { await browser.close() }
