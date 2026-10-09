const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const target = { exports: {} }
const source = fs.readFileSync(path.join(__dirname, '../src/main/modules/platformAccounts/providers/netease.ts'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
vm.runInNewContext(code, { exports: target.exports, module: target, URLSearchParams, AbortSignal, require: () => ({ weapi: data => ({ data: JSON.stringify(data) }) }) })
const provider = target.exports.neteaseProvider
const music = id => ({ id, name: '晴天', ar: [{ name: '周杰伦' }], dt: 269000, al: { id: 8, name: '叶惠美', picUrl: 'https://example.com/cover.jpg' } })
const context = handler => ({ cookies: async() => ({ MUSIC_U: 'fixture', __csrf: 'csrf' }), session: { fetch: async(url, options) => ({ ok: true, json: async() => handler(url, JSON.parse(new URLSearchParams(options.body).get('data'))) }) } })

test('likes loads all IDs in batches and normalizes real SDK track identifiers', async() => {
  const calls = []
  const tracks = await provider.likes(context((url, data) => {
    if (url.includes('/song/like/get')) return { code: 200, ids: Array.from({ length: 1001 }, (_, n) => n + 1) }
    const ids = JSON.parse(data.c).map(item => item.id)
    calls.push(ids.length)
    return { code: 200, songs: ids.map(music) }
  }), { id: '100' })
  assert.deepEqual(calls, [500, 500, 1])
  assert.equal(tracks.length, 1001)
  assert.equal(tracks[0].id, 'wy_1')
  assert.equal(tracks[0].meta.songId, 1)
  assert.equal(tracks[0].interval, '04:29')
})

test('paid catalog remains eligible for red heart while withdrawn tracks are rejected', async() => {
  const track = { meta: { songId: 1 } }
  assert.equal(await provider.available(context(() => ({ code: 200, songs: [music(1)], privileges: [{ id: 1, st: 0, fee: 1, maxbr: 0, pl: 0, dl: 0 }] })), track), true)
  assert.equal(await provider.available(context(() => ({ code: 200, songs: [music(1)], privileges: [{ id: 1, st: -200, fee: 1 }] })), track), false)
  assert.equal(await provider.available(context(() => ({ code: 200, songs: [], privileges: [] })), track), false)
})

test('remote write uses target platform ID and propagates expired authentication', async() => {
  let sent
  await provider.like(context((url, data) => { sent = { url, data }; return { code: 200 } }), { id: '100' }, { meta: { songId: 42 } }, false)
  assert.equal(sent.data.trackId, 42)
  assert.equal(sent.data.like, false)
  assert(sent.url.includes('/radio/like'))
  await assert.rejects(provider.like(context(() => ({ code: 301 })), {}, { meta: { songId: 42 } }, true), /登录已失效/)
})
