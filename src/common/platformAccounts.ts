export type PlatformId = 'qq' | 'netease' | 'kugou' | 'kuwo' | 'migu' | 'bilibili'

export const platformNames: Record<PlatformId, string> = { qq: 'QQ 音乐', netease: '网易云音乐', kugou: '酷狗音乐', kuwo: '酷我音乐', migu: '咪咕音乐', bilibili: '哔哩哔哩' }

export interface PlatformProfile {
  id: string
  nickname: string
  avatar: string
  extra?: Record<string, string>
}

export interface PlatformAccount {
  platform: PlatformId
  name: string
  connected: boolean
  profile: PlatformProfile | null
  lastSync: number | null
  count: number
  error: string
  notice?: string
  canSync?: boolean
}

export interface PlatformFavorite {
  key: string
  track: LX.Music.MusicInfoOnline
  platforms: Array<{ platform: PlatformId, track: LX.Music.MusicInfoOnline }>
}

export interface PlatformPlaylist {
  id: string
  platform: PlatformId
  ownerId: string
  remoteId: string
  name: string
  cover: string
  count: number
  lastSync: number | null
  loaded: boolean
}

export interface PlatformPlaylistDetail {
  playlist: PlatformPlaylist
  tracks: LX.Music.MusicInfoOnline[]
  cached: boolean
}

export interface PlatformSnapshot {
  accounts: PlatformAccount[]
  favorites: PlatformFavorite[]
  playlists?: PlatformPlaylist[]
}

export interface PlatformLikeResult {
  platform: PlatformId
  status: 'success' | 'unavailable' | 'unmatched' | 'ambiguous' | 'failed'
  message: string
  track?: LX.Music.MusicInfoOnline
}
