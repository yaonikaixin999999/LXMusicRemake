import type { PlatformProvider, ProviderContext } from './types'
import type { PlatformQuality } from '@common/platformPlayback'
import type { PlatformPlaylist, PlatformProfile } from '@common/platformAccounts'

// Use the maintained SDK's protocol encryption with Electron's isolated cookie jar.
import encryption from 'NeteaseCloudMusicApi/util/crypto'

const request = async(context: ProviderContext, path: string, data: Record<string, unknown> = {}): Promise<any> => {
  const cookies = await context.cookies()
  const response = await context.session.fetch(`https://music.163.com/weapi/${path}?csrf_token=${encodeURIComponent(cookies.__csrf ?? '')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://music.163.com/' },
    body: new URLSearchParams(encryption.weapi({ ...data, csrf_token: cookies.__csrf ?? '' })).toString(),
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`网易云请求失败 (${response.status})`)
  const body = await response.json()
  if (body.code !== 200) throw new Error(body.code === 301 || body.code === 302 ? '登录已失效，请重新登录' : `网易云接口返回错误 (${String(body.code)})`)
  return body
}

const toTrack = (song: any): LX.Music.MusicInfoOnline => {
  const duration = Math.round(Number(song.dt ?? song.duration ?? 0) / 1000)
  const album = song.al ?? song.album ?? {}
  // A liked song does not include bitrate fields in the playlist/detail
  // response.  LinkLine's source fallback only considers candidates that
  // advertise the requested quality, so expose the platform's standard
  // 128k stream as the baseline quality.  The playback source still checks
  // the actual availability before returning a URL.
  const qualitys: LX.Music.MusicQualityType[] = [{ type: '128k', size: null }]
  return {
    id: `wy_${song.id}`,
    source: 'wy',
    name: song.name ?? '',
    singer: (song.ar ?? song.artists ?? []).map((artist: any) => artist.name).join('、'),
    interval: `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`,
    meta: { songId: song.id, albumName: album.name ?? '', albumId: album.id, picUrl: album.picUrl ?? '', qualitys, _qualitys: { '128k': { size: null } } },
  }
}

const levels: Partial<Record<PlatformQuality, string>> = { '128k': 'standard', '192k': 'higher', '320k': 'exhigh', flac: 'lossless', flac24bit: 'hires', jyeffect: 'jyeffect', sky: 'sky', jymaster: 'jymaster', auto: 'jymaster' }
const qualitiesByLevel = Object.fromEntries(Object.entries(levels).filter(([key]) => key !== 'auto').map(([quality, level]) => [level, quality])) as Record<string, PlatformQuality>

async function playlists(context: ProviderContext, profile: PlatformProfile): Promise<PlatformPlaylist[]> {
  const result = new Map<string, PlatformPlaylist>()
  let offset = 0
  for (let page = 0; page < 200; page++) {
    const body = await request(context, 'user/playlist', { uid: profile.id, limit: 100, offset, includeVideo: false })
    if (!Array.isArray(body.playlist)) throw new Error('网易云未返回用户歌单列表')
    for (const item of body.playlist) {
      if (String(item?.creator?.userId ?? '') !== profile.id || Number(item.specialType) === 5) continue
      const remoteId = String(item.id ?? '')
      if (!/^\d+$/.test(remoteId) || Number(remoteId) <= 0) continue
      result.set(remoteId, {
        id: `netease:${remoteId}`,
        platform: 'netease',
        ownerId: profile.id,
        remoteId,
        name: String(item.name ?? '未命名歌单'),
        cover: String(item.coverImgUrl ?? ''),
        count: Math.max(0, Number(item.trackCount) || 0),
        lastSync: null,
        loaded: false,
      })
    }
    offset += body.playlist.length
    if (!body.more) return [...result.values()]
    if (!body.playlist.length) throw new Error('网易云用户歌单分页不完整')
  }
  throw new Error('网易云用户歌单超过同步上限')
}

async function playlistTracks(context: ProviderContext, profile: PlatformProfile, playlist: PlatformPlaylist): Promise<LX.Music.MusicInfoOnline[]> {
  const body = await request(context, 'v6/playlist/detail', { id: playlist.remoteId, n: 100000, s: 0 })
  const detail = body.playlist
  if (!detail || String(detail.creator?.userId ?? '') !== profile.id) throw new Error('歌单不属于当前网易云账号，请重新同步')
  if (!Array.isArray(detail.trackIds)) throw new Error('网易云未返回完整歌单曲目')
  const ids: number[] = detail.trackIds.map((item: any) => Number(item.id)).filter((id: number) => Number.isSafeInteger(id) && id > 0)
  if (ids.length !== detail.trackIds.length || (Number(detail.trackCount) > ids.length)) throw new Error('网易云歌单曲目响应不完整')
  const songs = new Map<number, LX.Music.MusicInfoOnline>()
  for (let offset = 0; offset < ids.length; offset += 500) {
    const batch = ids.slice(offset, offset + 500)
    const details = await request(context, 'v3/song/detail', { c: JSON.stringify(batch.map(id => ({ id }))) })
    if (!Array.isArray(details.songs)) throw new Error('无法读取网易云歌单歌曲详情')
    for (const song of details.songs) if (batch.includes(Number(song.id))) songs.set(Number(song.id), toTrack(song))
  }
  return ids.flatMap(id => { const song = songs.get(id); return song ? [song] : [] })
}

export const neteaseProvider: PlatformProvider = {
  id: 'netease',
  source: 'wy',
  authenticated: cookies => Boolean(cookies.MUSIC_U),
  name: '网易云音乐',
  loginUrl: 'https://music.163.com/#/my/',
  domains: ['music.163.com', '163.com', '126.com', 'netease.com'],
  playlists,
  playlistTracks,
  async profile(context) {
    if (!(await context.cookies()).MUSIC_U) throw new Error('请先登录网易云音乐')
    const body = await request(context, 'nuser/account/get')
    if (!body.profile?.userId) throw new Error('登录已失效，请重新登录')
    return { id: String(body.profile.userId), nickname: body.profile.nickname ?? '网易云用户', avatar: body.profile.avatarUrl ?? '' }
  },
  async likes(context, profile) {
    const body = await request(context, 'song/like/get', { uid: profile.id })
    if (!Array.isArray(body.ids)) throw new Error('网易云未返回红心列表')
    const tracks: LX.Music.MusicInfoOnline[] = []
    for (let offset = 0; offset < body.ids.length; offset += 500) {
      const ids = body.ids.slice(offset, offset + 500)
      const details = await request(context, 'v3/song/detail', { c: JSON.stringify(ids.map((id: number) => ({ id }))) })
      if (!Array.isArray(details.songs)) throw new Error('无法读取网易云歌曲详情')
      tracks.push(...details.songs.map(toTrack))
    }
    return tracks
  },
  async search(context, track) {
    const body = await request(context, 'cloudsearch/pc', { s: `${track.name} ${track.singer}`, type: 1, limit: 30, offset: 0, total: true })
    return (body.result?.songs ?? []).map(toTrack)
  },
  async available(context, track) {
    const body = await request(context, 'v3/song/detail', { c: JSON.stringify([{ id: Number(track.meta.songId) }]) })
    const song = body.songs?.find((item: any) => String(item.id) === String(track.meta.songId))
    const privilege = body.privileges?.find((item: any) => String(item.id) === String(track.meta.songId))
    if (!song || !privilege) return false
    // Paid tracks can be liked; negative status and zero rights indicate withdrawn music.
    return privilege.st >= 0 && (privilege.maxbr > 0 || privilege.pl > 0 || privilege.dl > 0 || privilege.fee === 1 || privilege.fee === 4)
  },
  async musicQualitys(context, track) {
    const body = await request(context, 'v3/song/detail', { c: JSON.stringify([{ id: Number(track.meta.songId) }]) })
    const song = body.songs?.find((item: any) => String(item.id) === String(track.meta.songId))
    const privilege = body.privileges?.find((item: any) => String(item.id) === String(track.meta.songId))
    const qualitys: PlatformQuality[] = ['128k']
    if (song?.m || Number(privilege?.maxbr) >= 192000) qualitys.push('192k')
    if (song?.h || Number(privilege?.maxbr) >= 320000) qualitys.push('320k')
    if (song?.sq || Number(privilege?.maxbr) >= 999000) qualitys.push('flac')
    if (song?.hr || privilege?.maxBrLevel === 'hires') qualitys.push('flac24bit')
    if (song?.je || privilege?.maxBrLevel === 'jyeffect') qualitys.push('jyeffect')
    if (song?.sky || privilege?.maxBrLevel === 'sky') qualitys.push('sky')
    if (song?.jm || privilege?.maxBrLevel === 'jymaster') qualitys.push('jymaster')
    return qualitys
  },
  async musicUrl(context, track, quality) {
    const songId = Number(track.meta.songId)
    if (!Number.isSafeInteger(songId) || songId <= 0) throw new Error('网易云歌曲缺少有效 ID')
    const body = await request(context, 'song/enhance/player/url/v1', {
      ids: JSON.stringify([songId]),
      level: quality === '64k' ? 'standard' : quality === 'dolby' ? 'sky' : levels[quality] ?? 'lossless',
      encodeType: 'flac',
      ...(quality === 'sky' || quality === 'dolby' ? { immerseType: 'c51' } : {}),
    })
    const item = Array.isArray(body.data) ? body.data.find((entry: any) => String(entry.id) === String(songId)) ?? body.data[0] : null
    const url = typeof item?.url === 'string' ? item.url : ''
    if (!url) throw new Error('网易云没有返回可播放音频，可能没有版权或登录已失效')
    if (item.freeTrialInfo) throw new Error('该歌曲仅提供试听，请检查网易云会员或购买权限')
    const type = Number(item.br) >= 1_999_000 ? 'flac24bit' : Number(item.br) >= 999_000 ? 'flac' : Number(item.br) >= 320_000 ? '320k' : Number(item.br) >= 192_000 ? '192k' : '128k'
    return { url, type, quality: qualitiesByLevel[item.level] ?? type, expires: Number(item.expi ?? 1200), bitrate: Number(item.br ?? 0) }
  },
  async like(context, profile, track, liked) {
    await request(context, 'radio/like', { alg: 'itembased', trackId: Number(track.meta.songId), like: liked, time: '3' })
  },
}
