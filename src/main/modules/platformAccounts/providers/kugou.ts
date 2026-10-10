import type { PlatformQuality, PlatformStream } from '@common/platformPlayback'
import type { PlatformProvider, ProviderContext } from './types'

const notice = '酷狗官网支持登录与歌曲播放；当前网页登录接口未开放收藏、创建歌单同步及红心写入。'
const ranks: Record<PlatformQuality, number> = { auto: 100, '64k': 0, '128k': 1, '192k': 2, dolby: 2, '320k': 3, flac: 4, ape: 4, wav: 4, flac24bit: 5, jyeffect: 6, sky: 7, jymaster: 8 }
const decode = (value: string) => {
  const unicode = value.replace(/%u([\da-f]{4})/gi, (_match, code: string) => String.fromCharCode(parseInt(code, 16)))
  try { return decodeURIComponent(unicode) } catch { return unicode }
}
const credentials = (cookies: Record<string, string>) => {
  // KuGoo is the official desktop website cookie. Never reuse Android
  // appid 1005 tokens against cloud endpoints with a different appid.
  const values = Object.fromEntries((cookies.KuGoo ?? '').split('&').map(part => {
    const index = part.indexOf('=')
    return index < 0 ? [part, ''] : [part.slice(0, index), decode(part.slice(index + 1))]
  }))
  return { id: values.KugooID ?? '', token: values.t ?? '', appid: values.a_id || '1014', nickname: values.NickName || values.UserName || '酷狗用户', avatar: values.Pic || '', ct: values.ct || String(Math.floor(Date.now() / 1000)) }
}
async function request(context: ProviderContext, endpoint: string, params: Record<string, unknown> = {}) {
  const url = new URL(endpoint)
  for (const [key, value] of Object.entries(params)) if (value != null) url.searchParams.set(key, String(value))
  const response = await context.session.fetch(url.toString(), { headers: new Headers({ Referer: 'https://www.kugou.com/', Origin: 'https://www.kugou.com' }), signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`酷狗音乐请求失败 (${response.status})`)
  return response
}
function toTrack(song: any): LX.Music.MusicInfo_kg | null {
  if (!song?.FileHash || !(song.OriSongName || song.SongName)) return null
  const formats: Array<{ type: LX.Quality, hash: string, size: string | null }> = []
  for (const [type, prefix] of [['128k', ''], ['320k', 'HQ'], ['flac', 'SQ'], ['flac24bit', 'Res']] as const) {
    const hash = song[`${prefix}FileHash`]
    if (hash && Number(song[`${prefix}FileSize`]) > 0) formats.push({ type, hash: String(hash), size: null })
  }
  const seconds = Math.max(0, Number(song.Duration) || 0)
  const songId = String(song.Audioid ?? song.ID ?? song.FileHash)
  return {
    id: `kg_${songId}_${song.FileHash}`,
    source: 'kg',
    name: decode(String(song.OriSongName ?? song.SongName)),
    singer: decode(String(song.SingerName ?? '')),
    interval: seconds ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : null,
    meta: {
      songId, hash: String(song.FileHash), albumName: String(song.AlbumName ?? ''), albumId: String(song.AlbumID ?? ''), albumAudioId: String(song.MixSongID ?? ''), picUrl: String(song.Image ?? song.img ?? '').replace('{size}', '400'), qualitys: formats, _qualitys: Object.fromEntries(formats.map(format => [format.type, { hash: format.hash, size: null }])),
    },
  }
}
const unsupportedSync = async(): Promise<never> => { throw new Error(notice) }

export const kugouProvider: PlatformProvider = {
  id: 'kugou',
  source: 'kg',
  name: '酷狗音乐',
  loginUrl: 'https://www.kugou.com/',
  cookieUrl: 'https://www.kugou.com/',
  domains: ['kugou.com', 'kugou.net', 'qq.com', 'gtimg.cn'],
  syncSupported: false,
  notice,
  authenticated: cookies => { const user = credentials(cookies); return Boolean(/^\d+$/.test(user.id) && user.token && user.appid === '1014') },
  async profile(context) {
    const user = credentials(await context.cookies())
    if (!/^\d+$/.test(user.id) || !user.token || user.appid !== '1014') throw new Error('请在酷狗音乐官网完成网页登录')
    const response = await request(context, 'https://login-user.kugou.com/v1/autologin', { a_id: user.appid, userid: user.id, t: user.token, ct: user.ct, domain: 'kugou.com' })
    const text = await response.text()
    // The official endpoint returns a script. Read only its numeric result;
    // executing returned JavaScript would expose the main process.
    const result = /\b(?:var\s+)?error_code\s*=\s*(\d+)\s*;?/.exec(text)
    if (!result || Number(result[1]) !== 0) throw new Error(result ? `酷狗音乐登录验证失败 (${result[1]})，请重新登录` : '酷狗官网未返回可验证的账号状态，请在登录窗口继续使用官网')
    return { id: user.id, nickname: user.nickname, avatar: /^https?:\/\//.test(user.avatar) ? user.avatar : '' }
  },
  likes: unsupportedSync,
  playlists: unsupportedSync,
  playlistTracks: unsupportedSync,
  like: unsupportedSync,
  async search(context, track) {
    const response = await request(context, 'https://songsearch.kugou.com/song_search_v2', { platform: 'WebFilter', iscorrection: 1, keyword: `${track.name} ${track.singer}`, pagesize: 20, page: 1 })
    const body = await response.json()
    if (body.error_code !== 0 || !Array.isArray(body.data?.lists)) throw new Error('酷狗音乐未返回搜索结果')
    return body.data.lists.flatMap((song: any) => [song, ...(Array.isArray(song.Grp) ? song.Grp : [])]).map(toTrack).filter((song: LX.Music.MusicInfo_kg | null): song is LX.Music.MusicInfo_kg => song != null)
  },
  async available(_context, track) { return Boolean((track.meta as LX.Music.MusicInfoMeta_kg).hash) },
  async musicQualitys(_context, track) { return (track.meta.qualitys ?? []).map(item => item.type) },
  async musicUrl(context, track, quality): Promise<PlatformStream> {
    const meta = track.meta as LX.Music.MusicInfoMeta_kg
    const formats = (meta.qualitys ?? []).filter(item => item.hash && ranks[item.type] <= ranks[quality]).sort((a, b) => ranks[b.type] - ranks[a.type])
    if (!formats.length && meta.hash) formats.push({ type: '128k', hash: meta.hash, size: null })
    const user = credentials(await context.cookies())
    let denied = '酷狗音乐未返回可播放音频'
    for (const format of formats) {
      const response = await request(context, 'https://www.kugou.com/yy/index.php', { r: 'play/getdata', hash: format.hash, album_id: meta.albumId ?? '', mid: '1014', ...(user.appid === '1014' && user.token ? { userid: user.id, token: user.token } : {}) })
      const body = await response.json()
      if (body.status !== 1) { denied = String(body.err_msg ?? body.error_msg ?? `酷狗官网拒绝播放 (${body.err_code ?? body.error_code ?? -1})`); continue }
      const data = body.data ?? {}
      if (data.is_free_part === true || Number(data.is_free_part) > 0 || Number(data.free_part?.end) > 0) { denied = '酷狗音乐当前账号仅可试听此歌曲'; continue }
      const url = data.play_url ?? data.play_backup_url
      if (typeof url !== 'string' || !/^https?:\/\//.test(url)) continue
      const bitrate = Number(data.bitrate ?? data.bitRate)
      const extension = String(data.extName ?? data.extname ?? new URL(url).pathname.split('.').at(-1)).toLowerCase()
      const actual: LX.Quality = extension === 'flac'
        ? format.type === 'flac24bit' && Number(data.bitDepth ?? 24) >= 24 ? 'flac24bit' : 'flac'
        : bitrate ? bitrate >= 300000 ? '320k' : '128k' : format.type
      return { url, type: actual, quality: actual, ...(bitrate > 0 ? { bitrate } : {}) }
    }
    throw new Error(denied)
  },
}
