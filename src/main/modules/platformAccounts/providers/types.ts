import type { PlatformId, PlatformProfile } from '@common/platformAccounts'

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
  profile: (context: ProviderContext) => Promise<PlatformProfile>
  likes: (context: ProviderContext, profile: PlatformProfile) => Promise<LX.Music.MusicInfoOnline[]>
  search: (context: ProviderContext, track: LX.Music.MusicInfo) => Promise<LX.Music.MusicInfoOnline[]>
  available: (context: ProviderContext, track: LX.Music.MusicInfoOnline) => Promise<boolean>
  like: (context: ProviderContext, profile: PlatformProfile, track: LX.Music.MusicInfoOnline, liked: boolean) => Promise<void>
}
