import type { PlatformPlaylist, PlatformProfile } from '@common/platformAccounts'
import type { PlatformQuality, PlatformStream } from '@common/platformPlayback'
import { legacyQuality } from '@common/platformPlayback'
import { chooseMatch } from '@common/platformMatching'
import type { PlatformProvider, ProviderContext } from './types'

// The current music.migu.cn/v5 web SDK uses these same API paths and
// session headers. The stream endpoint returns the SDK's binary envelope.
const API = 'https://app.c.nf.migu.cn'
const ENVELOPE_KEY = Buffer.from('Jk8qzuePiJ1qE3mDYhLQ3T73DtDoAhLP')
const toneFlags: Partial<Record<PlatformQuality, string>> = { '128k': 'PQ', '320k': 'HQ', flac: 'SQ', flac24bit: 'ZQ', sky: 'Z3D' }
interface MiguMeta extends LX.Music.MusicInfoMeta_mg { upstreamSongId?: string, contentId?: string, resourceType?: string, platformQualitys?: PlatformQuality[], formatResourceTypes?: Partial<Record<PlatformQuality, string>> }
const qualityRank: Record<PlatformQuality, number> = { auto: 100, '64k': 0, '128k': 1, '192k': 2, dolby: 2, '320k': 3, flac: 4, ape: 4, wav: 4, flac24bit: 5, jyeffect: 6, sky: 7, jymaster: 8 }
const record = (value: any): Record<string, any> => value && typeof value === 'object' ? value : {}
const image = (value: unknown) => typeof value === 'string' && value ? value.startsWith('http') ? value : `https://d.musicapp.migu.cn${value}` : ''

async function request(context: ProviderContext, endpoint: string, params: Record<string, unknown> = {}, options: { post?: boolean, encrypted?: boolean } = {}): Promise<any> {
  const cookies = await context.cookies()
  const url = new URL(endpoint.startsWith('https://') ? endpoint : `${API}${endpoint}`)
  if (!options.post) for (const [key, value] of Object.entries(params)) if (value != null) url.searchParams.set(key, String(value))
  const headers = new Headers({
    Referer: 'https://music.migu.cn/',
    Origin: 'https://music.migu.cn',
    channel: '014X031',
    subchannel: '014X031',
    appId: 'h5',
    platform: 'H5',
    ua: 'Android_migu',
    version: '6.8.8',
    IMEI: 'h5page',
    IMSI: 'h5page',
    uid: cookies.mg_auth_uid ?? '',
    pacmtoken: cookies.mg_auth_pacmtoken ?? '',
    timestamp: String(Date.now()),
    'Content-Type': 'application/json;charset=UTF-8',
  })
  if (options.encrypted) { headers.set('birth', 'h5page'); headers.set('signature', '1') }
  const response = await context.session.fetch(url.toString(), {
    method: options.post ? 'POST' : 'GET',
    headers,
    ...(options.post ? { body: JSON.stringify(params) } : {}),
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`咪咕音乐请求失败 (${response.status})`)
  let body: any
  if (response.headers.get('signature') === '1') {
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length < 4 || bytes[0] !== 171 || bytes[1] !== 205 || bytes[2] !== 1) throw new Error('咪咕音乐音频响应格式无效')
    const decoded = Buffer.alloc(bytes.length - 4)
    for (let index = 0; index < decoded.length; index++) decoded[index] = bytes[index + 4] + bytes[3] - ENVELOPE_KEY[index % ENVELOPE_KEY.length]
    body = JSON.parse(decoded.toString('utf8'))
  } else body = await response.json()
  if (!Array.isArray(body) && body.code !== '000000') throw new Error(['290001', '290002', '290003'].includes(String(body.code)) ? '咪咕音乐登录已失效，请重新登录' : String(body.info ?? `咪咕音乐接口返回错误 (${String(body.code)})`))
  return body
}

function toTrack(value: any): (LX.Music.MusicInfo_mg & { meta: MiguMeta }) | null {
  const song = record(value)
  const upstreamSongId = String(song.songId ?? '')
  const songId = String(song.copyrightId ?? song.songId ?? '')
  const name = String(song.songName ?? song.name ?? '')
  if (!songId || !name) return null
  const formats: any[] = Array.isArray(song.audioFormats) ? song.audioFormats : []
  const platformQualitys: PlatformQuality[] = Object.entries(toneFlags).filter(([, flag]) => formats.some(format => format.formatType === flag)).map(([quality]) => quality as PlatformQuality)
  const qualitys = platformQualitys.filter((quality): quality is LX.Quality => quality !== 'sky').map(type => ({ type, size: null }))
  const seconds = Number(song.duration ?? 0)
  const meta: MiguMeta = {
    songId,
    upstreamSongId,
    copyrightId: String(song.copyrightId ?? ''),
    contentId: String(song.contentId ?? ''),
    resourceType: String(song.resourceType ?? '2'),
    platformQualitys,
    formatResourceTypes: Object.fromEntries(Object.entries(toneFlags).map(([quality, flag]) => [quality, String(formats.find(format => format.formatType === flag)?.resourceType ?? song.resourceType ?? '2')])),
    albumName: String(song.album ?? ''),
    albumId: String(song.albumId ?? ''),
    picUrl: image(song.img3 ?? song.img2 ?? song.img1 ?? song.imgItems?.[0]?.img),
    qualitys,
    _qualitys: Object.fromEntries(qualitys.map(item => [item.type, { size: null }])),
    lrcUrl: String(song.lrcUrl ?? song.ext?.lrcUrl ?? ''),
    mrcUrl: String(song.mrcUrl ?? song.ext?.mrcUrl ?? ''),
    trcUrl: String(song.trcUrl ?? song.ext?.trcUrl ?? ''),
  }
  return { id: `mg_${songId}`, source: 'mg', name, singer: (song.singerList ?? song.singers ?? []).map((singer: any) => singer.name).filter(Boolean).join(' / '), interval: seconds ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : null, meta }
}

async function detail(context: ProviderContext, track: LX.Music.MusicInfoOnline): Promise<MiguMeta> {
  const current = track.meta as MiguMeta
  if (current.contentId && current.copyrightId) return current
  if (current.upstreamSongId) {
    const body = await request(context, '/MIGUM3.0/resource/song/by-songids/v2.0', { songId: current.upstreamSongId })
    const songs: any[] = Array.isArray(body.data) ? body.data : []
    const info = toTrack(songs.find(item => String(item.songId) === current.upstreamSongId))
    if (info?.meta.contentId) return info.meta
  }
  // Existing LX tracks identify Migu songs by copyrightId, whereas the v5
  // song detail route accepts the internal songId. Resolve the same recording.
  const candidates = await search(context, track)
  const copyright = String(current.copyrightId || current.songId)
  const exact = candidates.find(item => String(item.meta.copyrightId) === copyright)
  const match = exact ? { status: 'matched' as const, track: exact } : chooseMatch(track, candidates)
  if (match.status !== 'matched' || !(match.track.meta as MiguMeta).contentId) throw new Error('咪咕音乐未找到同一录音的完整歌曲标识')
  return match.track.meta as MiguMeta
}

async function search(context: ProviderContext, track: LX.Music.MusicInfo): Promise<LX.Music.MusicInfo_mg[]> {
  const body = await request(context, 'https://app.u.nf.migu.cn/pc/resource/song/item/search/v1.0', { text: `${track.name} ${track.singer}`, pageNo: 1, pageSize: 20 })
  const songs = Array.isArray(body) ? body : body.data
  if (!Array.isArray(songs)) throw new Error('咪咕音乐未返回搜索结果')
  return songs.map(toTrack).filter((song): song is LX.Music.MusicInfo_mg => song != null)
}

async function readPlaylist(context: ProviderContext, id: string): Promise<LX.Music.MusicInfoOnline[]> {
  const songs = new Map<string, LX.Music.MusicInfoOnline>()
  let offset = 0
  for (let page = 1; page <= 400; page++) {
    const body = await request(context, '/MIGUM3.0/resource/playlist/song/v2.0', { playlistId: id, pageNo: page, pageSize: 100 })
    if (!Array.isArray(body.data?.songList)) throw new Error('咪咕音乐未返回歌单曲目')
    const batch = body.data.songList
    for (const song of batch) { const track = toTrack(song); if (track) songs.set(track.id, track) }
    offset += batch.length
    if (offset >= Number(body.data.totalCount ?? offset)) return [...songs.values()]
    if (!batch.length) throw new Error('咪咕音乐歌单分页不完整')
  }
  throw new Error('咪咕音乐歌单超过同步上限')
}

export const miguProvider: PlatformProvider = {
  id: 'migu',
  source: 'mg',
  name: '咪咕音乐',
  loginUrl: 'https://music.migu.cn/v5/#/favorite',
  cookieUrl: 'https://music.migu.cn/',
  domains: ['migu.cn', 'cmpassport.com', 'chinamobile.com'],
  authenticated: cookies => Boolean(cookies.mg_auth_pacmtoken && cookies.mg_auth_uid),
  async profile(context): Promise<PlatformProfile> {
    const cookies = await context.cookies()
    if (!cookies.mg_auth_pacmtoken || !cookies.mg_auth_uid) throw new Error('请先登录咪咕音乐')
    const body = await request(context, 'https://c.musicapp.migu.cn/user/h5/user-info/v1.0')
    const user = record(body.data?.userInfo ?? body.data?.userInfoItem ?? body.data)
    const id = String(user.userId ?? user.uid ?? '')
    if (!id || id !== cookies.mg_auth_uid) throw new Error('咪咕音乐登录已失效，请重新登录')
    return { id, nickname: String(user.nickName ?? user.nickname ?? '咪咕用户'), avatar: image(user.imageUrl ?? user.avatar ?? user.middleIcon) }
  },
  async likes(context) {
    const body = await request(context, '/pc/user/home-page/v2.0')
    if (!Array.isArray(body.data?.userPrivateItems)) throw new Error('咪咕音乐未返回我喜欢的音乐')
    const favorite = body.data.userPrivateItems.find((item: any) => String(item.title ?? '').trim() === '喜欢的音乐')
    if (!favorite) return []
    const match = /(?:musicListId|playlistId)=([^&#]+)/.exec(String(favorite.actionUrl ?? ''))
    const id = String(favorite.musicListId ?? favorite.resId ?? match?.[1] ?? '')
    if (!id) throw new Error('咪咕音乐未返回红心歌单标识')
    return readPlaylist(context, id)
  },
  async playlists(context, user): Promise<PlatformPlaylist[]> {
    const body = await request(context, '/pc/user/home-page/v2.0')
    const lists = body.data?.myCreatedMusicLists?.createdMusicLists
    if (!Array.isArray(lists)) throw new Error('咪咕音乐未返回创建的歌单')
    return lists.filter((item: any) => !item.ownerId || String(item.ownerId) === user.id).map((item: any): PlatformPlaylist => {
      const remoteId = String(item.musicListId ?? '')
      return { id: `migu:${remoteId}`, platform: 'migu', ownerId: user.id, remoteId, name: String(item.title ?? '未命名歌单'), cover: image(item.imgItem?.img ?? item.img), count: Math.max(0, Number(item.musicNum ?? item.songNum) || 0), loaded: false, lastSync: null }
    }).filter((item: PlatformPlaylist) => item.remoteId)
  },
  async playlistTracks(context, user, playlist) {
    const body = await request(context, '/resource/playlist/v2.0', { playlistId: playlist.remoteId })
    if (String(body.data?.ownerId ?? '') !== user.id) throw new Error('歌单不属于当前咪咕音乐账号，请重新同步')
    return readPlaylist(context, playlist.remoteId)
  },
  search,
  async available(context, track) {
    const meta = await detail(context, track)
    // A paid catalogue entry can still be liked. Playback privileges are
    // checked separately by the official stream endpoint.
    return Boolean(meta.contentId && meta.copyrightId)
  },
  async musicQualitys(context, track) { return (await detail(context, track)).platformQualitys ?? ['128k'] },
  async musicUrl(context, track, quality): Promise<PlatformStream> {
    const meta = await detail(context, track)
    const levels = meta.platformQualitys?.length ? meta.platformQualitys : ['128k' as const]
    const eligible = levels.filter(level => qualityRank[level] <= qualityRank[quality]).sort((a, b) => qualityRank[b] - qualityRank[a])
    if (!eligible.length) eligible.push(levels[0])
    let denied = '咪咕音乐当前账号没有此歌曲的完整播放权限'
    for (const selected of eligible) {
      const toneFlag = toneFlags[selected]
      if (!toneFlag) continue
      let body: any
      try {
        body = await request(context, '/strategy/pc/listen/v2.0', { contentId: meta.contentId, copyrightId: meta.copyrightId, resourceType: meta.formatResourceTypes?.[selected] ?? meta.resourceType ?? '2', netType: '01', toneFlag, scene: '' }, { encrypted: true })
      } catch (error) {
        if (!(error instanceof Error) || !/音质|会员|权限|版权|完整|试听/.test(error.message)) throw error
        denied = error.message
        continue
      }
      const data = record(body.data)
      if (data.cannotCode || Number(data.auditionsLength) > 0) { denied = String(data.dialogInfo?.text ?? denied); continue }
      if (typeof data.url !== 'string' || !/^https?:\/\//.test(data.url)) { denied = '咪咕音乐没有返回可播放音频'; continue }
      const actualFlag = String(data.audioFormatType ?? data.formatType ?? data.toneFlag ?? '')
      const actualQuality = Object.entries(toneFlags).find(([, flag]) => flag === actualFlag)?.[0] as PlatformQuality | undefined
      // Older responses omit format metadata: only label the confirmed basic
      // quality rather than reporting a requested premium tier as delivered.
      const actual = actualQuality ?? '128k'
      return { url: data.url, type: legacyQuality(actual), quality: actual }
    }
    throw new Error(denied)
  },
  async like(context, _user, track, liked) {
    const meta = await detail(context, track)
    const body = liked
      ? await request(context, '/pc/user/api/add-music-list-song/v1.0', { contentIds: [meta.contentId] }, { post: true })
      : await request(context, '/pc/user/h5-import-musiclist/v1.0', { channel: '23', contentId: meta.contentId, songflag: '2' }, { post: true })
    if (liked && !(Number(body.data?.successNum) > 0) && !(body.data?.fail2RepeatContentIdList?.includes(meta.contentId))) throw new Error('咪咕音乐没有确认红心操作成功')
  },
}
