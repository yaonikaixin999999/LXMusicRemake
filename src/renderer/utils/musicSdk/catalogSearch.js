import { httpFetch } from '../request'
import { decodeName, formatPlayTime, sizeFormate } from '../index'
import { eapiRequest } from './wy/utils'
import { signRequest } from './tx/utils'
import qqMusicSearch from './tx/musicSearch'
import kuwoMusicSearch from './kw/musicSearch'
import { objStr2JSON } from './kw/util'
import { getMusicInfosByList } from './kg/musicInfo'
import { filterMusicInfoList as miguTracks } from './mg/musicInfo'

// Catalogue search uses platform album/artist endpoints, not song keyword results.
export const catalogSources = { album: ['wy', 'tx', 'kg', 'kw'], artist: ['wy', 'tx', 'kg', 'kw', 'mg'] }
const count = value => Math.max(0, Number(value) || 0)
const strings = value => decodeName(String(value ?? '').replace(/<[^>]*>/g, ''))
const picture = value => typeof value === 'string' && /^https?:\/\//.test(value) ? value.replaceAll('{size}', '400') : ''
const singers = values => (values ?? []).map(value => value.name ?? value.singer_name ?? '').filter(Boolean).join('、')
const result = (list, total, limit) => ({ list, total: count(total), limit, allPage: Math.max(1, Math.ceil(count(total) / limit)) })
const entry = (source, kind, id, name, img, author = '', extra = {}) => ({ source, kind, id: String(id ?? ''), name: strings(name), img: picture(img), author: strings(author), ...extra })

async function get(url) {
  const { statusCode, body } = await httpFetch(url, { timeout: 15000 }).promise
  if (statusCode !== 200) throw new Error(`平台目录请求失败 (${statusCode})`)
  return typeof body === 'string' ? objStr2JSON(body) : body
}

async function netease(path, params) {
  const { statusCode, body } = await eapiRequest(path, params).promise
  if (statusCode !== 200 || body?.code !== 200) throw new Error('网易云音乐暂未返回目录，请稍后重试。')
  return body
}

async function qq(module, method, param) {
  const { body } = await signRequest({ comm: { ct: 19, cv: 2151, uin: '0' }, req: { module, method, param } })
  if (body?.code !== 0 || body.req?.code !== 0 || !body.req.data) throw new Error('QQ 音乐暂未返回目录，请稍后重试。')
  return body.req.data
}

function neteaseTracks(raw, privileges = []) {
  return raw.filter(song => song.id && song.name).map(song => {
    const privilege = privileges.find(value => value.id === song.id) ?? song.privilege ?? {}
    const types = []
    const _types = {}
    for (const [type, field, bitrate] of [['128k', 'l', 128000], ['320k', 'h', 320000], ['flac', 'sq', 999000], ['flac24bit', 'hr', 1999000]]) {
      const audio = song[field] ?? song[`${field}Music`]
      if (audio || count(privilege.maxbr ?? privilege.maxBr) >= bitrate) {
        const size = audio?.size ? sizeFormate(audio.size) : null
        types.push({ type, size })
        _types[type] = { size }
      }
    }
    const album = song.al ?? song.album ?? {}
    return { source: 'wy', name: strings(song.name), singer: singers(song.ar ?? song.artists), albumName: strings(album.name), albumId: album.id, songmid: song.id, img: picture(album.picUrl), interval: formatPlayTime(count(song.dt ?? song.duration) / 1000), types, _types, typeUrl: {} }
  })
}

export async function searchCatalog(source, kind, text, page = 1, limit = 18) {
  if (!catalogSources[kind]?.includes(source)) throw new Error('此平台未提供该类型的音乐目录。')
  let list
  let total
  if (source === 'wy') {
    const body = await netease('/api/cloudsearch/pc', { s: text, type: kind === 'album' ? 10 : 100, offset: (page - 1) * limit, limit, total: page === 1 })
    const data = body.result ?? {}
    list = kind === 'album'
      ? (data.albums ?? []).map(value => entry(source, kind, value.id, value.name, value.picUrl, singers(value.artists ?? [value.artist ?? {}]), { count: count(value.size), date: value.publishTime ? new Date(value.publishTime).getFullYear().toString() : '' }))
      : (data.artists ?? []).map(value => entry(source, kind, value.id, value.name, value.picUrl ?? value.img1v1Url, '', { count: count(value.musicSize) }))
    total = kind === 'album' ? data.albumCount : data.artistCount
  } else if (source === 'tx') {
    const data = await qq('music.search.SearchCgiService', 'DoSearchForQQMusicDesktop', { grp: 1, num_per_page: limit, page_num: page, query: text, search_type: kind === 'album' ? 2 : 1, remoteplace: 'txt.newclient.top', searchid: qqMusicSearch.getSearchId() })
    const group = data.body?.[kind === 'album' ? 'album' : 'singer'] ?? data[kind === 'album' ? 'album' : 'singer'] ?? {}
    list = (group.list ?? []).map(value => {
      const mid = value.albumMID ?? value.albumMid ?? value.album_mid ?? value.mid ?? value.singerMID ?? value.singerMid ?? value.singer_mid
      return entry(source, kind, mid || value.albumID || value.singerID || value.id, value.albumName ?? value.album_name ?? value.singerName ?? value.singer_name ?? value.name, value.pic ?? (mid ? `https://y.gtimg.cn/music/photo_new/${kind === 'album' ? 'T002' : 'T001'}R500x500M000${mid}.jpg` : ''), singers(value.singer_list ?? value.singer), { numericId: count(value.albumID ?? value.album_id ?? value.singerID ?? value.singer_id ?? value.id), mid: String(mid ?? ''), count: count(value.song_count ?? value.songNum), date: strings(value.publishDate ?? value.publish_date) })
    })
    total = data.meta?.sum ?? group.total ?? data.total
  } else if (source === 'kg') {
    const body = await get(kind === 'album' ? `https://albumsearch.kugou.com/album_search?keyword=${encodeURIComponent(text)}&page=${page}&pagesize=${limit}` : `http://mobiles.kugou.com/api/v3/search/singer?keyword=${encodeURIComponent(text)}&page=${page}&pagesize=${limit}`)
    if (count(body.error_code ?? body.errcode) !== 0 || body.status !== 1) throw new Error('酷狗音乐暂未返回目录，请稍后重试。')
    const values = Array.isArray(body.data) ? body.data : body.data?.lists ?? []
    list = values.map(value => entry(source, kind, kind === 'album' ? value.albumid : value.singerid, kind === 'album' ? value.albumname : value.singername, value.img ?? value.imgurl, value.singer, { count: count(value.songcount), date: strings(value.publish_time) }))
    // Kugou's legacy singer endpoint returns one fixed shortlist and ignores pagination.
    total = body.data?.total ?? body.total ?? list.length
    if (kind === 'artist') { limit = Math.max(1, list.length); if (page > 1) list = [] }
  } else if (source === 'kw') {
    const body = await get(`https://search.kuwo.cn/r.s?all=${encodeURIComponent(text)}&pn=${page - 1}&rn=${limit}&ft=${kind === 'album' ? 'album' : 'artist'}&encoding=utf8&rformat=json`)
    const values = kind === 'album' ? body.albumlist ?? [] : body.abslist ?? []
    list = values.map(value => entry(source, kind, value.albumid ?? value.ARTISTID ?? value.id, value.name ?? value.ARTIST, value.img ?? value.hts_img ?? (value.PICPATH ? `https://img1.kuwo.cn/star/starheads/${value.PICPATH}` : ''), value.artist, { count: count(value.musiccnt ?? value.SONGNUM), date: strings(value.pub) }))
    total = body.TOTAL ?? body.total
  } else {
    const searchSwitch = encodeURIComponent(JSON.stringify({ song: 0, album: 0, singer: 1, tagSong: 0, mvSong: 0, bestShow: 0, songlist: 0 }))
    const body = await get(`https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/search_all.do?text=${encodeURIComponent(text)}&pageNo=${page}&pageSize=${limit}&searchSwitch=${searchSwitch}`)
    if (body.code !== '000000') throw new Error('咪咕音乐暂未返回歌手目录。')
    list = (body.singerResultData?.result ?? []).map(value => entry(source, kind, value.id, value.name, value.imgItems?.[0]?.img))
    total = body.singerResultData?.totalCount
  }
  return result(list.filter(value => value.id && value.name), total, limit)
}

export async function getCatalogTracks(item, page = 1, limit = 30) {
  const { source, kind, id } = item
  if (!catalogSources[kind]?.includes(source)) throw new Error('此平台未提供该类型的音乐目录。')
  let list
  let total
  if (source === 'wy') {
    const body = await netease(kind === 'album' ? `/api/v1/album/${id}` : '/api/v2/artist/songs', kind === 'album' ? {} : { id, offset: (page - 1) * limit, limit, order: 'hot' })
    const raw = body.songs ?? []
    total = kind === 'album' ? raw.length : body.total
    list = neteaseTracks(kind === 'album' ? raw.slice((page - 1) * limit, page * limit) : raw, body.privileges)
  } else if (source === 'tx') {
    const data = await qq(kind === 'album' ? 'music.musichallAlbum.AlbumSongList' : 'musichall.song_list_server', kind === 'album' ? 'GetAlbumSongList' : 'GetSingerSongList', kind === 'album' ? { albumMid: item.mid || id, albumID: item.numericId || 0, begin: (page - 1) * limit, num: limit, order: 2 } : { singerMid: item.mid || id, singerID: item.numericId || 0, order: 1, begin: (page - 1) * limit, num: limit })
    list = qqMusicSearch.handleResult((data.songList ?? data.songlist ?? []).map(value => value.songInfo ?? value))
    total = data.totalNum ?? data.total ?? list.length
  } else if (source === 'kg') {
    const body = await get(`http://mobiles.kugou.com/api/v${kind === 'album' ? '3/album' : '5/singer'}/song?${kind === 'album' ? 'albumid' : 'singerid'}=${encodeURIComponent(id)}&page=${page}&pagesize=${limit}&with_res_tag=0`)
    const data = body.data ?? body
    if (!Array.isArray(data.info)) throw new Error('酷狗音乐未返回该条目的作品。')
    list = await getMusicInfosByList(data.info)
    total = data.total
  } else if (source === 'kw') {
    const body = await get(`https://search.kuwo.cn/r.s?stype=${kind === 'album' ? 'albuminfo' : 'artist2music'}&${kind === 'album' ? 'albumid' : 'artistid'}=${encodeURIComponent(id)}&pn=${page - 1}&rn=${limit}&encoding=utf8&rformat=json&show_copyright_off=1`)
    if (!Array.isArray(body.musiclist)) throw new Error('酷我音乐未返回该条目的作品。')
    const songs = body.musiclist.map(value => ({ ...value, MUSICRID: value.MUSICRID ?? `MUSIC_${value.id}`, SONGNAME: value.SONGNAME ?? value.name, ARTIST: value.ARTIST ?? value.artist, ALBUM: value.ALBUM ?? body.name ?? value.album, ALBUMID: value.ALBUMID ?? body.albumid ?? value.albumid, N_MINFO: value.N_MINFO ?? value.MINFO ?? '' }))
    list = kuwoMusicSearch.handleResult(songs) ?? []
    total = body.total ?? body.songnum ?? list.length
  } else {
    const body = await get(`https://app.c.nf.migu.cn/MIGUM3.0/v1.0/content/singer_songs.do?singerId=${encodeURIComponent(id)}&pageNo=${page}&pageSize=${limit}&resourceType=2`)
    if (body.code !== '000000' || !Array.isArray(body.songlist)) throw new Error('咪咕音乐未返回该歌手的作品。')
    list = miguTracks(body.songlist)
    total = body.songNum
  }
  return result(list, total, limit)
}
