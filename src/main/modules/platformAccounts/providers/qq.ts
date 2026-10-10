import type { PlatformPlaylist, PlatformProfile } from '@common/platformAccounts'
import type { PlatformQuality, PlatformStream } from '@common/platformPlayback'
import { randomUUID } from 'node:crypto'

import type { PlatformProvider, ProviderContext } from './types'

const API = 'https://u.y.qq.com/cgi-bin/musicu.fcg'
const COOKIE_URL = 'https://y.qq.com/'
const loginRedirect = `${COOKIE_URL}portal/wx_redirect.html?login_type=1&surl=${encodeURIComponent(COOKIE_URL)}`
const loginUrl = new URL('https://graph.qq.com/oauth2.0/authorize')
loginUrl.search = new URLSearchParams({ response_type: 'code', client_id: '100497308', redirect_uri: loginRedirect, scope: 'get_user_info', state: 'linkline', display: 'pc' }).toString()

interface QqSong {
  id?: number
  mid?: string
  name?: string
  title?: string
  subtitle?: string
  interval?: number
  singer?: Array<{ name?: string, mid?: string }>
  album?: { id?: number, mid?: string, name?: string, pmid?: string }
  file?: { media_mid?: string, size_128mp3?: number, size_320mp3?: number, size_flac?: number, size_hires?: number }
  status?: number
}

interface CgiResponse {
  code?: number
  msg?: string
  req?: { code?: number, msg?: string, data?: Record<string, unknown> }
  [key: string]: unknown
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .filter(([key, value]) => key && value != null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join('; ')
}

function cookieValue(cookies: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = cookies[name]
    if (value) return value
  }
  return ''
}

function gtk(skey: string): number {
  let hash = 5381
  for (let index = 0; index < skey.length; index++) hash += (hash << 5) + skey.charCodeAt(index)
  return hash & 0x7fffffff
}

function formatInterval(seconds: number | undefined): string | null {
  if (!seconds || seconds < 0) return null
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function asSongs(value: unknown): QqSong[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is QqSong => item != null && typeof item === 'object')
}

function imageUrl(song: QqSong): string {
  const album = song.album
  if (album?.mid) return `https://y.gtimg.cn/music/photo_new/T002R500x500M000${album.mid}.jpg`
  const singer = song.singer?.[0]
  return singer?.mid ? `https://y.gtimg.cn/music/photo_new/T001R500x500M000${singer.mid}.jpg` : ''
}

function normalizeSong(song: QqSong): LX.Music.MusicInfo_tx | null {
  const mid = song.mid
  const name = song.title ?? song.name
  if (!mid || !name) return null
  const id = song.id ?? mid
  const album = song.album ?? {}
  const mediaMid = song.file?.media_mid ?? ''
  const qualitys: LX.Music.MusicQualityType[] = []
  if (song.file?.size_128mp3) qualitys.push({ type: '128k', size: String(song.file.size_128mp3) })
  if (song.file?.size_320mp3) qualitys.push({ type: '320k', size: String(song.file.size_320mp3) })
  if (song.file?.size_flac) qualitys.push({ type: 'flac', size: String(song.file.size_flac) })
  if (song.file?.size_hires) qualitys.push({ type: 'flac24bit', size: String(song.file.size_hires) })
  return {
    id: `tx_${mid}`,
    name,
    singer: song.singer?.map(item => item.name ?? '').filter(Boolean).join(' / ') ?? '',
    source: 'tx',
    interval: formatInterval(song.interval),
    meta: {
      songId: mid,
      albumName: album.name ?? '',
      recordingVersion: /\blive\b|重录|重新录制|现场|演唱会|\bremaster(?:ed)?\b|\bremix\b|翻唱|伴奏|\binstrumental\b|\bacoustic\b/i.test(song.subtitle ?? '') ? song.subtitle : '',
      albumId: album.mid ?? album.id ?? '',
      picUrl: imageUrl(song),
      qualitys,
      _qualitys: Object.fromEntries(qualitys.map(item => [item.type, { size: item.size }])),
      strMediaMid: mediaMid,
      albumMid: album.mid ?? '',
      id: typeof id === 'number' ? id : undefined,
    },
  }
}

async function jsonRequest(context: ProviderContext, url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const cookies = await context.cookies()
  const headers = new Headers(init.headers)
  headers.set('Cookie', cookieHeader(cookies))
  headers.set('Referer', 'https://y.qq.com/')
  headers.set('Origin', 'https://y.qq.com')
  headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36')
  const response = await context.session.fetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`QQ 音乐请求失败 (${response.status})`)
  return asRecord(await response.json())
}

async function cgi(context: ProviderContext, module: string, method: string, param: Record<string, unknown>, options: { comm?: Record<string, unknown> } = {}): Promise<Record<string, unknown>> {
  const cookies = await context.cookies()
  const uin = cookieValue(cookies, 'qqmusic_uin', 'uin', 'p_uin', 'wxuin').replace(/^o0*/, '')
  const musicKey = cookieValue(cookies, 'qqmusic_key', 'qm_keyst')
  const skey = musicKey || cookieValue(cookies, 'p_skey', 'skey')
  const body = {
    comm: {
      ct: 24,
      cv: 4747474,
      format: 'json',
      inCharset: 'utf-8',
      outCharset: 'utf-8',
      notice: 0,
      platform: 'yqq.json',
      needNewCode: 1,
      uin: uin || '0',
      g_tk: gtk(skey),
      g_tk_new_20200303: gtk(skey),
      ...options.comm,
    },
    req: { module, method, param },
  }
  const text = JSON.stringify(body)
  // Keep this as the web transport used by QQ's public callback page. App
  // authst/tmeLoginType parameters select a different login scheme.
  const result = await jsonRequest(context, API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text }) as CgiResponse
  if (result.code !== 0 || result.req?.code !== 0) {
    if (result.req?.code === 1000 || result.req?.code === 104401 || result.req?.code === 104400) throw new Error('QQ 音乐登录状态已失效，请重新登录')
    throw new Error(result.req?.msg ?? result.msg ?? `QQ 音乐接口拒绝请求 (${result.req?.code ?? result.code ?? -1})`)
  }
  return asRecord(result.req?.data)
}

const formats: Array<{ quality: PlatformQuality, prefix: string, extension: string, type: LX.Quality }> = [
  { quality: 'jymaster', prefix: 'AI00', extension: 'flac', type: 'flac24bit' },
  { quality: 'sky', prefix: 'Q001', extension: 'flac', type: 'flac24bit' },
  { quality: 'jyeffect', prefix: 'Q000', extension: 'flac', type: 'flac24bit' },
  { quality: 'flac24bit', prefix: 'RS01', extension: 'flac', type: 'flac24bit' },
  { quality: 'flac', prefix: 'F000', extension: 'flac', type: 'flac' },
  { quality: '320k', prefix: 'M800', extension: 'mp3', type: '320k' },
  { quality: '192k', prefix: 'C600', extension: 'm4a', type: '192k' },
  { quality: '128k', prefix: 'M500', extension: 'mp3', type: '128k' },
]
async function vkey(context: ProviderContext, track: LX.Music.MusicInfoOnline, candidates: typeof formats): Promise<PlatformStream> {
  const cookies = await context.cookies()
  const uin = cookieValue(cookies, 'qqmusic_uin', 'uin', 'p_uin', 'wxuin').replace(/^o0*/, '') || '0'
  const meta = track.meta as unknown as Record<string, unknown>
  const songMid = String(meta.songId ?? '')
  const mediaMid = String(meta.strMediaMid || `${songMid}${songMid}`)
  if (!songMid || !mediaMid) throw new Error('QQ 音乐歌曲缺少播放标识')
  const guid = String(Math.floor(10_000_000 + Math.random() * 89_999_999))
  const result = await jsonRequest(context, API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      comm: { ct: 24, cv: 4747474, format: 'json', inCharset: 'utf-8', outCharset: 'utf-8', notice: 0, platform: 'yqq.json', needNewCode: 1, uin },
      req: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: {
          guid,
          songmid: candidates.map(() => songMid),
          songtype: candidates.map(() => 0),
          uin,
          loginflag: uin === '0' ? 0 : 1,
          platform: '20',
          filename: candidates.map(format => `${format.prefix}${mediaMid}.${format.extension}`),
        },
      },
    }),
  })
  const data = asRecord(asRecord(result.req).data)
  const items = Array.isArray(data.midurlinfo) ? data.midurlinfo.map(asRecord) : []
  for (const format of candidates) {
    const index = candidates.indexOf(format)
    const item = items.find(item => String(item.filename ?? '').startsWith(format.prefix) && item.purl) ?? items[index]
    const purl = String(item?.purl ?? '')
    if (!purl || /(?:^|\/)RS02/.test(purl)) continue
    const filename = String(item?.filename ?? purl.split('?')[0].split('/').pop() ?? '')
    const actual = formats.find(entry => filename.startsWith(entry.prefix)) ?? format
    const sip = Array.isArray(data.sip) ? String(data.sip.find(item => String(item).startsWith('https:')) ?? data.sip[0] ?? '') : ''
    return { url: /^https?:\/\//.test(purl) ? purl : `${sip || 'https://ws.stream.qqmusic.qq.com/'}${purl}`, type: actual.type, quality: actual.quality, expires: 600 }
  }
  throw new Error('QQ 音乐没有返回完整可播放音频，请检查版权、会员或登录权限')
}

async function profile(context: ProviderContext): Promise<PlatformProfile> {
  const cookies = await context.cookies()
  const uin = cookieValue(cookies, 'qqmusic_uin', 'uin', 'p_uin', 'wxuin').replace(/^o0*/, '')
  const musicKey = cookieValue(cookies, 'qqmusic_key', 'qm_keyst')
  if (!uin || !musicKey) throw new Error('QQ 音乐未登录')
  const endpoint = new URL('https://c6.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg')
  endpoint.search = new URLSearchParams({ g_tk: String(gtk(musicKey)), format: 'json', inCharset: 'utf-8', outCharset: 'utf-8', notice: '0', cid: '205360838', needNewCode: '0', loginUin: uin, hostUin: '0', userid: uin, reqfrom: '1' }).toString()
  const authenticated = await jsonRequest(context, endpoint.toString())
  if (Number(authenticated.code) !== 0) throw new Error('QQ 音乐登录状态已失效，请重新登录')
  const profileData = asRecord(authenticated.data)
  const userInfo = asRecord(profileData.creator)
  if (!Object.keys(userInfo).length) throw new Error('QQ 音乐未返回用户资料，请重试')
  const playlists = await cgi(context, 'music.musicasset.PlaylistBaseRead', 'GetPlaylistByUin', { uin })
  const list = Array.isArray(playlists.v_playlist) ? playlists.v_playlist.map(asRecord) : []
  const favorite = list.find(item => Number(item.dirId ?? item.dirid) === 201)
  if (!favorite) throw new Error('QQ 音乐未返回红心歌单')
  const euin = String(userInfo.encryptUin ?? userInfo.encrypt_uin ?? userInfo.euin ?? profileData.encrypt_uin ?? profileData.encryptUin ?? cookies.euin ?? '')
  const nickname = String(userInfo.nick ?? userInfo.nickname ?? userInfo.nickName ?? userInfo.name ?? favorite.nick ?? uin) || uin
  const avatar = String(userInfo.headurl ?? userInfo.headpic ?? userInfo.headPic ?? userInfo.avatar ?? favorite.avatar ?? '')
  const favoriteId = Number(favorite.tid ?? favorite.id)
  if (!euin && (!Number.isSafeInteger(favoriteId) || favoriteId <= 0)) throw new Error('QQ 音乐未返回红心歌单标识，请重试')
  return { id: uin, nickname, avatar, extra: { euin, likesTid: String(favorite.tid ?? favorite.id ?? '0') } }
}

async function likes(context: ProviderContext, user: PlatformProfile): Promise<LX.Music.MusicInfoOnline[]> {
  const euin = user.extra?.euin ?? ''
  const songs: LX.Music.MusicInfoOnline[] = []
  let offset = 0
  for (let page = 0; page < 200; page++) {
    const data = await cgi(context, 'music.srfDissInfo.DissInfo', 'CgiGetDiss', {
      disstid: euin ? 0 : Number(user.extra?.likesTid ?? '0'),
      dirid: euin ? 201 : 0,
      tag: true,
      song_begin: offset,
      song_num: 100,
      userinfo: true,
      orderlist: true,
      enc_host_uin: euin,
    })
    if ((data.code != null && Number(data.code) !== 0) || (data.subcode != null && Number(data.subcode) !== 0)) throw new Error('QQ 音乐无法读取红心歌单')
    if (!Array.isArray(data.songlist)) throw new Error('QQ 音乐红心歌单响应格式无效')
    const batch = asSongs(data.songlist)
    songs.push(...batch.map(normalizeSong).filter((song): song is LX.Music.MusicInfo_tx => song != null))
    offset += batch.length
    const total = Number(data.total_song_num ?? offset)
    if (offset >= total) return songs
    if (!batch.length) throw new Error('QQ 音乐红心歌单分页不完整')
  }
  throw new Error('QQ 音乐红心歌单超过同步上限')
}

async function search(context: ProviderContext, track: LX.Music.MusicInfo): Promise<LX.Music.MusicInfoOnline[]> {
  const query = track.name.trim()
  const data = await cgi(context, 'music.search.SearchCgiService', 'DoSearchForQQMusicDesktop', {
    searchid: `${randomUUID().replace(/-/g, '').toUpperCase()}${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`,
    query,
    search_type: 0,
    num_per_page: 20,
    page_num: 1,
    grp: 1,
    remoteplace: 'txt.newclient.top',
  }, { comm: { ct: '19', cv: '2201', platform: 'yqq.json' } })
  const songData = asRecord(asRecord(data.body).song)
  const meta = asRecord(data.meta)
  if (!Array.isArray(songData.list) || (Number(meta.sum ?? 0) > 0 && !songData.list.length)) throw new Error('QQ 音乐搜索未返回完整结果')
  const songs = asSongs(songData.list)
  return songs.map(normalizeSong).filter((song): song is LX.Music.MusicInfo_tx => song != null)
}

async function playlists(context: ProviderContext, user: PlatformProfile): Promise<PlatformPlaylist[]> {
  const data = await cgi(context, 'music.musicasset.PlaylistBaseRead', 'GetPlaylistByUin', { uin: user.id })
  if (!Array.isArray(data.v_playlist)) throw new Error('QQ 音乐未返回用户歌单列表')
  const result = new Map<string, PlatformPlaylist>()
  for (const value of data.v_playlist) {
    const item = asRecord(value)
    const dirId = Number(item.dirId ?? item.dirid)
    // The account endpoint returns created folders. Skip the platform's
    // system folders and any entry explicitly owned by another account.
    if ([200, 201, 202].includes(dirId)) continue
    const creator = asRecord(item.creator_info ?? item.creator)
    const owner = String(item.owner_uin ?? item.uin ?? creator.uin ?? user.id).replace(/^o0*/, '')
    if (owner !== user.id) continue
    const remoteId = String(item.tid ?? item.id ?? '')
    if (!/^\d+$/.test(remoteId) || Number(remoteId) <= 0) continue
    result.set(remoteId, {
      id: `qq:${remoteId}`,
      platform: 'qq',
      ownerId: user.id,
      remoteId,
      name: String(item.dirName ?? item.dir_name ?? item.title ?? item.name ?? '未命名歌单'),
      cover: String(item.coverPicUrl ?? item.cover_url_medium ?? item.cover_url ?? item.picurl ?? ''),
      count: Math.max(0, Number(item.songNum ?? item.song_num ?? item.song_count ?? item.total_song_num) || 0),
      lastSync: null,
      loaded: false,
    })
  }
  return [...result.values()]
}

async function playlistTracks(context: ProviderContext, user: PlatformProfile, playlist: PlatformPlaylist): Promise<LX.Music.MusicInfoOnline[]> {
  if (playlist.ownerId !== user.id) throw new Error('歌单不属于当前 QQ 音乐账号，请重新同步')
  const songs = new Map<string, LX.Music.MusicInfoOnline>()
  let offset = 0
  for (let page = 0; page < 200; page++) {
    const data = await cgi(context, 'music.srfDissInfo.DissInfo', 'CgiGetDiss', {
      disstid: Number(playlist.remoteId),
      dirid: 0,
      tag: true,
      song_begin: offset,
      song_num: 100,
      userinfo: true,
      orderlist: true,
      enc_host_uin: user.extra?.euin ?? '',
    })
    if ((data.code != null && Number(data.code) !== 0) || (data.subcode != null && Number(data.subcode) !== 0)) throw new Error('QQ 音乐无法读取此歌单')
    if (!Array.isArray(data.songlist)) throw new Error('QQ 音乐歌单响应格式无效')
    const owner = asRecord(data.creator ?? data.creator_info)
    const ownerId = String(owner.uin ?? data.hostuin ?? user.id).replace(/^o0*/, '')
    if (ownerId !== user.id) throw new Error('歌单不属于当前 QQ 音乐账号，请重新同步')
    const batch = asSongs(data.songlist)
    for (const song of batch) { const track = normalizeSong(song); if (track) songs.set(track.id, track) }
    offset += batch.length
    const total = Number(data.total_song_num ?? offset)
    if (offset >= total) return [...songs.values()]
    if (!batch.length) throw new Error('QQ 音乐歌单分页不完整')
  }
  throw new Error('QQ 音乐歌单超过同步上限')
}

async function available(context: ProviderContext, track: LX.Music.MusicInfoOnline): Promise<boolean> {
  const data = await cgi(context, 'music.pf_song_detail_svr', 'get_song_detail_yqq', { song_mid: track.meta.songId })
  const detail = asRecord(data.track_info)
  const file = asRecord(detail.file)
  return Number(detail.status ?? -1) === 0 && Boolean(detail.mid) && Boolean(file.media_mid)
}

async function musicQualitys(context: ProviderContext, track: LX.Music.MusicInfoOnline): Promise<PlatformQuality[]> {
  const data = await cgi(context, 'music.pf_song_detail_svr', 'get_song_detail_yqq', { song_mid: track.meta.songId })
  const file = asRecord(asRecord(data.track_info).file)
  const newer = Array.isArray(file.size_new) ? file.size_new.map(Number) : []
  const sizes: Record<string, unknown> = { '128k': file.size_128mp3, '192k': file.size_192aac, '320k': file.size_320mp3, flac: file.size_flac, flac24bit: file.size_hires, jyeffect: newer[1], sky: newer[2], jymaster: newer[0] }
  return formats.filter(format => Number(sizes[format.quality]) > 0).map(format => format.quality).reverse()
}
async function musicUrl(context: ProviderContext, track: LX.Music.MusicInfoOnline, quality: PlatformQuality) {
  if (quality === 'auto') {
    const available = await musicQualitys(context, track).catch(() => ['flac', '320k', '128k'] as PlatformQuality[])
    const candidates = formats.filter(format => available.includes(format.quality))
    if (!candidates.length) throw new Error('QQ 音乐未返回此歌曲的可用音质')
    return vkey(context, track, candidates)
  }
  const mappedQuality = quality === '64k' ? '128k' : quality === 'dolby' ? 'sky' : quality === 'ape' || quality === 'wav' ? 'flac' : quality
  const index = formats.findIndex(format => format.quality === mappedQuality)
  const candidates = formats.slice(index < 0 ? formats.findIndex(format => format.quality === 'flac') : index)
  // Preserve the requested level when entitled; fall back only when the platform rejects it.
  try { return await vkey(context, track, candidates.slice(0, 1)) } catch (error) {
    if (candidates.length <= 1) throw error
    return vkey(context, track, candidates.slice(1))
  }
}

async function like(context: ProviderContext, _user: PlatformProfile, track: LX.Music.MusicInfoOnline, liked: boolean): Promise<void> {
  let songId = track.source === 'tx' ? track.meta.id : undefined
  let songType = 0
  if (songId == null) {
    const data = await cgi(context, 'music.pf_song_detail_svr', 'get_song_detail_yqq', { song_mid: track.meta.songId })
    const info = asRecord(data.track_info)
    songId = Number(info.id)
    songType = Number(info.type ?? 0)
  }
  if (!Number.isFinite(songId)) throw new Error('QQ 音乐歌曲缺少数字 ID')
  const data = await cgi(context, 'music.musicasset.PlaylistDetailWrite', liked ? 'AddSonglist' : 'DelSonglist', {
    dirId: 201,
    tid: 0,
    bFmtUtf8: true,
    v_songInfo: [{ songId, songType }],
  })
  const retCode = Number(data.retCode ?? data.retcode ?? -1)
  if (retCode !== 0) throw new Error(`QQ 音乐红心操作失败 (${retCode})`)
}

export const qqProvider: PlatformProvider = {
  id: 'qq',
  source: 'tx',
  authenticated: cookies => Boolean(cookies.qqmusic_key || cookies.qm_keyst),
  name: 'QQ 音乐',
  loginUrl: loginUrl.toString(),
  cookieUrl: COOKIE_URL,
  domains: ['y.qq.com', 'qq.com', 'gtimg.cn'],
  profile,
  likes,
  playlists,
  playlistTracks,
  search,
  available,
  musicQualitys,
  musicUrl,
  like,
}

export default qqProvider
