export type PlatformId = 'qq' | 'netease'

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
}

export interface PlatformFavorite {
  key: string
  track: LX.Music.MusicInfoOnline
  platforms: Array<{ platform: PlatformId, track: LX.Music.MusicInfoOnline }>
}

export interface PlatformSnapshot {
  accounts: PlatformAccount[]
  favorites: PlatformFavorite[]
}

export interface PlatformLikeResult {
  platform: PlatformId
  status: 'success' | 'unavailable' | 'unmatched' | 'ambiguous' | 'failed'
  message: string
  track?: LX.Music.MusicInfoOnline
}
