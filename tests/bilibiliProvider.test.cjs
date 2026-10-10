const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const http = require('node:http')
const { EventEmitter } = require('node:events')
const ts = require('typescript')

const modules = new Map()
function load(file) {
  if (modules.has(file)) return modules.get(file).exports
  const target = new Module(file, module)
  target.filename = file
  target.paths = Module._nodeModulePaths(path.dirname(file))
  target.require = name => {
    if (name === '@common/platformPlayback') return load(path.join(__dirname, '../src/common/platformPlayback.ts'))
    if (name === './bilibiliStream') return load(path.join(__dirname, '../src/main/modules/platformAccounts/providers/bilibiliStream.ts'))
    return require(name)
  }
  modules.set(file, target)
  target._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file)
  return target.exports
}
const provider = load(path.join(__dirname, '../src/main/modules/platformAccounts/providers/bilibili.ts')).bilibiliProvider
const { createBilibiliStream, closeBilibiliStreams, isBilibiliAudioUrl } = load(path.join(__dirname, '../src/main/modules/platformAccounts/providers/bilibiliStream.ts'))
const profile = { id: '12345', nickname: 'Fixture UP', avatar: '' }
const credentials = { SESSDATA: 'fixture-session', DedeUserID: profile.id, bili_jct: 'fixture-csrf' }
const bvid = 'BV1xx411c7mD'
const track = { id: `bi_${bvid}`, source: 'bi', name: 'Fixture recording', singer: 'Fixture UP', meta: { songId: bvid, albumId: '2', qualitys: [], _qualitys: {} } }
const video = { id: 2, bvid, title: 'Fixture recording', duration: 125, type: 2, upper: { mid: 88, name: 'Fixture UP' }, cover: '//i0.hdslb.com/fixture.jpg' }
const view = { aid: 2, bvid, cid: 62131, state: 0 }
const folderList = { count: 2, has_more: false, list: [{ id: 10, mid: profile.id, title: '默认收藏夹', media_count: 2 }, { id: 11, mid: profile.id, title: 'Created collection', media_count: 1 }] }
const audio = (id, bandwidth, suffix = 'm4s') => ({ id, bandwidth, codecs: id === 30251 ? 'fLaC' : 'mp4a.40.2', baseUrl: `https://upos-test.bilivideo.com/audio/${id}.${suffix}?deadline=9999999999` })
const dash = { dash: { audio: [audio(30216, 68703), audio(30232, 133703), audio(30280, 192123)], flac: { audio: audio(30251, 2300444) }, dolby: { audio: [audio(30250, 448444)] } } }

function fixture(handler, initialCookies = credentials) {
  let cookies = { ...initialCookies }
  const calls = []
  const events = new EventEmitter()
  const context = {
    cookies: async() => ({ ...cookies }),
    session: {
      cookies: events,
      async fetch(url, init) {
        assert(init.headers instanceof Headers)
        assert(init.signal instanceof AbortSignal)
        const request = { url: new URL(url), init, form: new URLSearchParams(init.body || '') }
        calls.push(request)
        const result = await handler(request)
        return result instanceof Response ? result : new Response(JSON.stringify({ code: 0, data: result }), { status: 200 })
      },
    },
  }
  return { context, calls, changeCookies(value) { cookies = value; events.emit('changed', {}, { name: 'SESSDATA' }, 'explicit', true) } }
}
const routeHandler = request => request.url.pathname.includes('/view') ? view : dash
const sleep = duration => new Promise(resolve => setTimeout(resolve, duration))

test('Bilibili uses its official login page, own cookies and distinct online identity', () => {
  assert.equal(provider.id, 'bilibili')
  assert.equal(provider.source, 'bi')
  assert.equal(provider.loginUrl, 'https://passport.bilibili.com/login')
  assert.equal(provider.cookieUrl, 'https://www.bilibili.com/')
  assert.equal(provider.authenticated({ DedeUserID: profile.id }), false)
  assert.equal(provider.authenticated(credentials), true)
})

test('profile validates the nav account rather than trusting presence of a cookie', async() => {
  const { context, calls } = fixture(() => ({ isLogin: true, mid: 12345, uname: 'Fixture UP', face: '//i0.hdslb.com/avatar' }))
  assert.deepEqual(await provider.profile(context), { ...profile, avatar: 'https://i0.hdslb.com/avatar' })
  assert.equal(calls[0].url.pathname, '/x/web-interface/nav')
  assert.equal(calls[0].init.headers.get('Referer'), 'https://www.bilibili.com/')
  assert.match(calls[0].init.headers.get('Cookie'), /SESSDATA=fixture-session/)
  await assert.rejects(provider.profile(fixture(() => ({ isLogin: false, mid: 12345 })).context), /登录状态已失效/)
  await assert.rejects(provider.profile(fixture(() => ({ isLogin: true, mid: 999 })).context), /登录状态已失效/)
  await assert.rejects(provider.profile(fixture(() => assert.fail('must not request'), {}).context), /先登录/)
})

test('created collections paginate, retain their own owner and exclude the default and foreign folders', async() => {
  const { context, calls } = fixture(request => request.url.searchParams.get('pn') === '1'
    ? { count: 4, has_more: true, list: [...folderList.list, { id: 90, mid: '999', title: 'Foreign account' }] }
    : { count: 4, has_more: false, list: [{ id: 12, mid: profile.id, title: 'Second collection', media_count: 8 }] })
  const result = await provider.playlists(context, profile)
  assert.deepEqual(result.map(item => item.id), ['bilibili:11', 'bilibili:12'])
  assert(result.every(item => item.platform === 'bilibili' && item.ownerId === profile.id))
  assert.deepEqual(calls.map(item => item.url.searchParams.get('pn')), ['1', '2'])
})

test('default favorites paginate videos with actual uploader metadata and skip removed/nonvideo records', async() => {
  const other = { ...video, id: 3, bvid: 'BV1xx411c7mE', title: 'Second recording' }
  const { context } = fixture(request => {
    if (request.url.pathname.includes('folder/created')) return folderList
    assert.equal(request.url.searchParams.get('media_id'), '10')
    return request.url.searchParams.get('pn') === '1'
      ? { info: { id: 10, upper: { mid: 12345 }, media_count: 4 }, has_more: true, medias: [video, { type: 2, title: '已失效视频', id: 4 }] }
      : { info: { id: 10, upper: { mid: 12345 }, media_count: 4 }, has_more: false, medias: [other, { ...video, type: 12 }] }
  })
  const result = await provider.likes(context, profile)
  assert.equal(result.length, 2)
  assert.equal(result[0].source, 'bi')
  assert.equal(result[0].singer, 'Fixture UP')
  assert.equal(result[0].meta.albumName, '哔哩哔哩视频')
  assert.equal(result[0].interval, '02:05')
  assert.equal(result[0].meta.picUrl, 'https://i0.hdslb.com/fixture.jpg')
  assert.deepEqual(result[0].meta.qualitys, [])
})

test('collections reject foreign ownership and incomplete pages instead of saving a partial success', async() => {
  const playlist = { remoteId: '11', ownerId: profile.id }
  await assert.rejects(provider.playlistTracks(fixture(() => assert.fail('not requested')).context, profile, { ...playlist, ownerId: '999' }), /不属于/)
  await assert.rejects(provider.playlistTracks(fixture(() => ({ info: { id: 11, upper: { mid: 999 }, media_count: 1 }, medias: [video] })).context, profile, playlist), /不属于/)
  await assert.rejects(provider.playlistTracks(fixture(() => ({ info: { id: 11, upper: { mid: 12345 }, media_count: 1 }, medias: [], has_more: true })).context, profile, playlist), /分页不完整/)
  await assert.rejects(provider.playlists(fixture(() => ({ count: 1, has_more: true, list: [] })).context, profile), /分页不完整/)
})

test('a new account with zero folders has an empty collection without a false sync failure', async() => {
  const { context } = fixture(() => ({ count: 0, list: null, has_more: false }))
  assert.deepEqual(await provider.likes(context, profile), [])
  assert.deepEqual(await provider.playlists(context, profile), [])
  await assert.rejects(provider.like(context, profile, track, true), /未找到默认收藏夹/)
})

test('search preserves Bilibili video titles and uploader identity without claiming artist metadata', async() => {
  const { context } = fixture(() => ({ result: [{ ...video, type: 'video', title: '<em>Fixture</em> &amp; recording', upper: undefined, author: 'Real uploader' }] }))
  const result = await provider.search(context, track)
  assert.equal(result[0].name, 'Fixture & recording')
  assert.equal(result[0].singer, 'Real uploader')
  assert.equal(result[0].source, 'bi')
})

test('favorites add and remove the video in the default folder with the platform CSRF token', async() => {
  const { context, calls } = fixture(request => request.url.pathname.includes('folder/created') ? folderList : request.url.pathname.includes('/view') ? view : {})
  await provider.like(context, profile, track, true)
  await provider.like(context, profile, track, false)
  const mutations = calls.filter(item => item.init.method === 'POST')
  assert.equal(mutations.length, 2)
  assert(mutations.every(item => item.url.pathname === '/x/v3/fav/resource/deal' && item.form.get('rid') === '2' && item.form.get('type') === '2' && item.form.get('csrf') === credentials.bili_jct))
  assert.equal(mutations[0].form.get('add_media_ids'), '10')
  assert.equal(mutations[0].form.get('del_media_ids'), '')
  assert.equal(mutations[1].form.get('add_media_ids'), '')
  assert.equal(mutations[1].form.get('del_media_ids'), '10')
  await assert.rejects(provider.like(fixture(() => assert.fail('missing CSRF'), { SESSDATA: 'x' }).context, profile, track, true), /登录状态已失效/)
})

test('quality choices reflect only audio streams actually returned by the platform', async() => {
  const { context, calls } = fixture(routeHandler)
  assert.deepEqual(await provider.musicQualitys(context, track), ['64k', '128k', '192k', 'dolby', 'flac24bit'])
  assert.equal(calls[1].url.pathname, '/x/player/playurl')
  assert.equal(calls[1].url.searchParams.get('cid'), '62131')
  assert.equal(calls[1].url.searchParams.get('fnval'), '4048')
  const lower = fixture(request => request.url.pathname.includes('/view') ? view : { dash: { audio: [audio(30216, 64055)] } }).context
  assert.deepEqual(await provider.musicQualitys(lower, track), ['64k'])
})

test('auto chooses the highest returned audio quality; a lower result reports its real bitrate and tier', async(t) => {
  const { context } = fixture(routeHandler)
  t.after(() => closeBilibiliStreams(context))
  const high = await provider.musicUrl(context, track, 'auto')
  assert.equal(high.quality, 'flac24bit')
  assert.equal(high.bitrate, 2300444)
  assert.match(high.url, /^http:\/\/127\.0\.0\.1:\d+\/audio\/[A-Za-z0-9_-]{43}$/)
  const low = await provider.musicUrl(context, track, '320k')
  assert.equal(low.quality, '192k')
  assert.equal(low.type, '192k')
  assert.equal(low.bitrate, 192123)
})

test('removed videos, trial clips, invalid CDNs and video-only streams cannot be passed off as full playable audio', async() => {
  for (const returned of [{ dash: { audio: [] }, durl: [{ url: 'https://upos-test.bilivideo.com/video.mp4' }] }, { is_preview: 1, ...dash }, { dash: { audio: [{ ...audio(30280, 192000), baseUrl: 'https://evil.invalid/audio' }] } }]) {
    const { context } = fixture(request => request.url.pathname.includes('/view') ? view : returned)
    assert.equal(await provider.available(context, track), false)
    await assert.rejects(provider.musicUrl(context, track, 'auto'), /音轨|试看/)
  }
  const { context } = fixture(() => ({ ...view, state: -1 }))
  assert.equal(await provider.available(context, track), false)
})

test('audio transport forwards Range and HEAD through the platform session with the video Referer', async(t) => {
  const { context, calls } = fixture(request => {
    assert.equal(request.init.headers.get('Referer'), `https://www.bilibili.com/video/${bvid}`)
    const data = request.init.method === 'HEAD' ? null : request.init.headers.get('Range') ? 'audio' : 'full audio'
    return new Response(data, { status: request.init.headers.get('Range') ? 206 : 200, headers: { 'Content-Type': 'audio/mp4', 'Content-Length': request.init.headers.get('Range') ? '5' : '10', 'Accept-Ranges': 'bytes', ...(request.init.headers.get('Range') ? { 'Content-Range': 'bytes 0-4/10' } : {}) } })
  })
  t.after(() => closeBilibiliStreams(context))
  const url = await createBilibiliStream(context, audio(30280, 192000).baseUrl, bvid)
  const partial = await fetch(url, { headers: { Range: 'bytes=0-4' } })
  assert.equal(partial.status, 206)
  assert.equal(partial.headers.get('Content-Range'), 'bytes 0-4/10')
  assert.equal(await partial.text(), 'audio')
  const head = await fetch(url, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('Content-Length'), '10')
  assert.equal(await head.text(), '')
  assert.deepEqual(calls.map(item => item.init.method), ['GET', 'HEAD'])
  assert.equal((await fetch(url, { headers: { Range: 'bytes=0-4,6-8' } })).status, 416)
})

test('invalid destinations and expired or unguessable audio tickets are rejected', async(t) => {
  const { context } = fixture(() => assert.fail('must not reach upstream'))
  t.after(() => closeBilibiliStreams(context))
  assert.equal(isBilibiliAudioUrl('https://bilivideo.com.evil.test/audio'), false)
  assert.equal(isBilibiliAudioUrl('http://127.0.0.1/audio'), false)
  await assert.rejects(createBilibiliStream(context, 'https://evil.test/audio', bvid), /无效/)
  const expired = await createBilibiliStream(context, audio(30280, 192000).baseUrl, bvid, Date.now() - 1)
  assert.equal((await fetch(expired)).status, 404)
  assert.equal((await fetch(new URL('/audio/' + 'a'.repeat(43), expired))).status, 404)
})

test('audio uses only validated backup CDNs and bounded validated redirects', async(t) => {
  const { context, calls } = fixture(request => {
    if (request.url.pathname === '/broken') throw new Error('unreachable primary CDN')
    if (request.url.pathname === '/redirect') return new Response(null, { status: 302, headers: { Location: 'https://upos-other.bilivideo.com/ready' } })
    if (request.url.pathname === '/ready') return new Response('audio', { headers: { 'Content-Type': 'audio/mp4' } })
    assert.fail('invalid host must not be contacted')
  })
  t.after(() => closeBilibiliStreams(context))
  const url = await createBilibiliStream(context, 'https://upos-test.bilivideo.com/broken', bvid, undefined, ['https://evil.test/private', 'https://upos-test.bilivideo.com/redirect'])
  assert.equal(await (await fetch(url)).text(), 'audio')
  assert.deepEqual(calls.map(item => item.url.pathname), ['/broken', '/redirect', '/ready'])
})

test('the native Referer hook belongs to the platform session and is removed on shutdown', async(t) => {
  let hook
  let filter
  const { context } = fixture(request => {
    assert.equal(request.init.headers.has('Referer'), false)
    hook({ url: request.url.toString(), requestHeaders: { Range: 'bytes=0-4' } }, result => {
      assert.equal(result.requestHeaders.Referer, `https://www.bilibili.com/video/${bvid}`)
      assert.equal(result.requestHeaders.Range, 'bytes=0-4')
    })
    return new Response('audio')
  })
  context.session.webRequest = { onBeforeSendHeaders(current, callback) { filter = current; hook = callback } }
  t.after(() => closeBilibiliStreams(context))
  const url = await createBilibiliStream(context, audio(30280, 192000).baseUrl, bvid)
  assert.equal(await (await fetch(url)).text(), 'audio')
  assert(filter.urls.some(item => item.includes('bilivideo.com')))
  assert(!filter.urls.some(item => item.includes('bilibili.com')))
  await closeBilibiliStreams(context)
  assert.equal(hook, null)
})

test('an account changed during URL resolution cannot adopt the previous account stream ticket', async(t) => {
  const { context, changeCookies } = fixture(request => {
    if (request.url.pathname.includes('/view')) return view
    changeCookies({ ...credentials, SESSDATA: 'another-session', DedeUserID: '999' })
    return dash
  })
  t.after(() => closeBilibiliStreams(context))
  await assert.rejects(provider.musicUrl(context, track, 'auto'), /账号已更改/)
})

test('stopping playback cancels the upstream stream and logout revokes every old-session ticket', async(t) => {
  const signals = []
  const { context, changeCookies } = fixture(request => {
    signals.push(request.init.signal)
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); request.init.signal.addEventListener('abort', () => controller.error(new Error('cancelled')), { once: true }) },
    }), { headers: { 'Content-Type': 'audio/mp4' } })
  })
  t.after(() => closeBilibiliStreams(context))
  const url = await createBilibiliStream(context, audio(30280, 192000).baseUrl, bvid)
  await new Promise((resolve, reject) => {
    const request = http.get(url, response => { response.once('data', () => { response.destroy(); request.destroy(); resolve() }) })
    request.on('error', error => { if (error.code !== 'ECONNRESET') reject(error) })
  })
  for (let retry = 0; retry < 20 && !signals[0].aborted; retry++) await sleep(10)
  assert.equal(signals[0].aborted, true)
  const active = await fetch(url)
  const reader = active.body.getReader()
  await reader.read()
  changeCookies({})
  for (let retry = 0; retry < 20 && !signals[1].aborted; retry++) await sleep(10)
  assert.equal(signals[1].aborted, true)
  await reader.cancel().catch(() => {})
  const stale = await fetch(url)
  assert([403, 404].includes(stale.status))
  await closeBilibiliStreams(context)
  assert.equal(context.session.cookies.listenerCount('changed'), 0)
})
