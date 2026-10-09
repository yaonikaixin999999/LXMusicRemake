import type { PlatformProfile } from '@common/platformAccounts'
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
  file?: { media_mid?: string, size_128mp3?: number, size_320mp3?: number, size_flac?: number }
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
  return {
    id: `tx_${mid}`,
    name,
    singer: song.singer?.map(item => item.name ?? '').filter(Boolean).join(' / ') ?? '',
    source: 'tx',
    interval: formatInterval(song.interval),
    meta: {
      songId: mid,
      albumName: album.name ?? '',
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

async function available(context: ProviderContext, track: LX.Music.MusicInfoOnline): Promise<boolean> {
  const data = await cgi(context, 'music.pf_song_detail_svr', 'get_song_detail_yqq', { song_mid: track.meta.songId })
  const detail = asRecord(data.track_info)
  const file = asRecord(detail.file)
  return Number(detail.status ?? -1) === 0 && Boolean(detail.mid) && Boolean(file.media_mid)
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
  name: 'QQ 音乐',
  loginUrl: loginUrl.toString(),
  cookieUrl: COOKIE_URL,
  domains: ['y.qq.com', 'qq.com', 'gtimg.cn'],
  profile,
  likes,
  search,
  available,
  like,
}

export default qqProvider
