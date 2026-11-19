import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { loadDailyMenus, menuDate, readABloc, readTaffa, readUniCafe } from '../supabase/functions/lunch-menus/menus.ts'

const date = '2026-11-19'
const taffa = [
  { day: '2026-11-20', dayName: 'Perjantai', Kasvisruoka: 'Tomorrow’s dish' },
  { day: date, dayName: 'Torstai', Kasvisruoka: ' Hernekeitto ', Keitto: '' },
]
const abloc = {
  date: `${date}T00:00:00`,
  menuPackages: [{
    name: 'Lounas',
    meals: [{ name: 'Kasvispihvit' }],
    bundles: [{ meals: [{ name: 'Kasvispihvit' }, { name: 'Papurisotto' }] }],
  }],
}
const unicafe = [
  { slug: 'meilahti', menuData: { menus: [{ date: 'To 19.11.', data: [{ name: 'Härkisbolognese', price: { name: 'Vegaanilounas' } }] }] } },
  { slug: 'kaivopiha', menuData: { menus: [
    { date: 'Ke 18.11.', data: [{ name: 'Yesterday’s dish' }] },
    { date: 'To 19.11.', data: [{ name: 'Linssikastike' }] },
    { date: 'Su 22.11.', message: 'Suljettu', data: [] },
  ] } },
]

test('selects the exact Helsinki date and restaurant from official menu payloads', () => {
  assert.equal(menuDate(new Date('2026-11-18T22:30:00Z')), date)
  assert.deepEqual(readTaffa(taffa, date), [{ name: 'Hernekeitto', category: 'Kasvisruoka' }])
  assert.deepEqual(readABloc(abloc, date), [
    { name: 'Kasvispihvit', category: 'Lounas' }, { name: 'Papurisotto', category: 'Lounas' },
  ])
  assert.deepEqual(readUniCafe(unicafe, 'meilahti', date), [{ name: 'Härkisbolognese', category: 'Vegaanilounas' }])
  assert.deepEqual(readUniCafe(unicafe, 'kaivopiha', date), [{ name: 'Linssikastike', category: null }])
  assert.deepEqual(readUniCafe(unicafe, 'kaivopiha', '2026-11-22'), [])
  assert.deepEqual(readTaffa(taffa, '2026-11-22'), [])
  assert.throws(() => readABloc(abloc, '2026-11-20'), /menu date/)
})

test('uses fixed providers and keeps other restaurants available if one fails', async () => {
  const requests = []
  const result = await loadDailyMenus(date, async (input, options) => {
    const url = new URL(input)
    requests.push(url.hostname)
    assert.deepEqual(options.headers, { Accept: 'application/json' })
    assert.equal(options.redirect, 'error')
    if (url.hostname === 'newapi.tf.fi') return new Response(null, { status: 503 })
    if (url.hostname === 'www.compass-group.fi') {
      assert.equal(url.searchParams.get('costCenter'), '3087')
      assert.equal(url.searchParams.get('date'), date)
      return Response.json(abloc)
    }
    return Response.json(unicafe)
  })
  assert.equal(result.date, date)
  assert.deepEqual(requests.sort(), ['newapi.tf.fi', 'unicafe.fi', 'www.compass-group.fi'])
  assert.equal(result.menus.taffa, null)
  assert.equal(result.menus.abloc.length, 2)
  assert.equal(result.menus.meilahti[0].name, 'Härkisbolognese')
  assert.equal(result.menus.kaivopiha[0].name, 'Linssikastike')
})
