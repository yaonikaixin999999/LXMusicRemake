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
const createdPlaylist = { id: 'netease:77', platform: 'netease', remoteId: '77', ownerId: '100', name: 'My Playlist' }

test('created playlists paginate and exclude liked and other users playlists', async() => {
  const offsets = []
  const result = await provider.playlists(context((_url, data) => {
    offsets.push(data.offset)
    return data.offset === 0
      ? { code: 200, more: true, playlist: [{ id: 1, name: 'Likes', specialType: 5, creator: { userId: 100 } }, { id: 2, name: 'Subscribed', creator: { userId: 101 } }] }
      : { code: 200, more: false, playlist: [{ id: 77, name: 'My Playlist', creator: { userId: 100 }, trackCount: 1001, coverImgUrl: 'https://example.test/cover' }] }
  }), { id: '100' })
  assert.deepEqual(offsets, [0, 2])
  assert.equal(result.length, 1)
  assert.equal(result[0].id, 'netease:77')
  assert.equal(result[0].count, 1001)
  assert.equal(result[0].ownerId, '100')
})

test('created playlist loads every track ID in batches and preserves remote ordering', async() => {
  const ids = Array.from({ length: 1001 }, (_, n) => n + 1).reverse()
  const batches = []
  const result = await provider.playlistTracks(context((url, data) => {
    if (url.includes('/playlist/detail')) return { code: 200, playlist: { creator: { userId: 100 }, trackCount: ids.length, trackIds: ids.map(id => ({ id })) } }
    const batch = JSON.parse(data.c).map(item => item.id)
    batches.push(batch.length)
    return { code: 200, songs: [...batch].reverse().map(music) }
  }), { id: '100' }, createdPlaylist)
  assert.deepEqual(batches, [500, 500, 1])
  assert.equal(result.length, 1001)
  assert.deepEqual(Array.from(result, item => item.meta.songId), ids)
})

test('created playlist rejects another identity and incomplete ID pages', async() => {
  await assert.rejects(provider.playlistTracks(context(() => ({ code: 200, playlist: { creator: { userId: 101 }, trackIds: [] } })), { id: '100' }, createdPlaylist), /不属于/)
  await assert.rejects(provider.playlistTracks(context(() => ({ code: 200, playlist: { creator: { userId: 100 }, trackCount: 2, trackIds: [{ id: 1 }] } })), { id: '100' }, createdPlaylist), /不完整/)
})

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

test('music URL uses the platform session and returns the resolved stream type', async() => {
  let sent
  const track = { meta: { songId: 33894312 } }
  const result = await provider.musicUrl(context((url, data) => {
    sent = { url, data }
    return { code: 200, data: [{ id: 33894312, level: 'exhigh', br: 320000, url: 'https://stream.example.test/song.mp3' }] }
  }), track, '320k')
  assert(sent.url.includes('/song/enhance/player/url/v1'))
  assert.deepEqual(JSON.parse(sent.data.ids), [33894312])
  assert.equal(sent.data.level, 'exhigh')
  assert.equal(result.url, 'https://stream.example.test/song.mp3')
  assert.equal(result.type, '320k')
  assert.equal(result.quality, '320k')
})

test('highest quality reports actual platform downgrade and rejects previews', async() => {
  const track = { meta: { songId: 33894312 } }
  const result = await provider.musicUrl(context((_url, data) => {
    assert.equal(data.level, 'jymaster')
    return { code: 200, data: [{ id: 33894312, level: 'exhigh', br: 320000, url: 'https://stream.test/full.mp3' }] }
  }), track, 'auto')
  assert.equal(result.quality, '320k')
  await assert.rejects(provider.musicUrl(context(() => ({ code: 200, data: [{ url: 'https://stream.test/trial.mp3', freeTrialInfo: { end: 30 } }] })), track, 'auto'), /试听/)
})
