const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
function load(name) {
  const file = path.join(__dirname, `../src/main/modules/platformAccounts/providers/${name}.ts`)
  const target = new Module(file, module)
  target.filename = file
  target.paths = Module._nodeModulePaths(path.dirname(file))
  target._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file)
  return target.exports[`${name}Provider`]
}
const kugou = load('kugou')
const kuwo = load('kuwo')
const cookies = { KuGoo: 'KugooID=123&a_id=1014&t=web-token&NickName=%u9177%u72D7&ct=1700000000' }
function fixture(handler, credentials = cookies) {
  const calls = []
  const context = { cookies: async() => credentials, session: { fetch: async(url, init) => {
    const call = { url: new URL(url), init }
    assert(init.headers instanceof Headers)
    assert(init.signal instanceof AbortSignal)
    calls.push(call)
    const result = await handler(call)
    return result instanceof Response ? result : new Response(typeof result === 'string' ? result : JSON.stringify(result))
  } } }
  return { context, calls }
}
const kgTrack = { id: 'kg_123_hash', source: 'kg', name: 'Fixture', singer: 'Singer', interval: '03:00', meta: { songId: '123', albumId: '456', hash: 'standard', qualitys: [{ type: '128k', hash: 'standard' }, { type: '320k', hash: 'high' }, { type: 'flac', hash: 'lossless' }] } }
const kwTrack = { id: 'kw_123', source: 'kw', name: 'Fixture', singer: 'Singer', meta: { songId: '123' } }

test('Kugou only verifies official web-app token and never executes returned scripts', async() => {
  const { context, calls } = fixture(() => 'var error_code = 0; globalThis.linklineUnsafeScriptExecuted = true;')
  const user = await kugou.profile(context)
  assert.equal(user.id, '123')
  assert.equal(user.nickname, '酷狗')
  assert.equal(globalThis.linklineUnsafeScriptExecuted, undefined)
  assert.equal(calls[0].url.origin, 'https://login-user.kugou.com')
  assert.equal(calls[0].url.pathname, '/v1/autologin')
  assert.equal(calls[0].url.searchParams.get('a_id'), '1014')
  assert.equal(calls[0].url.searchParams.get('t'), 'web-token')
  for (const credentials of [{}, { userid: '123', token: 'android-token' }, { KuGoo: 'KugooID=123&a_id=1005&t=android-token' }]) {
    const missing = fixture(() => assert.fail('must not fetch with another app token'), credentials)
    assert.equal(kugou.authenticated(credentials), false)
    await assert.rejects(kugou.profile(missing.context), /网页登录/)
    assert.equal(missing.calls.length, 0)
  }
})

test('Kugou rejects failed or unverified official profile responses', async() => {
  for (const reply of ['var error_code = 20017;', '', 'document.cookie = "KuGoo=KugooID=123";']) {
    await assert.rejects(kugou.profile(fixture(() => reply).context), /验证失败|未返回可验证/)
  }
})

test('Kugou search uses public web transport and preserves per-quality hashes', async() => {
  const { context, calls } = fixture(() => ({ error_code: 0, data: { lists: [{ Audioid: 123, FileHash: 'standard', FileSize: 123, HQFileHash: 'high', HQFileSize: 321, OriSongName: 'Fixture', SingerName: 'Singer', Duration: 180 }] } }))
  const result = await kugou.search(context, kgTrack)
  assert.equal(calls[0].url.searchParams.get('platform'), 'WebFilter')
  assert.equal(calls[0].url.searchParams.has('token'), false)
  assert.equal(result[0].meta._qualitys['320k'].hash, 'high')
  assert.deepEqual(await kugou.musicQualitys(context, result[0]), ['128k', '320k'])
})

test('Kugou highest available tier falls back through real hashes and reports downgrade', async() => {
  const { context, calls } = fixture(call => call.url.searchParams.get('hash') === 'lossless' ? { status: 0, err_code: 30020 } : { status: 1, data: { play_url: 'https://stream.test/full.mp3', bitrate: 128000 } })
  const result = await kugou.musicUrl(context, kgTrack, 'jymaster')
  assert.deepEqual(calls.map(call => call.url.searchParams.get('hash')), ['lossless', 'high'])
  assert(calls.every(call => call.url.searchParams.get('r') === 'play/getdata'))
  assert.equal(result.quality, '128k')
  await assert.rejects(kugou.musicUrl(fixture(() => ({ status: 1, data: { play_url: 'https://stream.test/trial.mp3', is_free_part: 1 } })).context, kgTrack, 'auto'), /仅可试听/)
})

test('Limited official providers never report unsupported cloud sync as an empty library', async() => {
  for (const provider of [kugou, kuwo]) {
    const { context, calls } = fixture(() => assert.fail('unsupported sync must not fabricate an endpoint'))
    assert.equal(provider.syncSupported, false)
    assert(provider.notice.includes('收藏'))
    await assert.rejects(provider.likes(context, { id: '123' }), /收藏|歌单/)
    await assert.rejects(provider.playlists(context, { id: '123' }), /收藏|歌单/)
    await assert.rejects(provider.like(context, { id: '123' }, kwTrack, true), /收藏|歌单/)
    assert.equal(calls.length, 0)
  }
})

test('Kuwo public profile cookies cannot masquerade as a verified session', async() => {
  const { context, calls } = fixture(() => assert.fail('public profile must not be used as login proof'), { userid: '123', sid: 'token', username: 'User' })
  assert.equal(kuwo.webOnly, true)
  assert.equal(kuwo.authenticated(await context.cookies()), false)
  await assert.rejects(kuwo.profile(context), /仅支持网页登录/)
  assert.equal(calls.length, 0)
})

test('Kuwo requests official public headers and rejects paid and trial audio', async() => {
  const { context, calls } = fixture(call => call.url.pathname.endsWith('musicInfo') ? { code: 200, data: { rid: 123, name: 'Fixture', artist: 'Singer', formats: 'mp3|flac', isListenFee: false } } : { code: 200, data: { url: 'https://stream.test/full.mp3', bitrate: 128000 } }, {})
  const result = await kuwo.musicUrl(context, kwTrack, 'auto')
  assert.equal(result.quality, '128k')
  assert(calls.every(call => call.init.headers.get('Secret') && call.url.searchParams.get('plat') === 'web_www'))
  assert.equal(calls[1].url.pathname, '/api/v1/www/music/playUrl')
  await assert.rejects(kuwo.musicUrl(fixture(() => ({ code: 200, data: { rid: 123, name: 'Fixture', isListenFee: true } })).context, kwTrack, 'auto'), /完整播放权限/)
  await assert.rejects(kuwo.musicUrl(fixture(call => ({ code: 200, data: call.url.pathname.endsWith('musicInfo') ? { rid: 123, name: 'Fixture' } : { url: 'https://stream.test/trial', trialDuration: 60 } })).context, kwTrack, 'auto'), /仅可试听/)
})
