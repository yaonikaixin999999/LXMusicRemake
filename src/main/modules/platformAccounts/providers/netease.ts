import type { PlatformProvider, ProviderContext } from './types'

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
  return {
    id: `wy_${song.id}`,
    source: 'wy',
    name: song.name ?? '',
    singer: (song.ar ?? song.artists ?? []).map((artist: any) => artist.name).join('、'),
    interval: `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`,
    meta: { songId: song.id, albumName: album.name ?? '', albumId: album.id, picUrl: album.picUrl ?? '', qualitys: [], _qualitys: {} },
  }
}

export const neteaseProvider: PlatformProvider = {
  id: 'netease',
  name: '网易云音乐',
  loginUrl: 'https://music.163.com/#/my/',
  domains: ['music.163.com', '163.com', '126.com', 'netease.com'],
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
  async like(context, profile, track, liked) {
    await request(context, 'radio/like', { alg: 'itembased', trackId: Number(track.meta.songId), like: liked, time: '3' })
  },
}
