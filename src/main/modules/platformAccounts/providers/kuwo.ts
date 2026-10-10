import { randomUUID } from 'node:crypto'
import type { PlatformQuality, PlatformStream } from '@common/platformPlayback'
import type { PlatformProvider, ProviderContext } from './types'

const notice = '酷我官网仅支持网页登录；官网收藏与歌单操作要求使用酷我客户端，暂不支持账号收藏、歌单同步或同时加红心。'
const secretCookie = 'Hm_Iuvt_cdb524f42f23cer9b268564v7y735ewrq2324'
// This is the current kuwo.cn web request header algorithm, independent of
// user password/session credentials and limited to official public routes.
function webSecret(value: string) {
  let digits = [...secretCookie].map(char => char.charCodeAt(0)).join('')
  const split = Math.floor(digits.length / 5)
  const multiplier = Number([1, 2, 3, 4, 5].map(index => digits.charAt(split * index)).join(''))
  const increment = Math.ceil(secretCookie.length / 2)
  const modulus = 2 ** 31 - 1
  const salt = Math.round(1e9 * Math.random()) % 1e8
  digits += salt
  while (digits.length > 10) digits = String(Number(digits.slice(0, 10)) + Number(digits.slice(10)))
  let seed = (multiplier * Number(digits) + increment) % modulus
  let encoded = ''
  for (const char of value) {
    encoded += (char.charCodeAt(0) ^ Math.floor(seed / modulus * 255)).toString(16).padStart(2, '0')
    seed = (multiplier * seed + increment) % modulus
  }
  return encoded + salt.toString(16).padStart(8, '0')
}
async function request(context: ProviderContext, endpoint: string, params: Record<string, unknown>) {
  const cookies = await context.cookies()
  const url = new URL(endpoint, 'https://www.kuwo.cn')
  for (const [key, value] of Object.entries({ ...params, httpsStatus: 1, reqId: randomUUID(), plat: 'web_www' })) url.searchParams.set(key, String(value))
  const response = await context.session.fetch(url.toString(), { headers: new Headers({ Referer: 'https://www.kuwo.cn/', Origin: 'https://www.kuwo.cn', Secret: webSecret(cookies[secretCookie] ?? '') }), signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`酷我音乐请求失败 (${response.status})`)
  const body = await response.json()
  if (Number(body.code) !== 200) throw new Error(String(body.message ?? body.msg ?? '酷我官网拒绝请求，请在官网登录后重试'))
  return body.data
}
const unsupportedSync = async(): Promise<never> => { throw new Error(notice) }
function toTrack(song: any): LX.Music.MusicInfo_online_common | null {
  const id = String(song.rid ?? song.musicrid ?? '').replace(/^MUSIC_/, '')
  if (!id || !song.name) return null
  const formats = String(song.formats ?? '').toLowerCase()
  const qualitys: LX.Music.MusicQualityType[] = [{ type: '128k', size: null }]
  if (formats.includes('mp3')) qualitys.push({ type: '320k', size: null })
  if (formats.includes('flac')) qualitys.push({ type: 'flac', size: null })
  const seconds = Math.max(0, Number(song.duration) || 0)
  return { id: `kw_${id}`, source: 'kw', name: String(song.name), singer: String(song.artist ?? ''), interval: String(song.songTimeMinutes ?? (seconds ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : '')) || null, meta: { songId: id, albumName: String(song.album ?? ''), albumId: String(song.albumid ?? ''), picUrl: String(song.pic ?? song.albumpic ?? ''), qualitys, _qualitys: Object.fromEntries(qualitys.map(item => [item.type, { size: null }])) } }
}
const ranks: Record<PlatformQuality, number> = { auto: 100, '64k': 0, '128k': 1, '192k': 2, dolby: 2, '320k': 3, flac: 4, ape: 4, wav: 4, flac24bit: 5, jyeffect: 6, sky: 7, jymaster: 8 }
export const kuwoProvider: PlatformProvider = {
  id: 'kuwo',
  source: 'kw',
  name: '酷我音乐',
  loginUrl: 'https://www.kuwo.cn/?login=open',
  cookieUrl: 'https://www.kuwo.cn/',
  domains: ['kuwo.cn', 'qq.com', 'gtimg.cn', 'weibo.com', 'sina.com.cn'],
  webOnly: true,
  syncSupported: false,
  notice,
  authenticated: () => false,
  profile: unsupportedSync,
  likes: unsupportedSync,
  playlists: unsupportedSync,
  playlistTracks: unsupportedSync,
  like: unsupportedSync,
  async search(context, track) {
    const body = await request(context, '/api/www/search/searchMusicBykeyWord', { key: `${track.name} ${track.singer}`, pn: 1, rn: 20 })
    if (!Array.isArray(body?.list)) throw new Error('酷我音乐未返回搜索结果')
    return body.list.map(toTrack).filter((song: LX.Music.MusicInfo_online_common | null): song is LX.Music.MusicInfo_online_common => song != null)
  },
  async available(context, track) {
    const data = await request(context, '/api/www/music/musicInfo', { mid: track.meta.songId })
    return Boolean(data?.rid && data?.name)
  },
  async musicQualitys(context, track) {
    const data = await request(context, '/api/www/music/musicInfo', { mid: track.meta.songId })
    return toTrack(data)?.meta.qualitys.map(item => item.type) ?? ['128k']
  },
  async musicUrl(context, track, quality): Promise<PlatformStream> {
    const info = await request(context, '/api/www/music/musicInfo', { mid: track.meta.songId })
    if (info?.isListenFee || info?.isPlayFree === false) throw new Error('酷我音乐当前账号没有此歌曲的完整播放权限')
    const levels = toTrack(info)?.meta.qualitys.map(item => item.type) ?? ['128k']
    const eligible = levels.filter(level => ranks[level] <= ranks[quality]).sort((a, b) => ranks[b] - ranks[a])
    if (!eligible.length) eligible.push('128k')
    for (const level of eligible) {
      const data = await request(context, '/api/v1/www/music/playUrl', { mid: track.meta.songId, type: 'music', br: level === 'flac' ? '2000kflac' : `${level}mp3` })
      if (Number(data?.audioFlags) > 0 || Number(data?.trialDuration) > 0) throw new Error('酷我音乐当前账号仅可试听此歌曲')
      if (typeof data?.url !== 'string' || !/^https?:\/\//.test(data.url)) continue
      const bitrate = Number(data.bitrate ?? data.br)
      const actual: LX.Quality = bitrate >= 1000000 ? 'flac' : bitrate >= 300000 ? '320k' : '128k'
      return { url: data.url, type: actual, quality: actual, ...(bitrate > 0 ? { bitrate } : {}) }
    }
    throw new Error('酷我音乐未返回完整歌曲播放地址')
  },
}
