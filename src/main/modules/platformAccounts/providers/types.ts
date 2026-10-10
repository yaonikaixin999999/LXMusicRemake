import type { PlatformId, PlatformProfile, PlatformPlaylist } from '@common/platformAccounts'
import type { PlatformQuality, PlatformStream } from '@common/platformPlayback'

export interface ProviderContext {
  session: Electron.Session
  cookies: () => Promise<Record<string, string>>
}

export interface PlatformProvider {
  id: PlatformId
  name: string
  loginUrl: string
  cookieUrl?: string
  domains: string[]
  source: LX.OnlineSource
  webOnly?: boolean
  syncSupported?: boolean
  notice?: string
  logout?: (context: ProviderContext) => Promise<void>
  authenticated?: (cookies: Record<string, string>) => boolean
  profile: (context: ProviderContext) => Promise<PlatformProfile>
  likes: (context: ProviderContext, profile: PlatformProfile) => Promise<LX.Music.MusicInfoOnline[]>
  playlists?: (context: ProviderContext, profile: PlatformProfile) => Promise<PlatformPlaylist[]>
  playlistTracks?: (context: ProviderContext, profile: PlatformProfile, playlist: PlatformPlaylist) => Promise<LX.Music.MusicInfoOnline[]>
  search: (context: ProviderContext, track: LX.Music.MusicInfo) => Promise<LX.Music.MusicInfoOnline[]>
  available: (context: ProviderContext, track: LX.Music.MusicInfoOnline) => Promise<boolean>
  musicQualitys?: (context: ProviderContext, track: LX.Music.MusicInfoOnline) => Promise<PlatformQuality[]>
  musicUrl?: (context: ProviderContext, track: LX.Music.MusicInfoOnline, quality: PlatformQuality) => Promise<PlatformStream>
  like: (context: ProviderContext, profile: PlatformProfile, track: LX.Music.MusicInfoOnline, liked: boolean) => Promise<void>
}
