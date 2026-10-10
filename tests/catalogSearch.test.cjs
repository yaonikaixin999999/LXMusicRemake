const test = require('node:test')
const assert = require('node:assert/strict')
const catalogFixture = require('./helpers/catalogFixture.cjs')
const readNeteaseRequest = catalogFixture.readNeteaseRequest
const qqBody = data => ({ code: 0, req: { code: 0, data } })
const qqSong = (id = 'song-mid') => ({ id: 77, mid: id, title: 'Fixture song', singer: [{ name: 'Fixture artist' }], album: { mid: 'album-mid', name: 'Fixture album' }, file: { media_mid: 'media-mid', size_128mp3: 100, size_320mp3: 0, size_flac: 0, size_hires: 0 }, interval: 200 })

test('NetEase album and artist categories send their true search types and page offset', async() => {
  const fixture = catalogFixture(request => {
    const { path, params } = readNeteaseRequest(request)
    assert.equal(path, '/api/cloudsearch/pc')
    assert.equal(params.offset, 18)
    assert.equal(params.limit, 18)
    return params.type === 10 ? { code: 200, result: { albums: [{ id: 10, name: 'Actual album', picUrl: 'https://fixture.test/album.jpg', artist: { name: 'Artist' }, size: 15 }], albumCount: 45 } } : { code: 200, result: { artists: [{ id: 20, name: 'Actual artist', musicSize: 21 }], artistCount: 40 } }
  })
  const album = await fixture.sdk.searchCatalog('wy', 'album', 'fixture', 2, 18)
  const artist = await fixture.sdk.searchCatalog('wy', 'artist', 'fixture', 2, 18)
  assert.equal(album.list[0].kind, 'album')
  assert.equal(album.list[0].id, '10')
  assert.equal(album.list[0].author, 'Artist')
  assert.equal(album.allPage, 3)
  assert.equal(artist.list[0].kind, 'artist')
  assert.equal(artist.total, 40)
  assert.deepEqual(fixture.calls.map(call => readNeteaseRequest(call).params.type), [10, 100])
})

test('NetEase album song slicing and artist page 2 preserve recording IDs and complete metadata', async() => {
  const song = id => ({ id, name: `Song ${id}`, ar: [{ name: 'Artist' }], al: { id: 10, name: 'Album', picUrl: 'https://fixture.test/album.jpg' }, dt: 210000, h: { size: 500000 } })
  const fixture = catalogFixture(request => {
    const { path, params } = readNeteaseRequest(request)
    if (path.includes('/album/')) return { code: 200, songs: [song(1), song(2), song(3)] }
    assert.equal(params.id, '20')
    assert.equal(params.offset, 2)
    return { code: 200, total: 7, songs: [song(4), song(5)] }
  })
  const album = await fixture.sdk.getCatalogTracks({ source: 'wy', kind: 'album', id: '10' }, 2, 2)
  assert.deepEqual(Array.from(album.list, track => track.songmid), [3])
  assert.equal(album.total, 3)
  assert.equal(album.list[0].albumId, 10)
  assert.equal(album.list[0].interval, '03:30')
  const artist = await fixture.sdk.getCatalogTracks({ source: 'wy', kind: 'artist', id: '20' }, 2, 2)
  assert.equal(artist.allPage, 4)
  assert.equal(artist.list[0]._types['320k'].size, '500000')
})

test('QQ catalogue categories and song detail use signed real endpoints with correct page offsets', async() => {
  const fixture = catalogFixture(({ options }) => {
    const req = options.body.req
    if (req.method === 'DoSearchForQQMusicDesktop') return qqBody({ body: req.param.search_type === 2 ? { album: { list: [{ albumMID: 'album-mid', albumID: 10, albumName: 'Actual album', singer_list: [{ name: 'Artist' }] }] } } : { singer: { list: [{ singerMID: 'singer-mid', singerID: 20, singerName: 'Actual artist' }] } }, meta: { sum: 40 } })
    assert.equal(req.param.begin, 30)
    return qqBody({ songList: [{ songInfo: qqSong() }], totalNum: 90 })
  })
  const album = await fixture.sdk.searchCatalog('tx', 'album', 'fixture', 2, 18)
  const artist = await fixture.sdk.searchCatalog('tx', 'artist', 'fixture', 2, 18)
  const albumTracks = await fixture.sdk.getCatalogTracks(album.list[0], 2, 30)
  const artistTracks = await fixture.sdk.getCatalogTracks(artist.list[0], 2, 30)
  assert.deepEqual(fixture.calls.slice(0, 2).map(call => call.options.body.req.param.search_type), [2, 1])
  assert.deepEqual(fixture.calls.slice(2).map(call => call.options.body.req.method), ['GetAlbumSongList', 'GetSingerSongList'])
  assert.equal(fixture.calls[2].options.body.req.param.albumMid, 'album-mid')
  assert.equal(fixture.calls[3].options.body.req.param.singerMid, 'singer-mid')
  assert.equal(albumTracks.list[0].songmid, 'song-mid')
  assert.equal(albumTracks.list[0].strMediaMid, 'media-mid')
  assert.equal(artistTracks.total, 90)
})

test('Kuwo catalog parsing handles the platform object format and artist works use artist ID', async() => {
  const fixture = catalogFixture(({ url }) => {
    if (url.searchParams.get('ft') === 'album') return "{'albumlist':[{'albumid':'123','name':'Actual&nbsp;album','artist':'Artist','img':'https://fixture.test/a.jpg','musiccnt':'12'}],'total':'20'}"
    if (url.searchParams.get('ft') === 'artist') return { abslist: [{ ARTISTID: '456', ARTIST: 'Artist', PICPATH: '240/artist.jpg', SONGNUM: '90' }], TOTAL: '10' }
    assert.equal(url.searchParams.get('artistid'), '456')
    assert.equal(url.searchParams.get('pn'), '1')
    return { artist: 'Artist', total: '90', musiclist: [{ MUSICRID: 'MUSIC_789', SONGNAME: 'Song', ARTIST: 'Artist', ALBUM: 'Album', ALBUMID: '123', DURATION: '200', N_MINFO: 'level:h,bitrate:320,format:mp3,size:5.0Mb' }] }
  })
  const album = await fixture.sdk.searchCatalog('kw', 'album', 'fixture', 1, 18)
  assert.equal(album.list[0].name, 'Actual album')
  const artist = await fixture.sdk.searchCatalog('kw', 'artist', 'fixture', 1, 18)
  const tracks = await fixture.sdk.getCatalogTracks(artist.list[0], 2, 30)
  assert.equal(tracks.list[0].songmid, '789')
  assert.equal(tracks.list[0].albumId, '123')
  assert.equal(tracks.allPage, 3)
})

test('Kugou artist shortlist has no fake extra pages; album search preserves true total', async() => {
  const fixture = catalogFixture(({ url }) => url.hostname === 'albumsearch.kugou.com'
    ? { status: 1, error_code: 0, data: { lists: [{ albumid: 123, albumname: 'Album', singer: 'Artist' }], total: 500 } }
    : { status: 1, errcode: 0, data: [{ singerid: 456, singername: 'Artist' }] })
  const album = await fixture.sdk.searchCatalog('kg', 'album', 'fixture', 1, 18)
  const artist = await fixture.sdk.searchCatalog('kg', 'artist', 'fixture', 1, 18)
  assert.equal(album.total, 500)
  assert.equal(album.allPage, 28)
  assert.equal(artist.allPage, 1)
  assert.equal(artist.total, 1)
  const secondPage = await fixture.sdk.searchCatalog('kg', 'artist', 'fixture', 2, 18)
  assert.equal(secondPage.list.length, 0)
  assert.equal(secondPage.total, 1)
})

test('Migu artist search and works pass distinct singer identifiers and pagination', async() => {
  const fixture = catalogFixture(({ url }) => {
    if (url.pathname.endsWith('search_all.do')) {
      assert.equal(JSON.parse(url.searchParams.get('searchSwitch')).singer, 1)
      return { code: '000000', singerResultData: { totalCount: '4', result: [{ id: '112', name: 'Artist' }] } }
    }
    assert.equal(url.searchParams.get('singerId'), '112')
    assert.equal(url.searchParams.get('pageNo'), '2')
    assert.equal(url.searchParams.get('resourceType'), '2')
    return { code: '000000', songNum: '100', songlist: [{ songId: 'song-id', copyrightId: 'copyright-id', songName: 'Song', album: 'Album', albumId: 'album-id', artists: [{ name: 'Artist' }], length: '03:30', newRateFormats: [{ formatType: 'HQ', size: 100 }], lrcUrl: 'https://fixture.test/lrc' }] }
  })
  const artists = await fixture.sdk.searchCatalog('mg', 'artist', 'fixture', 1, 18)
  const tracks = await fixture.sdk.getCatalogTracks(artists.list[0], 2, 30)
  assert.equal(tracks.list[0].copyrightId, 'copyright-id')
  assert.equal(tracks.list[0].lrcUrl, 'https://fixture.test/lrc')
  assert.equal(tracks.limit, 30)
  assert.equal(tracks.allPage, 4)
})

test('unsupported catalog sources and upstream failures reject instead of returning mislabeled songs', async() => {
  const fixture = catalogFixture(() => ({ code: 403, status: 0 }))
  await assert.rejects(fixture.sdk.searchCatalog('bi', 'album', 'fixture'), /未提供/)
  await assert.rejects(fixture.sdk.searchCatalog('mg', 'album', 'fixture'), /未提供/)
  assert.equal(fixture.calls.length, 0)
  await assert.rejects(fixture.sdk.searchCatalog('wy', 'artist', 'fixture'), /暂未返回/)
  await assert.rejects(fixture.sdk.searchCatalog('tx', 'album', 'fixture'), /暂未返回/)
})
