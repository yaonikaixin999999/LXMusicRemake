import type { PlatformPlaylist, PlatformProfile } from '@common/platformAccounts'
import { legacyQuality, type PlatformQuality, type PlatformStream } from '@common/platformPlayback'
import type { PlatformProvider, ProviderContext } from './types'
import { closeBilibiliStreams, createBilibiliStream, isBilibiliAudioUrl } from './bilibiliStream'

const API = 'https://api.bilibili.com'
const WEB = 'https://www.bilibili.com/'
type Json = Record<string, any>
const object = (value: unknown): Json => value != null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const numericId = (value: unknown): string => /^\d+$/.test(String(value)) && Number(value) > 0 ? String(value) : ''
const safeBvid = (value: unknown): string => /^BV[\da-z]{10}$/i.test(String(value)) ? String(value) : ''
const text = (value: unknown): string => String(value ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
const httpsImage = (value: unknown): string => {
  const url = String(value ?? '')
  return url.startsWith('//') ? `https:${url}` : url.startsWith('http://') ? `https://${url.slice(7)}` : /^https:\/\//.test(url) ? url : ''
}

async function request(context: ProviderContext, route: string, params: Record<string, string | number> = {}, post = false): Promise<Json> {
  const url = new URL(route, API)
  const encoded = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))
  const headers = new Headers({ Referer: WEB, Origin: 'https://www.bilibili.com', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' })
  const cookies = await context.cookies()
  const cookie = Object.entries(cookies).filter(([key, value]) => key && value).map(([key, value]) => `${key}=${value}`).join('; ')
  if (cookie) headers.set('Cookie', cookie)
  if (post) headers.set('Content-Type', 'application/x-www-form-urlencoded')
  else url.search = encoded.toString()
  const response = await context.session.fetch(url.toString(), { method: post ? 'POST' : 'GET', headers, body: post ? encoded.toString() : undefined, signal: AbortSignal.timeout(20_000), credentials: 'include' })
  if (!response.ok) throw new Error(`哔哩哔哩请求失败 (${response.status})`)
  const result = object(await response.json())
  if (Number(result.code) !== 0) {
    if (Number(result.code) === -101 || Number(result.code) === -111) throw new Error('哔哩哔哩登录状态已失效，请重新登录')
    if (Number(result.code) === -352 || Number(result.code) === -412) throw new Error('哔哩哔哩要求安全验证，请打开平台登录窗口完成验证后重试')
    throw new Error(`哔哩哔哩：${text(result.message ?? result.msg) || '平台没有返回可用内容'} (${result.code ?? -1})`)
  }
  return object(result.data)
}

const interval = (value: unknown): string | null => {
  if (typeof value === 'string' && /^\d+:\d{2}(?::\d{2})?$/.test(value)) return value
  const seconds = Math.floor(Number(value))
  if (!Number.isFinite(seconds) || seconds < 0) return null
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function trackFromVideo(item: Json): LX.Music.MusicInfoOnline | null {
  const bvid = safeBvid(item.bvid ?? item.bv_id)
  const aid = numericId(item.aid ?? item.id)
  const name = text(item.title)
  if (!bvid || !aid || !name || name === '已失效视频' || (item.type != null && item.type !== 'video' && Number(item.type) !== 2)) return null
  const upper = object(item.upper ?? item.owner)
  return {
    id: `bi_${bvid}`,
    source: 'bi',
    name,
    singer: text(upper.name ?? item.author) || '未知 UP 主',
    interval: interval(item.duration),
    meta: {
      songId: bvid,
      albumName: '哔哩哔哩视频',
      albumId: aid,
      picUrl: httpsImage(item.cover ?? item.pic),
      qualitys: [],
      _qualitys: {},
    },
  }
}

interface Folder { id: string, name: string, cover: string, count: number, isDefault: boolean }
async function folders(context: ProviderContext, profile: PlatformProfile): Promise<Folder[]> {
  if (!numericId(profile.id)) throw new Error('无效的哔哩哔哩账号')
  const result = new Map<string, Folder>()
  let seen = 0
  for (let page = 1; page <= 500; page++) {
    const body = await request(context, '/x/v3/fav/folder/created/list', { up_mid: profile.id, pn: page, ps: 20, jsonp: 'jsonp' })
    if (body.list == null && Number(body.count) === 0 && !body.has_more) return [...result.values()]
    if (!Array.isArray(body.list)) throw new Error('哔哩哔哩未返回收藏夹列表，请重新登录后重试')
    let added = 0
    for (const entry of body.list) {
      const item = object(entry)
      const id = numericId(item.id)
      if (!id || (item.mid != null && String(item.mid) !== profile.id)) continue
      if (!result.has(id)) added++
      result.set(id, { id, name: text(item.title) || '未命名收藏夹', cover: httpsImage(item.cover), count: Math.max(0, Number(item.media_count) || 0), isDefault: Boolean(item.is_default ?? item.default) || text(item.title) === '默认收藏夹' })
    }
    seen += body.list.length
    if (!body.has_more && !(Number(body.count) > seen)) return [...result.values()]
    if (!body.list.length || !added) throw new Error('哔哩哔哩收藏夹分页不完整，请稍后重新同步')
  }
  throw new Error('哔哩哔哩收藏夹超过同步上限')
}
// The official created-folder list places the account's default folder first.
const findDefaultFolder = (list: Folder[]): Folder | undefined => list.find(item => item.isDefault) ?? list[0]
const asPlaylist = (folder: Folder, profile: PlatformProfile): PlatformPlaylist => ({ id: `bilibili:${folder.id}`, platform: 'bilibili', ownerId: profile.id, remoteId: folder.id, name: folder.name, cover: folder.cover, count: folder.count, lastSync: null, loaded: false })

async function playlistTracks(context: ProviderContext, profile: PlatformProfile, playlist: PlatformPlaylist): Promise<LX.Music.MusicInfoOnline[]> {
  if (playlist.ownerId !== profile.id || !numericId(playlist.remoteId)) throw new Error('收藏夹不属于当前哔哩哔哩账号')
  const result = new Map<string, LX.Music.MusicInfoOnline>()
  let seen = 0
  for (let page = 1; page <= 5000; page++) {
    const body = await request(context, '/x/v3/fav/resource/list', { media_id: playlist.remoteId, pn: page, ps: 20, keyword: '', order: 'mtime', type: 0, tid: 0, platform: 'web', web_location: '333.1387' })
    const header = object(body.info)
    const owner = object(header.upper).mid ?? header.mid
    if (owner == null || String(owner) !== profile.id || String(header.id) !== playlist.remoteId) throw new Error('收藏夹不属于当前哔哩哔哩账号，请重新同步')
    const entries = body.medias == null && Number(header.media_count) === 0 ? [] : body.medias
    if (!Array.isArray(entries)) throw new Error('哔哩哔哩未返回收藏夹内容')
    for (const item of entries) {
      const track = trackFromVideo(object(item))
      if (track) result.set(track.id, track)
    }
    seen += entries.length
    if (!body.has_more && !(Number(header.media_count) > seen)) return [...result.values()]
    if (!entries.length) throw new Error('哔哩哔哩收藏夹内容分页不完整，请稍后重新同步')
  }
  throw new Error('哔哩哔哩收藏夹内容超过同步上限')
}

interface AudioStream { url: string, backupUrls: string[], quality: PlatformQuality, bitrate: number, rank: number }
const qualityById: Record<string, { quality: PlatformQuality, rank: number }> = { 30216: { quality: '64k', rank: 1 }, 30232: { quality: '128k', rank: 2 }, 30280: { quality: '192k', rank: 3 }, 30250: { quality: 'dolby', rank: 5 }, 30251: { quality: 'flac24bit', rank: 6 } }
const qualityRank: Partial<Record<PlatformQuality, number>> = { '64k': 1, '128k': 2, '192k': 3, '320k': 4, dolby: 5, flac: 6, flac24bit: 6, wav: 6, ape: 6, sky: 5, jyeffect: 5, jymaster: 6 }
async function audioStreams(context: ProviderContext, track: LX.Music.MusicInfoOnline): Promise<{ bvid: string, aid: string, streams: AudioStream[] }> {
  if (track.source !== 'bi') throw new Error('此记录不是哔哩哔哩内容')
  const bvid = safeBvid(track.meta.songId)
  if (!bvid) throw new Error('哔哩哔哩视频缺少播放标识')
  const view = await request(context, '/x/web-interface/view', { bvid })
  const aid = numericId(view.aid)
  const cid = numericId(view.cid ?? view.pages?.[0]?.cid)
  if (!aid || !cid || Number(view.state) < 0 || safeBvid(view.bvid) !== bvid) throw new Error('哔哩哔哩视频已失效或不可播放')
  const body = await request(context, '/x/player/playurl', { bvid, cid, fnval: 4048, fnver: 0, fourk: 1 })
  if (body.is_preview || body.isPreview || body.is_try_watch) throw new Error('哔哩哔哩仅提供试看，请在平台完成授权后再播放')
  const dash = object(body.dash)
  const entries = [
    ...(Array.isArray(dash.audio) ? dash.audio : []),
    ...(object(dash.flac).audio ? [dash.flac.audio] : []),
    ...(Array.isArray(object(dash.dolby).audio) ? dash.dolby.audio : object(dash.dolby).audio ? [dash.dolby.audio] : []),
  ]
  const streams: AudioStream[] = []
  for (const entry of entries) {
    const item = object(entry)
    const quality = qualityById[String(item.id)]
    const candidates = [item.baseUrl, item.base_url, ...(Array.isArray(item.backupUrl ?? item.backup_url) ? item.backupUrl ?? item.backup_url : [])]
    const urls = [...new Set(candidates.filter((value): value is string => typeof value === 'string' && isBilibiliAudioUrl(value)))]
    if (quality && urls.length) streams.push({ url: urls[0], backupUrls: urls.slice(1), ...quality, bitrate: Math.max(0, Number(item.bandwidth) || 0) })
  }
  if (!streams.length) throw new Error('哔哩哔哩未返回可用音轨，可能无播放权限或视频已失效')
  return { bvid, aid, streams: streams.sort((a, b) => a.rank - b.rank || a.bitrate - b.bitrate) }
}

export const bilibiliProvider: PlatformProvider = {
  id: 'bilibili',
  logout: closeBilibiliStreams,
  name: '哔哩哔哩',
  source: 'bi',
  loginUrl: 'https://passport.bilibili.com/login',
  cookieUrl: WEB,
  domains: ['bilibili.com', 'biliapi.net', 'bilivideo.com', 'bilivideo.cn', 'hdslb.com'],
  authenticated: cookies => Boolean(cookies.SESSDATA),
  async profile(context) {
    const cookies = await context.cookies()
    if (!cookies.SESSDATA) throw new Error('请先登录哔哩哔哩')
    const body = await request(context, '/x/web-interface/nav')
    const id = numericId(body.mid)
    if (body.isLogin !== true || !id || (cookies.DedeUserID && cookies.DedeUserID !== id)) throw new Error('哔哩哔哩登录状态已失效，请重新登录')
    return { id, nickname: text(body.uname) || '哔哩哔哩用户', avatar: httpsImage(body.face) }
  },
  async likes(context, profile) {
    const selected = findDefaultFolder(await folders(context, profile))
    return selected ? playlistTracks(context, profile, asPlaylist(selected, profile)) : []
  },
  async playlists(context, profile) {
    const list = await folders(context, profile)
    const selected = findDefaultFolder(list)
    return list.filter(item => item.id !== selected?.id).map(item => asPlaylist(item, profile))
  },
  playlistTracks,
  async search(context, track) {
    const body = await request(context, '/x/web-interface/search/type', { search_type: 'video', keyword: `${track.name} ${track.singer}`.trim(), page: 1, page_size: 30, order: 'totalrank', duration: 0 })
    if (!Array.isArray(body.result)) throw new Error('哔哩哔哩未返回搜索结果')
    return body.result.map((entry: unknown) => trackFromVideo(object(entry))).filter((item: LX.Music.MusicInfoOnline | null): item is LX.Music.MusicInfoOnline => Boolean(item))
  },
  async available(context, track) {
    try { await audioStreams(context, track); return true } catch (error) {
      if (error instanceof Error && /已失效或不可播放|未返回可用音轨|仅提供试看|\(-404\)|\(62002\)|\(62012\)/.test(error.message)) return false
      throw error
    }
  },
  async musicQualitys(context, track) {
    const result = await audioStreams(context, track)
    return [...new Set(result.streams.map(item => item.quality))]
  },
  async musicUrl(context, track, quality): Promise<PlatformStream> {
    const resolvedCookies = await context.cookies()
    const { bvid, streams } = await audioStreams(context, track)
    const exact = streams.filter(item => item.quality === quality)
    const eligible = quality === 'auto' ? streams : exact.length ? exact : streams.filter(item => item.rank <= (qualityRank[quality] ?? 6))
    const selected = eligible[eligible.length - 1]
    if (!selected) throw new Error('哔哩哔哩未提供所选音质，请选择其他档位')
    const deadline = Number(new URL(selected.url).searchParams.get('deadline'))
    const expires = Math.min(deadline > Date.now() / 1000 ? deadline * 1000 : Infinity, Date.now() + 60 * 60 * 1000)
    const url = await createBilibiliStream(context, selected.url, bvid, expires, selected.backupUrls, resolvedCookies)
    return { url, type: legacyQuality(selected.quality), quality: selected.quality, bitrate: selected.bitrate, expires }
  },
  async like(context, profile, track, liked) {
    if (track.source !== 'bi' || !safeBvid(track.meta.songId)) throw new Error('此记录不是哔哩哔哩内容')
    const cookies = await context.cookies()
    if (!cookies.SESSDATA || !cookies.bili_jct || (cookies.DedeUserID && cookies.DedeUserID !== profile.id)) throw new Error('哔哩哔哩登录状态已失效，请重新登录')
    const folder = findDefaultFolder(await folders(context, profile))
    if (!folder) throw new Error('哔哩哔哩未找到默认收藏夹，请在平台创建收藏后重试')
    const view = await request(context, '/x/web-interface/view', { bvid: String(track.meta.songId) })
    const aid = numericId(view.aid)
    if (!aid || safeBvid(view.bvid) !== String(track.meta.songId)) throw new Error('哔哩哔哩视频标识无效')
    await request(context, '/x/v3/fav/resource/deal', { rid: aid, type: 2, add_media_ids: liked ? folder.id : '', del_media_ids: liked ? '' : folder.id, csrf: cookies.bili_jct }, true)
  },
}
