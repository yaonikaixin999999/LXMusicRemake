const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const file = path.join(__dirname, '../src/main/modules/platformAccounts/providers/qq.ts')
const target = new Module(file, module)
target.filename = file
target.paths = Module._nodeModulePaths(path.dirname(file))
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText
target._compile(code, file)
const provider = target.exports.qqProvider

const credentials = { uin: '12345', qqmusic_key: 'fixture-token' }
const profile = { id: '12345', nickname: 'QQ Fixture', avatar: '', extra: { euin: 'fixture-euin', likesTid: '88' } }
const song = {
  id: 97773,
  mid: '0039MnYb0qxYhV',
  name: 'Fixture Song',
  singer: [{ name: 'Fixture Artist' }],
  interval: 269,
  album: { mid: '000MkMni19ClKG', name: 'Fixture Album' },
  file: { media_mid: '003Qui1q2u1Zho', size_128mp3: 123 },
  status: 0,
}
const track = { id: `tx_${song.mid}`, source: 'tx', name: song.name, meta: { songId: song.mid, id: song.id } }
const cgiResponse = data => ({ code: 0, req: { code: 0, data } })
const webProfile = (creator = { nick: 'QQ Fixture', headpic: 'https://example.invalid/avatar', encrypt_uin: 'fixture-euin' }) => ({ code: 0, data: { creator } })
const favoritePlaylist = tid => cgiResponse({ v_playlist: [{ dirId: 201, tid }] })

function fixture(handler, cookies = credentials) {
  const calls = []
  const context = {
    cookies: async() => cookies,
    session: {
      async fetch(url, init) {
        assert(init.headers instanceof Headers, 'requests must use native Headers')
        assert(init.signal instanceof AbortSignal, 'requests must carry a native timeout signal')
        assert.equal(init.signal.aborted, false)
        const body = init.body ? JSON.parse(init.body) : null
        const request = { url: new URL(url), init, body, method: body?.req.method ?? 'WebProfile' }
        calls.push(request)
        const result = await handler(request)
        return result instanceof Response ? result : new Response(JSON.stringify(result), { status: 200 })
      },
    },
  }
  return { context, calls }
}

test('created playlists exclude system folders and other account records', async() => {
  const { context, calls } = fixture(() => cgiResponse({ v_playlist: [
    { dirId: 201, tid: 88, dirName: 'Likes' },
    { dirId: 2, tid: 91, dirName: 'Created', songNum: 201, coverPicUrl: 'https://example.test/cover' },
    { dirId: 3, tid: 92, dirName: 'Other Account', uin: '888' },
  ] }))
  const result = await provider.playlists(context, profile)
  assert.equal(calls[0].body.req.method, 'GetPlaylistByUin')
  assert.equal(calls[0].body.req.param.uin, profile.id)
  assert.equal(result.length, 1)
  assert.equal(result[0].id, 'qq:91')
  assert.equal(result[0].name, 'Created')
  assert.equal(result[0].count, 201)
})

test('created playlist paginates to its final song with no duplicate recordings', async() => {
  const { context, calls } = fixture(request => {
    const offset = request.body.req.param.song_begin
    return cgiResponse({ code: 0, songlist: [{ ...song, mid: `song-${offset}` }], total_song_num: 3 })
  })
  const result = await provider.playlistTracks(context, profile, { remoteId: '91', ownerId: profile.id })
  assert.equal(result.length, 3)
  assert.deepEqual(calls.map(call => call.body.req.param.song_begin), [0, 1, 2])
  assert(calls.every(call => call.body.req.param.disstid === 91 && call.body.req.param.dirid === 0))
})

test('created playlist refuses another owner and incomplete responses', async() => {
  const { context, calls } = fixture(() => cgiResponse({ songlist: [] }))
  await assert.rejects(provider.playlistTracks(context, profile, { ownerId: 'other', remoteId: '91' }), /不属于/)
  assert.equal(calls.length, 0)
  await assert.rejects(provider.playlistTracks(fixture(() => cgiResponse({ songlist: [], total_song_num: 1 })).context, profile, { ownerId: profile.id, remoteId: '91' }), /不完整/)
})

test('official OAuth callback returns to QQ Music through its web login bridge', () => {
  const login = new URL(provider.loginUrl)
  const redirect = new URL(login.searchParams.get('redirect_uri'))
  assert.equal(login.protocol, 'https:')
  assert.equal(login.hostname, 'graph.qq.com')
  assert.equal(login.pathname, '/oauth2.0/authorize')
  assert.equal(login.searchParams.get('response_type'), 'code')
  assert.equal(login.searchParams.get('client_id'), '100497308')
  assert.equal(login.searchParams.get('scope'), 'get_user_info')
  assert.equal(redirect.protocol, 'https:')
  assert.equal(redirect.hostname, 'y.qq.com')
  assert.equal(redirect.pathname, '/portal/wx_redirect.html')
  assert.equal(redirect.searchParams.get('login_type'), '1')
  assert.equal(redirect.searchParams.get('surl'), 'https://y.qq.com/')
  assert.equal(provider.cookieUrl, 'https://y.qq.com/')
  assert.deepEqual(provider.domains, ['y.qq.com', 'qq.com', 'gtimg.cn'])
})

test('profile rejects partial music credentials before issuing any request', async() => {
  for (const cookies of [{}, { uin: '12345' }, { qqmusic_key: 'fixture-token' }]) {
    const { context, calls } = fixture(() => assert.fail('incomplete credentials must not be fetched'), cookies)
    await assert.rejects(provider.profile(context), /未登录/)
    assert.equal(calls.length, 0)
  }
})

test('profile verifies the web session and sends web transport with timeout signals', async() => {
  const { context, calls } = fixture(request => request.method === 'WebProfile' ? webProfile() : favoritePlaylist(88), {
    qqmusic_uin: 'o00012345', qm_keyst: 'fixture-token', ignored: '',
  })
  const result = await provider.profile(context)
  assert.deepEqual(result, { ...profile, avatar: 'https://example.invalid/avatar' })
  assert.equal(calls.length, 2)
  const homepage = calls[0]
  assert.equal(homepage.url.origin, 'https://c6.y.qq.com')
  assert.equal(homepage.url.pathname, '/rsc/fcgi-bin/fcg_get_profile_homepage.fcg')
  assert.equal(homepage.url.searchParams.get('userid'), '12345')
  assert.equal(homepage.url.searchParams.get('loginUin'), '12345')
  assert.equal(homepage.url.searchParams.get('reqfrom'), '1')
  assert.equal(homepage.init.headers.get('Cookie'), 'qqmusic_uin=o00012345; qm_keyst=fixture-token')
  for (const request of calls) {
    assert.equal(request.init.headers.get('Referer'), 'https://y.qq.com/')
    assert.equal(request.init.headers.get('Origin'), 'https://y.qq.com')
  }
  const playlist = calls[1]
  assert.equal(playlist.url.href, 'https://u.y.qq.com/cgi-bin/musicu.fcg')
  assert.equal(playlist.init.method, 'POST')
  assert.equal(playlist.init.headers.get('Content-Type'), 'application/json')
  assert.equal(playlist.body.req.module, 'music.musicasset.PlaylistBaseRead')
  assert.equal(playlist.body.req.method, 'GetPlaylistByUin')
  assert.deepEqual(playlist.body.req.param, { uin: '12345' })
  assert.equal(playlist.body.comm.uin, '12345')
  assert.equal(playlist.body.comm.platform, 'yqq.json')
  assert.equal(playlist.body.comm.g_tk_new_20200303, playlist.body.comm.g_tk)
  assert.equal(String(playlist.body.comm.g_tk), homepage.url.searchParams.get('g_tk'))
  assert.equal('authst' in playlist.body.comm, false)
  assert.equal('tmeLoginType' in playlist.body.comm, false)
})

test('profile rejects expired, malformed, and missing favorite playlist responses', async() => {
  const cases = [
    { homepage: { code: 1000, data: { creator: { nick: 'Public Profile' } } }, expected: /失效/ },
    { homepage: { code: 0, data: {} }, expected: /资料/ },
    { homepage: webProfile(), playlists: cgiResponse({ v_playlist: [] }), expected: /红心歌单/ },
  ]
  for (const item of cases) {
    const { context } = fixture(request => request.method === 'WebProfile' ? item.homepage : item.playlists)
    await assert.rejects(provider.profile(context), item.expected)
  }
})

test('missing encrypted UIN falls back to the account favorite playlist ID', async() => {
  const { context, calls } = fixture(request => {
    if (request.method === 'WebProfile') return webProfile({ nick: 'QQ Web' })
    if (request.method === 'GetPlaylistByUin') return favoritePlaylist(88)
    return cgiResponse({ songlist: [song], total_song_num: 1 })
  })
  const result = await provider.profile(context)
  assert.equal(result.extra.euin, '')
  assert.equal(result.extra.likesTid, '88')
  assert.equal((await provider.likes(context, result)).length, 1)
  assert.equal(calls.at(-1).body.req.param.disstid, 88)
  assert.equal(calls.at(-1).body.req.param.dirid, 0)
})

test('missing encrypted UIN requires a positive safe favorite playlist ID', async() => {
  for (const tid of [undefined, 0, -1, 'not-an-id', Number.MAX_SAFE_INTEGER + 1]) {
    const { context } = fixture(request => request.method === 'WebProfile' ? webProfile({ nick: 'QQ Web' }) : favoritePlaylist(tid))
    await assert.rejects(provider.profile(context), /标识/)
  }
})

test('likes paginates by received songs and keeps MID and numeric ID for their distinct APIs', async() => {
  const { context, calls } = fixture(request => cgiResponse({
    songlist: request.body.req.param.song_begin === 0 ? [song] : [{ ...song, id: 1, mid: 'second-song' }],
    total_song_num: 2,
    code: 0,
    subcode: 0,
  }))
  const liked = await provider.likes(context, profile)
  assert.equal(liked.length, 2)
  assert.deepEqual(calls.map(request => request.body.req.param.song_begin), [0, 1])
  for (const request of calls) {
    assert.equal(request.method, 'CgiGetDiss')
    assert.equal(request.body.req.param.song_num, 100)
    assert.equal(request.body.req.param.disstid, 0)
    assert.equal(request.body.req.param.dirid, 201)
    assert.equal(request.body.req.param.enc_host_uin, 'fixture-euin')
  }
  assert.equal(liked[0].id, `tx_${song.mid}`)
  assert.equal(liked[0].meta.songId, song.mid)
  assert.equal(liked[0].meta.id, song.id)
  assert.equal(liked[0].interval, '04:29')
  assert.equal(liked[0].meta.picUrl, `https://y.gtimg.cn/music/photo_new/T002R500x500M000${song.album.mid}.jpg`)
})

test('likes accepts an empty favorite collection but rejects incomplete and malformed pages', async() => {
  assert.deepEqual(await provider.likes(fixture(() => cgiResponse({ songlist: [], total_song_num: 0 })).context, profile), [])
  const cases = [
    { response: cgiResponse({ songlist: [], total_song_num: 5 }), expected: /分页/ },
    { response: cgiResponse({ total_song_num: 5 }), expected: /格式/ },
    { response: cgiResponse({ songlist: [], code: 1 }), expected: /无法读取/ },
    { response: cgiResponse({ songlist: [], subcode: 1 }), expected: /无法读取/ },
    { response: { code: 0, req: { code: 1000 } }, expected: /失效/ },
  ]
  for (const item of cases) await assert.rejects(provider.likes(fixture(() => item.response).context, profile), item.expected)
})

test('availability looks up MID and requires a playable catalog entry', async() => {
  const { context, calls } = fixture(() => cgiResponse({ track_info: song }))
  assert.equal(await provider.available(context, track), true)
  assert.equal(calls[0].body.req.param.song_mid, song.mid)
  const unavailable = [{ ...song, status: 1 }, { ...song, mid: '' }, { ...song, file: {} }, {}]
  for (const detail of unavailable) {
    assert.equal(await provider.available(fixture(() => cgiResponse({ track_info: detail })).context, track), false)
  }
})

test('requests create a native 20 second timeout signal', async(t) => {
  const timeout = AbortSignal.timeout
  const timeoutMock = t.mock.method(AbortSignal, 'timeout', milliseconds => {
    assert.equal(milliseconds, 20000)
    return timeout.call(AbortSignal, milliseconds)
  })
  assert.equal(await provider.available(fixture(() => cgiResponse({ track_info: song })).context, track), true)
  assert.equal(timeoutMock.mock.callCount(), 1)
})

test('red heart writes use numeric song IDs and require a successful remote result', async() => {
  const { context, calls } = fixture(() => cgiResponse({ retCode: 0 }))
  await provider.like(context, profile, track, true)
  await provider.like(context, profile, track, false)
  assert.deepEqual(calls.map(request => request.method), ['AddSonglist', 'DelSonglist'])
  for (const request of calls) {
    assert.equal(request.body.req.module, 'music.musicasset.PlaylistDetailWrite')
    assert.equal(request.body.req.param.dirId, 201)
    assert.deepEqual(request.body.req.param.v_songInfo, [{ songId: song.id, songType: 0 }])
  }
  await assert.rejects(provider.like(fixture(() => cgiResponse({ retCode: 42 })).context, profile, track, false), /42/)
  await assert.rejects(provider.like(fixture(() => cgiResponse({})).context, profile, track, true), /红心操作失败/)
  await assert.rejects(provider.like(fixture(() => ({ code: 0, req: { code: 104401 } })).context, profile, track, true), /失效/)
})

test('red heart resolves missing numeric IDs through MID before writing', async() => {
  const { context, calls } = fixture(request => request.method === 'get_song_detail_yqq'
    ? cgiResponse({ track_info: { ...song, type: 2 } })
    : cgiResponse({ retCode: 0 }))
  const missingId = { ...track, meta: { songId: song.mid } }
  await provider.like(context, profile, missingId, true)
  assert.deepEqual(calls.map(request => request.method), ['get_song_detail_yqq', 'AddSonglist'])
  assert.equal(calls[0].body.req.param.song_mid, song.mid)
  assert.deepEqual(calls[1].body.req.param.v_songInfo, [{ songId: song.id, songType: 2 }])
  const malformed = fixture(() => cgiResponse({ track_info: {} }))
  await assert.rejects(provider.like(malformed.context, profile, missingId, true), /数字 ID/)
  assert.equal(malformed.calls.length, 1)
})

test('HTTP failures propagate without interpreting an unsuccessful response as data', async() => {
  await assert.rejects(provider.available(fixture(() => new Response('{}', { status: 503 })).context, track), /503/)
})

test('highest audio requests catalog master format and reports the actual entitled fallback', async() => {
  const { context, calls } = fixture(request => request.method === 'get_song_detail_yqq'
    ? cgiResponse({ track_info: { ...song, file: { ...song.file, size_320mp3: 100, size_flac: 200, size_new: [300] } } })
    : cgiResponse({ sip: ['https://stream.test/'], midurlinfo: request.body.req.param.filename.map(filename => ({ filename, purl: filename.startsWith('M800') ? filename : '' })) }))
  const result = await provider.musicUrl(context, { ...track, meta: { ...track.meta, strMediaMid: song.file.media_mid } }, 'auto')
  assert.equal(calls[1].body.req.param.filename[0], `AI00${song.file.media_mid}.flac`)
  assert.equal(result.quality, '320k')
  assert.equal(result.type, '320k')
  assert(result.url.startsWith('https://stream.test/M800'))
})

test('explicit Hi-Res uses its own filename and does not mislabel FLAC as 24-bit', async() => {
  const { context, calls } = fixture(request => cgiResponse({ sip: ['https://stream.test/'], midurlinfo: request.body.req.param.filename.map(filename => ({ filename, purl: filename.startsWith('F000') ? filename : '' })) }))
  const result = await provider.musicUrl(context, { ...track, meta: { ...track.meta, strMediaMid: song.file.media_mid } }, 'flac24bit')
  assert.equal(calls[0].body.req.param.filename[0], `RS01${song.file.media_mid}.flac`)
  assert.equal(result.quality, 'flac')
  assert.equal(result.type, 'flac')
})
