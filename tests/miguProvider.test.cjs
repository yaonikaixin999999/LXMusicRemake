const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const root = path.join(__dirname, '../src')
function loadTs(file) {
  const target = new Module(file, module)
  target.filename = file
  target.paths = Module._nodeModulePaths(path.dirname(file))
  target.require = id => id.startsWith('@common/') ? loadTs(path.join(root, 'common', id.slice(8) + '.ts')) : module.require(id)
  target._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file)
  return target.exports
}
const provider = loadTs(path.join(root, 'main/modules/platformAccounts/providers/migu.ts')).miguProvider
const credentials = { mg_auth_uid: '123', mg_auth_pacmtoken: 'fixture' }
const profile = { id: '123', nickname: 'Fixture' }
const song = { songId: '10001', copyrightId: '60001', contentId: '80001', songName: 'Fixture Song', singerList: [{ name: 'Fixture Singer' }], duration: 180, album: 'Fixture Album', audioFormats: [{ formatType: 'PQ', resourceType: '2' }, { formatType: 'SQ', resourceType: 'E' }] }
const original = { id: 'mg_60001', source: 'mg', name: song.songName, singer: song.singerList[0].name, interval: '03:00', meta: { songId: '60001', copyrightId: '60001', albumName: song.album } }
const ok = data => ({ code: '000000', data })
function fixture(handler, cookies = credentials) {
  const calls = []
  const context = { cookies: async() => cookies, session: { fetch: async(url, init) => {
    assert(init.headers instanceof Headers)
    assert(init.signal instanceof AbortSignal)
    const call = { url: new URL(url), init, body: init.body ? JSON.parse(init.body) : null }
    calls.push(call)
    const response = await handler(call)
    return response instanceof Response ? response : new Response(JSON.stringify(response))
  } } }
  return { context, calls }
}
function envelope(data) {
  const key = Buffer.from('Jk8qzuePiJ1qE3mDYhLQ3T73DtDoAhLP')
  const raw = Buffer.from(JSON.stringify(ok(data)))
  const bytes = Buffer.alloc(raw.length + 4)
  bytes.set([171, 205, 1, 37])
  for (let i = 0; i < raw.length; i++) bytes[i + 4] = raw[i] - 37 + key[i % key.length]
  return new Response(bytes, { headers: { signature: '1' } })
}

test('Migu verifies official profile identity rather than accepting a cookie alone', async() => {
  const valid = fixture(() => ok({ userId: '123', nickName: 'Fixture' }))
  assert.equal((await provider.profile(valid.context)).id, '123')
  assert.equal(valid.calls[0].url.pathname, '/user/h5/user-info/v1.0')
  assert.equal(valid.calls[0].init.headers.get('pacmtoken'), 'fixture')
  await assert.rejects(provider.profile(fixture(() => assert.fail('no request'), {}).context), /请先登录/)
  await assert.rejects(provider.profile(fixture(() => ok({ userId: '999' })).context), /登录已失效/)
  await assert.rejects(provider.profile(fixture(() => ({ code: '290001' })).context), /登录已失效/)
})

test('Migu normalizes copyright ID and upgrades existing LX catalogue metadata by exact recording', async() => {
  const { context, calls } = fixture(() => [song])
  const results = await provider.search(context, original)
  assert.equal(results[0].meta.songId, '60001')
  assert.equal(results[0].meta.upstreamSongId, '10001')
  assert.equal(results[0].id, original.id)
  assert.deepEqual(await provider.musicQualitys(context, original), ['128k', 'flac'])
  assert(calls.every(call => call.url.pathname.endsWith('/search/v1.0')))
  await assert.rejects(provider.musicQualitys(fixture(() => [{ ...song, copyrightId: 'other', songName: 'Different Song' }]).context, original), /同一录音/)
})

test('Migu reads red hearts and all playlist pages from their real remote IDs', async() => {
  const { context, calls } = fixture(call => {
    if (call.url.pathname.includes('home-page')) return ok({ userPrivateItems: [{ title: '喜欢的音乐', actionUrl: 'https://music.migu.cn/v5/?musicListId=77' }] })
    return ok({ totalCount: 2, songList: [{ ...song, songId: `1000${call.url.searchParams.get('pageNo')}`, copyrightId: `6000${call.url.searchParams.get('pageNo')}` }] })
  })
  const results = await provider.likes(context, profile)
  assert.equal(results.length, 2)
  assert.deepEqual(calls.slice(1).map(call => call.url.searchParams.get('pageNo')), ['1', '2'])
  assert(calls.slice(1).every(call => call.url.searchParams.get('playlistId') === '77'))
  await assert.rejects(provider.likes(fixture(call => call.url.pathname.includes('home-page') ? ok({ userPrivateItems: [{ title: '喜欢的音乐', musicListId: '77' }] }) : ok({ totalCount: 1, songList: [] })).context, profile), /不完整/)
})

test('Migu created playlists retain account ownership and reject another account detail', async() => {
  const { context } = fixture(() => ok({ myCreatedMusicLists: { createdMusicLists: [{ musicListId: '77', title: 'Mine', ownerId: '123', musicNum: 2 }, { musicListId: '88', title: 'Other', ownerId: '999' }] } }))
  const result = await provider.playlists(context, profile)
  assert.deepEqual(result.map(item => item.id), ['migu:77'])
  await assert.rejects(provider.playlistTracks(fixture(() => ok({ ownerId: '999' })).context, profile, result[0]), /不属于/)
})

test('Migu binary stream reports actual downgrade and picks quality-specific resource type', async() => {
  const { context, calls } = fixture(call => call.url.pathname.includes('/search/') ? [song] : envelope({ audioFormatType: 'PQ', url: 'https://stream.example.test/full.mp3', cannotCode: '', auditionsLength: 0 }))
  const result = await provider.musicUrl(context, original, 'jymaster')
  assert.equal(calls[1].url.searchParams.get('toneFlag'), 'SQ')
  assert.equal(calls[1].url.searchParams.get('resourceType'), 'E')
  assert.equal(calls[1].init.headers.get('birth'), 'h5page')
  assert.equal(result.type, '128k')
  assert.equal(result.quality, '128k')
  assert.equal(result.url, 'https://stream.example.test/full.mp3')
})

test('Migu highest available tier falls back when a premium format requires membership', async() => {
  const { context, calls } = fixture(call => {
    if (call.url.pathname.includes('/search/')) return [song]
    return call.url.searchParams.get('toneFlag') === 'SQ' ? { code: '440000', info: '会员专属音质，请先登录' } : envelope({ audioFormatType: 'PQ', url: 'https://stream.test/full.mp3' })
  })
  const result = await provider.musicUrl(context, original, 'auto')
  assert.deepEqual(calls.slice(1).map(call => call.url.searchParams.get('toneFlag')), ['SQ', 'PQ'])
  assert.equal(result.quality, '128k')
})

test('Migu rejects trial streams, privilege denial and invalid encryption envelopes', async() => {
  for (const response of [envelope({ url: 'https://stream.test/trial', auditionsLength: 60 }), envelope({ cannotCode: 'VIP', dialogInfo: { text: '需要会员' } }), new Response(Buffer.from([1, 2, 3, 4]), { headers: { signature: '1' } })]) {
    const { context } = fixture(call => call.url.pathname.includes('/search/') ? [song] : response.clone())
    await assert.rejects(provider.musicUrl(context, original, 'auto'), /完整播放权限|需要会员|响应格式/)
  }
})

test('Migu catalog remains available for red heart even when listening requires membership', async() => {
  const { context, calls } = fixture(() => [song])
  assert.equal(await provider.available(context, original), true)
  assert.equal(calls.length, 1)
  assert(calls.every(call => !call.url.pathname.includes('can-listen')))
})

test('Migu writes the actual content ID and requires confirmed success', async() => {
  const { context, calls } = fixture(call => call.url.pathname.includes('/search/') ? [song] : ok({ successNum: 1 }))
  await provider.like(context, profile, original, true)
  assert.deepEqual(calls[1].body, { contentIds: ['80001'] })
  assert.equal(calls[1].url.pathname, '/pc/user/api/add-music-list-song/v1.0')
  await provider.like(context, profile, original, false)
  assert.deepEqual(calls[3].body, { channel: '23', contentId: '80001', songflag: '2' })
  await assert.rejects(provider.like(fixture(call => call.url.pathname.includes('/search/') ? [song] : ok({ successNum: 0 })).context, profile, original, true), /没有确认/)
  await assert.rejects(provider.like(fixture(call => call.url.pathname.includes('/search/') ? [song] : ok({})).context, profile, original, true), /没有确认/)
})
